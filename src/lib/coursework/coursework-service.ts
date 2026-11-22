import "server-only";

import { randomUUID } from "node:crypto";
import { NotificationCategory, NotificationChannel, PublicationState, Role, HomeworkSubmissionState, GradeRevisionState, AssessmentState } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { prisma } from "@/lib/prisma";
import { parseMoscowDateTime } from "@/lib/tasks/tasks-core";
import { allowedFormats, homeworkCalendarProjectionId, publishedHomeworkNoticeKey, studentHomeworkScope, studentMaterialScope, validExternalUrl, validHomeworkSubmission } from "./coursework-core";

export class CourseworkInputError extends Error {}
export class CourseworkAccessError extends Error {}
export class CourseworkConflictError extends Error {}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeAssignment = (now: Date) => ({ AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] });
const clean = (value: unknown, max: number, required = true) => {
  if (typeof value !== "string") { if (!required && (value === null || value === undefined)) return null; throw new CourseworkInputError("Проверьте обязательные поля."); }
  const result = value.trim();
  if ((!result && required) || result.length > max) throw new CourseworkInputError("Проверьте обязательные поля и допустимую длину текста.");
  return result || null;
};
function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new CourseworkInputError("Укажите корректный срок.");
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new CourseworkInputError("Укажите корректный срок.");
  try { return parseMoscowDateTime(match[1]!, `${match[2]}:${match[3]}`).value; } catch { throw new CourseworkInputError("Укажите корректный срок."); }
}
function bool(value: unknown) { return value === true || value === "true" || value === "on"; }

async function teacherAssignments(teacherId: string, now: Date) {
  return prisma.teacherAssignment.findMany({ where: { teacherId, ...activeAssignment(now), teacher: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } } }, select: { id: true, courseId: true, groupId: true, course: { select: { subject: { select: { name: true } } } }, group: { select: { code: true } } }, orderBy: [{ course: { subject: { name: "asc" } } }, { group: { code: "asc" } }] });
}
function assignmentPairs(assignments: Array<{ courseId: string; groupId: string }>) { return assignments.map(({ courseId, groupId }) => ({ courseId, groupId })); }

export async function getCurrentStudentMaterials() {
  const student = await requireRole(Role.STUDENT);
  const now = new Date();
  const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(student.id, now), select: { groupId: true, group: { select: { code: true } } }, take: 2 });
  if (memberships.length !== 1) return { state: memberships.length ? "AMBIGUOUS" as const : "MISSING" as const, groupCode: null, materials: [] };
  const rows = await prisma.material.findMany({
    where: studentMaterialScope(memberships[0]!.groupId),
    orderBy: [{ folder: { name: "asc" } }, { publishedAt: "desc" }, { title: "asc" }],
    select: { id: true, title: true, description: true, externalUrl: true, publishedAt: true, folder: { select: { name: true } }, course: { select: { subject: { select: { name: true } } } }, author: { select: { profile: { select: { displayName: true } } } }, files: { select: { id: true, fileName: true, mimeType: true, byteSize: true } } },
  });
  return { state: "READY" as const, groupCode: memberships[0]!.group.code, materials: rows.map((row) => ({ ...row, teacherName: row.author.profile?.displayName ?? "Преподаватель", courseName: row.course.subject.name, author: undefined, course: undefined, files: row.files.map((file) => ({ ...file, byteSize: file.byteSize.toString() })) })) };
}

export async function getCurrentTeacherMaterials() {
  const teacher = await requireRole(Role.TEACHER);
  const assignments = await teacherAssignments(teacher.id, new Date());
  if (!assignments.length) return { assignments: [], folders: [], materials: [] };
  const pairs = assignmentPairs(assignments);
  const [folders, materials] = await Promise.all([
    prisma.materialFolder.findMany({ where: { authorId: teacher.id, OR: pairs }, include: { group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } }, orderBy: [{ name: "asc" }] }),
    prisma.material.findMany({ where: { OR: pairs.map(({ courseId, groupId }) => ({ courseId, audiences: { some: { groupId } } })) }, include: { audiences: { include: { group: { select: { id: true, code: true } } } }, files: true, folder: { select: { id: true, name: true, groupId: true } }, course: { select: { subject: { select: { name: true } } } } }, orderBy: [{ publishedAt: "desc" }, { title: "asc" }] }),
  ]);
  return { assignments: assignments.map((row) => ({ id: row.id, courseId: row.courseId, groupId: row.groupId, courseName: row.course.subject.name, groupCode: row.group.code })), folders, materials: materials.map((item) => ({ ...item, canManage: item.authorId === teacher.id, files: item.files.map((file) => ({ ...file, byteSize: file.byteSize.toString() })) })) };
}

export async function createMaterialFolder(input: { courseId: unknown; groupId: unknown; name: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const name = clean(input.name, 160)!; const courseId = String(input.courseId ?? ""); const groupId = String(input.groupId ?? "");
  if (!uuid.test(courseId) || !uuid.test(groupId)) throw new CourseworkInputError("Выберите дисциплину и группу.");
  const assignment = await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, courseId, groupId, ...activeAssignment(new Date()) }, select: { id: true } });
  if (!assignment) throw new CourseworkAccessError("Нет права создавать папку для этой дисциплины и группы.");
  return prisma.materialFolder.upsert({ where: { courseId_groupId_name: { courseId, groupId, name } }, create: { courseId, groupId, authorId: teacher.id, name }, update: {} });
}

export async function saveTeacherMaterial(input: { materialId?: unknown; expectedVersion?: unknown; courseId: unknown; groupIds: unknown[]; folderId?: unknown; title: unknown; description: unknown; externalUrl: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const courseId = String(input.courseId ?? ""); const title = clean(input.title, 240)!; const description = clean(input.description, 10000, false); const url = input.externalUrl ? validExternalUrl(input.externalUrl) : null;
  if (!uuid.test(courseId) || input.externalUrl && !url) throw new CourseworkInputError("Выберите дисциплину и укажите корректную HTTPS-ссылку.");
  const groupIds = [...new Set(input.groupIds.map(String))];
  if (!groupIds.length || groupIds.some((id) => !uuid.test(id))) throw new CourseworkInputError("Выберите хотя бы одну группу.");
  const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id, courseId, groupId: { in: groupIds }, ...activeAssignment(new Date()) }, select: { groupId: true } });
  if (assignments.length !== groupIds.length) throw new CourseworkAccessError("Материал можно назначить только своим группам по этой дисциплине.");
  const folderId = input.folderId ? String(input.folderId) : null;
  if (folderId) { const folder = await prisma.materialFolder.findFirst({ where: { id: folderId, authorId: teacher.id, courseId, groupId: { in: groupIds } }, select: { id: true } }); if (!folder) throw new CourseworkAccessError("Папка не принадлежит выбранной дисциплине и группе."); }
  const data = { title, description, externalUrl: url, folderId, version: { increment: 1 } };
  return prisma.$transaction(async (tx) => {
    let id: string;
    if (input.materialId) {
      const existing = await tx.material.findFirst({ where: { id: String(input.materialId), authorId: teacher.id, courseId }, select: { id: true, version: true, state: true } });
      if (!existing || !Number.isInteger(input.expectedVersion) || existing.version !== input.expectedVersion) throw new CourseworkConflictError("Материал изменился или недоступен. Обновите страницу.");
      const updated = await tx.material.updateMany({ where: { id: existing.id, authorId: teacher.id, version: existing.version }, data });
      if (updated.count !== 1) throw new CourseworkConflictError("Материал уже изменён.");
      id = existing.id;
      await tx.materialAudience.deleteMany({ where: { materialId: id } });
      if (existing.state === PublicationState.PUBLISHED) {
        const aggregate = await tx.publicationVersion.aggregate({ where: { materialId: id }, _max: { number: true } });
        const current = await tx.material.findUniqueOrThrow({ where: { id }, select: { title: true, description: true, externalUrl: true, publishedAt: true } });
        await tx.publicationVersion.create({ data: { materialId: id, number: (aggregate._max.number ?? 0) + 1, state: PublicationState.PUBLISHED, content: current, publishedAt: current.publishedAt } });
      }
    } else {
      const created = await tx.material.create({ data: { courseId, authorId: teacher.id, title, description, externalUrl: url, folderId } }); id = created.id;
    }
    await tx.materialAudience.createMany({ data: groupIds.map((groupId) => ({ materialId: id, groupId })) });
    if (input.materialId) {
      const current = await tx.material.findUniqueOrThrow({ where: { id }, select: { state: true, version: true, title: true } });
      if (current.state === PublicationState.PUBLISHED) {
        const notice = await tx.notification.upsert({ where: { eventKey: `material:${id}:updated:v${current.version}` }, create: { category: NotificationCategory.COURSE_ANNOUNCEMENT, sourceType: "MATERIAL", sourceId: id, eventKey: `material:${id}:updated:v${current.version}`, title: "Обновлён учебный материал", body: `Обновлён материал «${current.title}».` }, update: {} });
        const members = await tx.groupMembership.findMany({ where: { groupId: { in: groupIds }, student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { studentId: true } });
        for (const member of members) { const pref = await tx.notificationPreference.findUnique({ where: { userId_category: { userId: member.studentId, category: NotificationCategory.COURSE_ANNOUNCEMENT } }, select: { muted: true } }); if (!pref?.muted) await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: member.studentId, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: member.studentId }, update: {} }); }
      }
    }
    return { id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function attachTeacherMaterialFile(input: { materialId: unknown; objectKey: string; fileName: string; mimeType: string; byteSize: number }) {
  const teacher = await requireRole(Role.TEACHER); const materialId = String(input.materialId ?? "");
  if (!uuid.test(materialId) || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1) throw new CourseworkInputError("Некорректный файл.");
  const material = await prisma.material.findFirst({ where: { id: materialId, authorId: teacher.id, state: PublicationState.DRAFT, audiences: { some: { group: { assignments: { some: { teacherId: teacher.id } } } } } }, select: { id: true } });
  if (!material) throw new CourseworkAccessError("Файл можно добавить только к своему черновику материала.");
  return prisma.materialFile.create({ data: { materialId, objectKey: input.objectKey, fileName: input.fileName, mimeType: input.mimeType, byteSize: BigInt(input.byteSize) } });
}

export async function saveStudentFileSubmission(input: { homeworkId: unknown; objectKey: string; fileName: string; mimeType: string; byteSize: number; submit: boolean }) {
  const student = await requireRole(Role.STUDENT); const homeworkId = String(input.homeworkId ?? "");
  if (!uuid.test(homeworkId) || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1) throw new CourseworkInputError("Некорректный файл.");
  const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(student.id, new Date()), select: { groupId: true }, take: 2 });
  if (memberships.length !== 1) throw new CourseworkAccessError("Не удалось определить активную учебную группу.");
  const homework = await prisma.homework.findFirst({ where: { id: homeworkId, state: PublicationState.PUBLISHED, publishedAt: { not: null }, allowFile: true, ...studentHomeworkScope(memberships[0]!.groupId) }, select: { id: true, title: true, courseId: true } });
  if (!homework) throw new CourseworkAccessError("Задание не найдено или загрузка файла не разрешена.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    let submission = await tx.submission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId: student.id } }, select: { id: true, state: true } });
    if (submission?.state === HomeworkSubmissionState.UNDER_REVIEW || submission?.state === HomeworkSubmissionState.CHECKED) throw new CourseworkConflictError("Работа уже отправлена или проверена. Повторная отправка доступна после возврата на доработку.");
    if (!submission) submission = await tx.submission.create({ data: { homeworkId, studentId: student.id }, select: { id: true, state: true } });
    const revision = await tx.submissionRevision.create({ data: { submissionId: submission.id, objectKey: input.objectKey, fileName: input.fileName, mimeType: input.mimeType, byteSize: BigInt(input.byteSize), submittedAt: input.submit ? now : null } });
    if (input.submit) {
      await tx.submission.update({ where: { id: submission.id }, data: { state: HomeworkSubmissionState.UNDER_REVIEW, submittedAt: now, version: { increment: 1 } } });
      const teachers = await tx.teacherAssignment.findMany({ where: { courseId: homework.courseId, groupId: memberships[0]!.groupId }, select: { teacherId: true } });
      const eventKey = `homework:${homework.id}:submission:${submission.id}:revision:${revision.id}`;
      const notice = await tx.notification.upsert({ where: { eventKey }, create: { category: NotificationCategory.HOMEWORK, sourceType: "HOMEWORK", sourceId: homework.id, eventKey, title: "Работа отправлена на проверку", body: `Студент отправил файл по заданию «${homework.title}».` }, update: {} });
      for (const teacher of teachers) await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: teacher.teacherId, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: teacher.teacherId }, update: {} });
    }
    return { id: submission.id, revisionId: revision.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function publishTeacherMaterial(materialId: string, publish: boolean) {
  const teacher = await requireRole(Role.TEACHER);
  if (!uuid.test(materialId)) throw new CourseworkInputError("Некорректный материал.");
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findFirst({ where: { id: materialId, authorId: teacher.id, audiences: { some: { group: { assignments: { some: { teacherId: teacher.id, ...activeAssignment(new Date()) } } } } } }, include: { audiences: { select: { groupId: true } } } });
    if (!material) throw new CourseworkAccessError("Материал не найден в ваших группах.");
    const nextState = publish ? PublicationState.PUBLISHED : PublicationState.WITHDRAWN;
    if (material.state === nextState) return;
    const updated = await tx.material.updateMany({ where: { id: material.id, authorId: teacher.id, version: material.version }, data: { state: nextState, publishedAt: publish ? new Date() : material.publishedAt, version: { increment: 1 } } });
    if (updated.count !== 1) throw new CourseworkConflictError("Материал изменился. Обновите страницу.");
    const aggregate = await tx.publicationVersion.aggregate({ where: { materialId }, _max: { number: true } }); const number = (aggregate._max.number ?? 0) + 1;
    await tx.publicationVersion.create({ data: { materialId, number, state: nextState, content: { title: material.title, description: material.description, externalUrl: material.externalUrl }, publishedAt: publish ? new Date() : null } });
    if (publish) {
      const userIds = await tx.groupMembership.findMany({ where: { groupId: { in: material.audiences.map((row) => row.groupId) }, student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { studentId: true } });
      const notice = await tx.notification.upsert({ where: { eventKey: `material:${material.id}:published:v${number}` }, create: { category: NotificationCategory.COURSE_ANNOUNCEMENT, sourceType: "MATERIAL", sourceId: material.id, eventKey: `material:${material.id}:published:v${number}`, title: "Опубликован учебный материал", body: `Опубликован материал «${material.title}».` }, update: {} });
      for (const { studentId } of userIds) { const preference = await tx.notificationPreference.findUnique({ where: { userId_category: { userId: studentId, category: NotificationCategory.COURSE_ANNOUNCEMENT } }, select: { muted: true } }); if (!preference?.muted) await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: studentId, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: studentId, channel: NotificationChannel.IN_APP }, update: {} }); }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function removeTeacherMaterial(materialId: string): Promise<"deleted" | "withdrawn"> {
  const teacher = await requireRole(Role.TEACHER);
  if (!uuid.test(materialId)) throw new CourseworkInputError("Некорректный материал.");
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findFirst({ where: { id: materialId, authorId: teacher.id }, select: { id: true, title: true, state: true, version: true } });
    if (!material) throw new CourseworkAccessError("Материал не найден.");
    const [fileCount, versionCount, homeworkCount] = await Promise.all([
      tx.materialFile.count({ where: { materialId } }),
      tx.publicationVersion.count({ where: { materialId } }),
      tx.homeworkMaterial.count({ where: { materialId } }),
    ]);
    if (material.state !== PublicationState.DRAFT || fileCount > 0 || versionCount > 0 || homeworkCount > 0) {
      if (material.state !== PublicationState.WITHDRAWN) {
        const updated = await tx.material.updateMany({ where: { id: material.id, authorId: teacher.id, version: material.version }, data: { state: PublicationState.WITHDRAWN, version: { increment: 1 } } });
        if (!updated.count) throw new CourseworkConflictError("Материал изменился. Обновите страницу.");
        const latest = await tx.publicationVersion.aggregate({ where: { materialId }, _max: { number: true } });
        await tx.publicationVersion.create({ data: { materialId, number: (latest._max.number ?? 0) + 1, state: PublicationState.WITHDRAWN, content: { title: material.title, withdrawn: true } } });
      }
      return "withdrawn";
    }
    await tx.materialAudience.deleteMany({ where: { materialId } });
    await tx.material.delete({ where: { id: materialId } });
    return "deleted";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getStudentHomeworkList(now = new Date()) {
  const student = await requireRole(Role.STUDENT); const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(student.id, now), select: { groupId: true, group: { select: { code: true } } }, take: 2 });
  if (memberships.length !== 1) return { state: memberships.length ? "AMBIGUOUS" as const : "MISSING" as const, groupCode: null, items: [] };
  const groupId = memberships[0]!.groupId;
  const rows = await prisma.homework.findMany({ where: { state: PublicationState.PUBLISHED, publishedAt: { not: null }, ...studentHomeworkScope(groupId) }, orderBy: [{ deadline: "asc" }, { title: "asc" }], include: { course: { select: { subject: { select: { name: true } } } }, author: { select: { profile: { select: { displayName: true } } } }, assessment: { select: { id: true, groupId: true } }, submissions: { where: { studentId: student.id }, include: { revisions: { orderBy: { createdAt: "desc" }, take: 1 }, reviews: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  const items = await Promise.all(rows.filter((row) => !row.assessment || row.assessment.groupId === groupId).map(async (row) => ({ id: row.id, title: row.title, instructions: row.instructions, criteria: row.criteria, deadline: row.deadline, allowText: row.allowText, allowFile: row.allowFile, allowLink: row.allowLink, courseName: row.course.subject.name, teacherName: row.author.profile?.displayName ?? "Преподаватель", state: row.submissions[0]?.state ?? null, submissionId: row.submissions[0]?.id ?? null, revision: row.submissions[0]?.revisions[0] ? { ...row.submissions[0].revisions[0], byteSize: row.submissions[0].revisions[0].byteSize?.toString() ?? null } : null, feedback: row.submissions[0]?.feedback ?? null, grade: row.assessment ? await prisma.gradebookEntry.findFirst({ where: { assessmentId: row.assessment.id, studentId: student.id, currentRevision: { state: GradeRevisionState.PUBLISHED, publishedAt: { not: null } } }, select: { currentRevision: { select: { score: true } } } }).then((entry) => entry?.currentRevision?.score.toString() ?? null) : null })));
  return { state: "READY" as const, groupCode: memberships[0]!.group.code, items };
}

export async function getStudentHomeworkDetail(homeworkId: string) {
  const student = await requireRole(Role.STUDENT); const now = new Date(); const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(student.id, now), select: { groupId: true }, take: 2 });
  if (memberships.length !== 1) throw new CourseworkAccessError("Не удалось определить вашу активную группу.");
  const row = await prisma.homework.findFirst({
    where: { id: homeworkId, state: PublicationState.PUBLISHED, publishedAt: { not: null }, ...studentHomeworkScope(memberships[0]!.groupId) },
    include: {
      course: { select: { subject: { select: { name: true } } } },
      author: { select: { profile: { select: { displayName: true } } } },
      attachedMaterials: { where: { material: { state: PublicationState.PUBLISHED } }, include: { material: { select: { id: true, title: true } } } },
      submissions: { where: { studentId: student.id }, include: {
        revisions: { orderBy: { createdAt: "desc" } },
        reviews: { orderBy: { createdAt: "asc" }, include: { revision: { select: { id: true } }, reviewer: { select: { profile: { select: { displayName: true } } } } } },
      } },
    },
  });
  if (!row) throw new CourseworkAccessError("Задание не найдено.");
  const submission = row.submissions[0]; const assessment = row.assessmentId ? await prisma.assessment.findUnique({ where: { id: row.assessmentId }, select: { id: true, groupId: true } }) : null;
  const entry = assessment?.groupId === memberships[0]!.groupId ? await prisma.gradebookEntry.findFirst({ where: { assessmentId: assessment.id, studentId: student.id, currentRevision: { state: GradeRevisionState.PUBLISHED, publishedAt: { not: null } } }, select: { currentRevision: { select: { score: true } } } }) : null;
  return { id: row.id, title: row.title, instructions: row.instructions, criteria: row.criteria, deadline: row.deadline, allowText: row.allowText, allowFile: row.allowFile, allowLink: row.allowLink, courseName: row.course.subject.name, teacherName: row.author.profile?.displayName ?? "Преподаватель", attachedMaterials: row.attachedMaterials.map(({ material }) => material), submission: submission ? { id: submission.id, state: submission.state, feedback: submission.feedback, revisions: submission.revisions.map((rev) => ({ id: rev.id, createdAt: rev.createdAt, submittedAt: rev.submittedAt, textContent: rev.textContent, externalUrl: rev.externalUrl, fileName: rev.fileName, mimeType: rev.mimeType, byteSize: rev.byteSize?.toString() ?? null })), reviews: submission.reviews.map((review) => ({ id: review.id, state: review.state, comment: review.comment, createdAt: review.createdAt, reviewerName: review.reviewer.profile?.displayName ?? "Преподаватель", revisionId: review.revisionId })) } : null, grade: entry?.currentRevision?.score.toString() ?? null };
}

export async function createOrUpdateHomework(input: { homeworkId?: unknown; version?: unknown; assignmentId: unknown; title: unknown; instructions: unknown; criteria: unknown; deadline: unknown; allowText: unknown; allowFile: unknown; allowLink: unknown; componentId: unknown; materialIds: unknown[] }) {
  const teacher = await requireRole(Role.TEACHER); const assignmentId = String(input.assignmentId ?? ""); if (!uuid.test(assignmentId)) throw new CourseworkInputError("Выберите свою дисциплину и группу.");
  const [title, instructions, criteria] = [clean(input.title, 240)!, clean(input.instructions, 10000)!, clean(input.criteria, 5000, false)]; const deadline = parseDate(input.deadline); const formats = { allowText: bool(input.allowText), allowFile: bool(input.allowFile), allowLink: bool(input.allowLink) };
  if (!Object.values(formats).some(Boolean)) throw new CourseworkInputError("Разрешите хотя бы один формат ответа.");
  // Resolve the submitted assignment ID from PostgreSQL and re-check ownership.
  const row = await prisma.teacherAssignment.findFirst({ where: { id: assignmentId, teacherId: teacher.id, ...activeAssignment(new Date()) }, select: { id: true, courseId: true, groupId: true } });
  if (!row) throw new CourseworkAccessError("Назначение не принадлежит текущему преподавателю.");
  const materialIds = [...new Set(input.materialIds.map(String))];
  if (materialIds.some((id) => !uuid.test(id))) throw new CourseworkInputError("Некорректный связанный материал.");
  if (materialIds.length) {
    const materialCount = await prisma.material.count({ where: { id: { in: materialIds }, courseId: row.courseId, authorId: teacher.id, audiences: { some: { groupId: row.groupId } }, state: { not: PublicationState.WITHDRAWN } } });
    if (materialCount !== materialIds.length) throw new CourseworkAccessError("Прикреплять можно только свои материалы, доступные выбранной группе.");
  }
  let assessmentId: string | null = null;
  const componentId = input.componentId ? String(input.componentId) : "";
  if (componentId) {
    const structure = await prisma.assessmentStructureVersion.findFirst({ where: { courseId: row.courseId, publishedAt: { not: null }, weights: { some: { componentId } } }, orderBy: { version: "desc" }, select: { id: true, weights: { where: { componentId }, select: { componentId: true } } } });
    if (!uuid.test(componentId) || !structure?.weights.length) throw new CourseworkInputError("Компонент отсутствует в опубликованной структуре оценивания.");
  }
  return prisma.$transaction(async (tx) => {
    if (input.homeworkId) {
      const existing = await tx.homework.findFirst({ where: { id: String(input.homeworkId), authorId: teacher.id, courseId: row.courseId, OR: [{ groupId: row.groupId }, { groupId: null, assessment: { is: { groupId: row.groupId } } }] }, select: { id: true, groupId: true, version: true, state: true, assessmentId: true, deadline: true } });
      if (!existing || existing.version !== input.version || existing.state === PublicationState.WITHDRAWN) throw new CourseworkConflictError("Задание изменилось или недоступно.");
      const updated = await tx.homework.updateMany({ where: { id: existing.id, version: existing.version }, data: { groupId: existing.groupId ?? row.groupId, title, instructions, criteria, deadline, ...formats, version: { increment: 1 } } }); if (updated.count !== 1) throw new CourseworkConflictError("Задание изменилось.");
      if (existing.assessmentId) await tx.assessment.update({ where: { id: existing.assessmentId }, data: { title, version: { increment: 1 } } });
      await tx.homeworkMaterial.deleteMany({ where: { homeworkId: existing.id } });
      if (materialIds.length) await tx.homeworkMaterial.createMany({ data: materialIds.map((materialId) => ({ homeworkId: existing.id, materialId })) });
      if (existing.state === PublicationState.PUBLISHED) {
        if (deadline) await tx.academicCalendarEvent.updateMany({ where: { homeworkId: existing.id }, data: { startsAt: deadline } });
        else await tx.academicCalendarEvent.deleteMany({ where: { homeworkId: existing.id } });
        const snapshot = await tx.homework.findUniqueOrThrow({ where: { id: existing.id }, select: { title: true, instructions: true, criteria: true, deadline: true, allowText: true, allowFile: true, allowLink: true } });
        const versions = await tx.publicationVersion.aggregate({ where: { homeworkId: existing.id }, _max: { number: true } });
        await tx.publicationVersion.create({ data: { homeworkId: existing.id, number: (versions._max.number ?? 0) + 1, state: PublicationState.PUBLISHED, content: { ...snapshot, deadline: snapshot.deadline?.toISOString() ?? null }, publishedAt: new Date() } });
        if (existing.deadline?.getTime() !== deadline?.getTime() && row.groupId) await notifyHomeworkGroup(tx, existing.id, row.groupId, `homework:${existing.id}:deadline:v${existing.version + 1}`, "Изменён срок домашнего задания", `Обновлён срок задания «${title}».`);
      }
      return { id: existing.id };
    }
    if (componentId) {
      const structure = await tx.assessmentStructureVersion.findFirst({ where: { courseId: row.courseId, publishedAt: { not: null }, weights: { some: { componentId } } }, orderBy: { version: "desc" }, select: { id: true } });
      if (!structure) throw new CourseworkInputError("Компонент оценивания недоступен.");
      const assessment = await tx.assessment.create({ data: { courseId: row.courseId, groupId: row.groupId, componentId, structureVersionId: structure.id, authorId: teacher.id, title, state: AssessmentState.DRAFT } }); assessmentId = assessment.id;
    }
    const homework = await tx.homework.create({ data: { courseId: row.courseId, groupId: row.groupId, authorId: teacher.id, assessmentId, title, instructions, criteria, deadline, ...formats } });
    if (materialIds.length) await tx.homeworkMaterial.createMany({ data: materialIds.map((materialId) => ({ homeworkId: homework.id, materialId })) });
    return { id: homework.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function notifyHomeworkGroup(tx: Prisma.TransactionClient, homeworkId: string, groupId: string, eventKey: string, title: string, body: string) {
  const notice = await tx.notification.upsert({ where: { eventKey }, create: { category: NotificationCategory.HOMEWORK, sourceType: "HOMEWORK", sourceId: homeworkId, eventKey, title, body }, update: {} });
  const now = new Date();
  const memberships = await tx.groupMembership.findMany({ where: { groupId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { studentId: true } });
  for (const { studentId } of memberships) { const pref = await tx.notificationPreference.findUnique({ where: { userId_category: { userId: studentId, category: NotificationCategory.HOMEWORK } }, select: { muted: true } }); if (!pref?.muted) await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: studentId, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: studentId }, update: {} }); }
}

export async function publishHomework(homeworkId: string, publish: boolean) {
  const teacher = await requireRole(Role.TEACHER); if (!uuid.test(homeworkId)) throw new CourseworkInputError("Некорректное задание.");
  return prisma.$transaction(async (tx) => {
    const assignmentScope = { teacherId: teacher.id, ...activeAssignment(new Date()) };
    const homework = await tx.homework.findFirst({ where: { id: homeworkId, authorId: teacher.id, OR: [{ group: { assignments: { some: assignmentScope } } }, { groupId: null, assessment: { is: { group: { assignments: { some: assignmentScope } } } } }] }, select: { id: true, courseId: true, groupId: true, assessment: { select: { groupId: true } }, title: true, deadline: true, state: true, publishedAt: true, version: true, assessmentId: true } });
    const groupId = homework?.groupId ?? homework?.assessment?.groupId;
    if (!homework || !groupId) throw new CourseworkAccessError("Задание недоступно преподавателю.");
    const state = publish ? PublicationState.PUBLISHED : PublicationState.WITHDRAWN; if (homework.state === state) return;
    const now = new Date(); const updated = await tx.homework.updateMany({ where: { id: homeworkId, authorId: teacher.id, version: homework.version }, data: { groupId, state, publishedAt: publish ? now : homework.publishedAt, version: { increment: 1 } } }); if (!updated.count) throw new CourseworkConflictError("Задание уже изменилось.");
    const pv = await tx.publicationVersion.aggregate({ where: { homeworkId }, _max: { number: true } }); const number = (pv._max.number ?? 0) + 1;
    const snap = await tx.homework.findUniqueOrThrow({ where: { id: homeworkId }, select: { title: true, instructions: true, criteria: true, deadline: true, publishedAt: true, allowText: true, allowFile: true, allowLink: true } });
    await tx.publicationVersion.create({ data: { homeworkId, number, state, content: { ...snap, deadline: snap.deadline?.toISOString() ?? null }, publishedAt: publish ? now : null } });
    if (homework.assessmentId) await tx.assessment.update({ where: { id: homework.assessmentId }, data: { state: publish ? AssessmentState.PUBLISHED : AssessmentState.CLOSED, publishedAt: publish ? now : null, version: { increment: 1 } } });
    if (publish) {
      if (homework.assessmentId) { const members = await tx.groupMembership.findMany({ where: { groupId, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] }, select: { studentId: true } }); for (const member of members) await tx.gradebookEntry.upsert({ where: { assessmentId_studentId: { assessmentId: homework.assessmentId, studentId: member.studentId } }, create: { assessmentId: homework.assessmentId, studentId: member.studentId }, update: {} }); }
      if (homework.deadline) { const members = await tx.groupMembership.findMany({ where: { groupId }, select: { studentId: true } }); for (const member of members) await tx.academicCalendarEvent.upsert({ where: { userId_sourceType_sourceId: { userId: member.studentId, sourceType: "HOMEWORK", sourceId: homework.id } }, create: { userId: member.studentId, kind: "HOMEWORK_DEADLINE", sourceType: "HOMEWORK", sourceId: homework.id, startsAt: homework.deadline, homeworkId: homework.id }, update: { startsAt: homework.deadline, homeworkId: homework.id, kind: "HOMEWORK_DEADLINE" } }); }
      await notifyHomeworkGroup(tx, homework.id, groupId, publishedHomeworkNoticeKey(homework.id, number), "Новое домашнее задание", `Опубликовано задание «${homework.title}».`);
    } else {
      await tx.academicCalendarEvent.deleteMany({ where: { homeworkId: homework.id } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function saveStudentSubmission(input: { homeworkId: unknown; text: unknown; link: unknown; submit: boolean }) {
  const student = await requireRole(Role.STUDENT); const homeworkId = String(input.homeworkId ?? ""); if (!uuid.test(homeworkId)) throw new CourseworkInputError("Некорректное задание.");
  const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(student.id, new Date()), select: { groupId: true }, take: 2 }); if (memberships.length !== 1) throw new CourseworkAccessError("Не удалось определить активную учебную группу.");
  const homework = await prisma.homework.findFirst({ where: { id: homeworkId, state: PublicationState.PUBLISHED, publishedAt: { not: null }, ...studentHomeworkScope(memberships[0]!.groupId) }, select: { id: true, title: true, groupId: true, allowText: true, allowLink: true, allowFile: true } }); if (!homework) throw new CourseworkAccessError("Задание недоступно.");
  const checked = validHomeworkSubmission({ text: input.text, link: input.link, hasFile: false, allowText: homework.allowText, allowLink: homework.allowLink, allowFile: homework.allowFile }); if (!checked.ok || checked.format === "FILE") throw new CourseworkInputError(checked.ok ? "Для файла используйте форму загрузки." : checked.reason);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    let submission = await tx.submission.findUnique({ where: { homeworkId_studentId: { homeworkId, studentId: student.id } }, select: { id: true, state: true, version: true } });
    if (submission?.state === HomeworkSubmissionState.UNDER_REVIEW || submission?.state === HomeworkSubmissionState.CHECKED) throw new CourseworkConflictError("Работа уже отправлена или проверена. Повторная отправка доступна после возврата на доработку.");
    if (!submission) submission = await tx.submission.create({ data: { homeworkId, studentId: student.id }, select: { id: true, state: true, version: true } });
    const revision = await tx.submissionRevision.create({ data: { submissionId: submission.id, textContent: checked.format === "TEXT" ? checked.text : null, externalUrl: checked.format === "LINK" ? checked.link : null, submittedAt: input.submit ? now : null } });
    if (input.submit) { await tx.submission.update({ where: { id: submission.id }, data: { state: HomeworkSubmissionState.UNDER_REVIEW, submittedAt: now, version: { increment: 1 } } }); const teachers = await tx.teacherAssignment.findMany({ where: { courseId: (await tx.homework.findUniqueOrThrow({ where: { id: homeworkId }, select: { courseId: true } })).courseId, groupId: memberships[0]!.groupId }, select: { teacherId: true } }); const notice = await tx.notification.upsert({ where: { eventKey: `homework:${homeworkId}:submission:${submission.id}:revision:${revision.id}` }, create: { category: NotificationCategory.HOMEWORK, sourceType: "HOMEWORK", sourceId: homeworkId, eventKey: `homework:${homeworkId}:submission:${submission.id}:revision:${revision.id}`, title: "Работа отправлена на проверку", body: `Студент отправил работу по заданию «${homework.title}».` }, update: {} }); for (const teacher of teachers) await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: teacher.teacherId, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: teacher.teacherId }, update: {} }); }
    return { id: submission.id, revisionId: revision.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getTeacherHomeworkWorkspace() {
  const teacher = await requireRole(Role.TEACHER); const assignments = await teacherAssignments(teacher.id, new Date()); const pairs = assignmentPairs(assignments);
  if (!pairs.length) return { assignments: [], componentOptions: [], materials: [], homeworks: [] };
  const [structures, rows, materials, memberships] = await Promise.all([
    prisma.assessmentStructureVersion.findMany({ where: { courseId: { in: [...new Set(pairs.map((p) => p.courseId))] }, publishedAt: { not: null } }, orderBy: [{ courseId: "asc" }, { version: "desc" }], select: { id: true, courseId: true, weights: { select: { componentId: true, componentName: true } } } }),
    prisma.homework.findMany({
      where: { authorId: teacher.id, OR: pairs.map(({ courseId, groupId }) => ({ OR: [{ courseId, groupId }, { courseId, groupId: null, assessment: { is: { groupId } } }] })) },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      include: {
        course: { select: { subject: { select: { name: true } } } },
        group: { select: { code: true } },
        assessment: { select: { id: true, state: true, groupId: true, group: { select: { code: true } }, gradeEntries: { select: { studentId: true, revisions: { where: { state: GradeRevisionState.DRAFT }, orderBy: { createdAt: "desc" }, take: 1 } } } } },
        attachedMaterials: { select: { materialId: true } },
        submissions: { orderBy: [{ submittedAt: "desc" }], include: { student: { select: { id: true, login: true, profile: { select: { displayName: true } } } }, revisions: { orderBy: { createdAt: "desc" }, take: 1 }, reviews: { orderBy: { createdAt: "desc" }, take: 1 } } },
      },
    }),
    prisma.material.findMany({ where: { authorId: teacher.id, state: { not: PublicationState.WITHDRAWN }, OR: pairs.map(({ courseId, groupId }) => ({ courseId, audiences: { some: { groupId } } })) }, select: { id: true, courseId: true, title: true, audiences: { select: { groupId: true } } }, orderBy: [{ title: "asc" }] }),
    prisma.groupMembership.findMany({ where: { groupId: { in: [...new Set(pairs.map((pair) => pair.groupId))] }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { groupId: true, studentId: true } }),
  ]);
  const latestStructure = (courseId: string) => structures.find((item) => item.courseId === courseId);
  const groupsByCourse = new Map<string, string[]>();
  for (const { courseId, groupId } of pairs) {
    const groupIds = groupsByCourse.get(courseId) ?? [];
    if (!groupIds.includes(groupId)) groupIds.push(groupId);
    groupsByCourse.set(courseId, groupIds);
  }
  const componentOptions = [...groupsByCourse.entries()].flatMap(([courseId, groupIds]) =>
    latestStructure(courseId)?.weights.map((weight) => ({ courseId, groupIds, componentId: weight.componentId, componentName: weight.componentName })) ?? [],
  );
  const studentCounts = new Map<string, number>(); for (const membership of memberships) studentCounts.set(membership.groupId, (studentCounts.get(membership.groupId) ?? 0) + 1);
  const now = new Date();
  const homeworks = rows.map((row) => {
    const groupId = row.groupId ?? row.assessment?.groupId ?? null;
    const groupMembers = memberships.filter((membership) => membership.groupId === groupId);
    const overdueCount = row.deadline && row.deadline < now ? groupMembers.filter((member) => !row.submissions.some((submission) => submission.studentId === member.studentId && submission.submittedAt && submission.submittedAt <= row.deadline!)).length : 0;
    return { id: row.id, title: row.title, instructions: row.instructions, criteria: row.criteria, deadline: row.deadline, state: row.state, version: row.version, allowText: row.allowText, allowFile: row.allowFile, allowLink: row.allowLink, courseId: row.courseId, groupId, courseName: row.course.subject.name, groupCode: row.group?.code ?? row.assessment?.group.code ?? "Группа не указана", assessmentId: row.assessmentId, assessmentState: row.assessment?.state ?? null, assignedCount: groupId ? studentCounts.get(groupId) ?? 0 : 0, submittedCount: row.submissions.filter((submission) => submission.submittedAt !== null).length, overdueCount, attachedMaterialIds: row.attachedMaterials.map((item) => item.materialId), componentOptions: latestStructure(row.courseId)?.weights.map((w) => ({ componentId: w.componentId, componentName: w.componentName })) ?? [], submissions: row.submissions.map((s) => { const entry = row.assessment?.gradeEntries.find((candidate) => candidate.studentId === s.studentId); return { id: s.id, studentId: s.studentId, studentName: s.student.profile?.displayName ?? s.student.login, state: s.state, submittedAt: s.submittedAt, feedback: s.feedback, pendingGradeRevisionId: entry?.revisions[0]?.id ?? null, pendingGrade: entry?.revisions[0]?.score.toString() ?? null, revision: s.revisions[0] ? { ...s.revisions[0], byteSize: s.revisions[0].byteSize?.toString() ?? null } : null, latestReview: s.reviews[0] ? { state: s.reviews[0].state, comment: s.reviews[0].comment } : null }; }) };
  });
  return { assignments: assignments.map((a) => ({ id: a.id, courseId: a.courseId, groupId: a.groupId, courseName: a.course.subject.name, groupCode: a.group.code })), componentOptions, materials: materials.map((m) => ({ id: m.id, courseId: m.courseId, title: m.title, groupIds: m.audiences.map((a) => a.groupId) })), homeworks };
}

export async function reviewStudentSubmission(input: { submissionId: unknown; revisionId: unknown; decision: unknown; comment: unknown; score: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const submissionId = String(input.submissionId ?? ""); const revisionId = String(input.revisionId ?? ""); const decision = String(input.decision ?? ""); if (!uuid.test(submissionId) || !uuid.test(revisionId) || !["REVISION_REQUIRED", "CHECKED"].includes(decision)) throw new CourseworkInputError("Некорректные данные проверки.");
  const comment = clean(input.comment, 5000, decision === "REVISION_REQUIRED") ?? null; const hasScore = input.score !== "" && input.score !== null && input.score !== undefined; const score = hasScore ? Number(input.score) : null; if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new CourseworkInputError("Оценка должна быть от 0 до 100.");
  return prisma.$transaction(async (tx) => {
    const assignmentScope = { teacherId: teacher.id, ...activeAssignment(new Date()) };
    const submission = await tx.submission.findFirst({ where: { id: submissionId, state: HomeworkSubmissionState.UNDER_REVIEW, revisions: { some: { id: revisionId, submittedAt: { not: null } } }, homework: { authorId: teacher.id, OR: [{ group: { assignments: { some: assignmentScope } } }, { groupId: null, assessment: { is: { group: { assignments: { some: assignmentScope } } } } }] } }, include: { homework: { select: { id: true, title: true, assessmentId: true, courseId: true, groupId: true, assessment: { select: { groupId: true } } } }, student: { select: { id: true } } } });
    const homeworkGroupId = submission?.homework.groupId ?? submission?.homework.assessment?.groupId;
    if (!submission || !homeworkGroupId) throw new CourseworkAccessError("Сдача не принадлежит вашим дисциплинам и группам.");
    if (decision === "REVISION_REQUIRED" && score !== null) throw new CourseworkInputError("Оценку можно внести после завершения проверки.");
    if (decision === "CHECKED" && score !== null && !submission.homework.assessmentId) throw new CourseworkInputError("Для задания не выбран компонент оценивания. Можно сохранить обратную связь без баллов.");
    await tx.submissionReview.create({ data: { submissionId, revisionId, reviewerId: teacher.id, state: decision as HomeworkSubmissionState, comment } });
    await tx.submission.update({ where: { id: submissionId }, data: { state: decision as HomeworkSubmissionState, reviewedAt: new Date(), feedback: comment, version: { increment: 1 } } });
    if (score !== null && submission.homework.assessmentId) {
      const assessment = await tx.assessment.findFirst({ where: { id: submission.homework.assessmentId, state: AssessmentState.PUBLISHED, courseId: submission.homework.courseId, groupId: homeworkGroupId }, select: { id: true } });
      if (!assessment) throw new CourseworkInputError("Опубликованный компонент журнала задания недоступен.");
      const entry = await tx.gradebookEntry.upsert({ where: { assessmentId_studentId: { assessmentId: submission.homework.assessmentId, studentId: submission.student.id } }, create: { assessmentId: submission.homework.assessmentId, studentId: submission.student.id }, update: {} });
      const revision = await tx.gradeRevision.create({ data: { entryId: entry.id, authorId: teacher.id, score, state: GradeRevisionState.DRAFT, reason: "Оценка домашнего задания" } });
      // Draft revisions remain unpublished; publication is a separate authorized action.
      void revision;
    }
    const eventKey = `homework:submission:${submissionId}:review:${randomUUID()}`;
    const notice = await tx.notification.create({ data: { category: NotificationCategory.HOMEWORK, sourceType: "HOMEWORK", sourceId: submission.homework.id, eventKey, title: decision === "REVISION_REQUIRED" ? "Работа возвращена на доработку" : "Работа проверена", body: comment ?? `Преподаватель проверил задание «${submission.homework.title}».` } });
    await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: submission.student.id, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: submission.student.id }, update: {} });
    return { submissionId, decision };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function publishHomeworkGrade(input: { submissionId: unknown; revisionId: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const submissionId = String(input.submissionId ?? ""); const revisionId = String(input.revisionId ?? ""); if (!uuid.test(submissionId) || !uuid.test(revisionId)) throw new CourseworkInputError("Некорректная оценка.");
  return prisma.$transaction(async (tx) => {
    const assignmentScope = { teacherId: teacher.id, ...activeAssignment(new Date()) };
    const submission = await tx.submission.findFirst({ where: { id: submissionId, state: HomeworkSubmissionState.CHECKED, homework: { authorId: teacher.id, assessmentId: { not: null }, OR: [{ group: { assignments: { some: assignmentScope } } }, { groupId: null, assessment: { is: { group: { assignments: { some: assignmentScope } } } } }] } }, include: { homework: { select: { id: true, title: true, assessmentId: true } }, student: { select: { id: true } } } }); if (!submission?.homework.assessmentId) throw new CourseworkAccessError("Оценка недоступна.");
    const entry = await tx.gradebookEntry.findUnique({ where: { assessmentId_studentId: { assessmentId: submission.homework.assessmentId, studentId: submission.student.id } }, select: { id: true } }); if (!entry) throw new CourseworkConflictError("Запись журнала не найдена.");
    const revision = await tx.gradeRevision.findFirst({ where: { id: revisionId, entryId: entry.id, authorId: teacher.id, state: GradeRevisionState.DRAFT }, select: { id: true, score: true } }); if (!revision) throw new CourseworkConflictError("Черновая оценка не найдена.");
    const now = new Date();
    const current = await tx.gradebookEntry.findUnique({ where: { id: entry.id }, select: { currentRevisionId: true } });
    if (current?.currentRevisionId) await tx.gradeRevision.updateMany({ where: { id: current.currentRevisionId, state: GradeRevisionState.PUBLISHED }, data: { state: GradeRevisionState.SUPERSEDED } });
    await tx.gradeRevision.update({ where: { id: revision.id }, data: { state: GradeRevisionState.PUBLISHED, publishedAt: now } }); await tx.gradebookEntry.update({ where: { id: entry.id }, data: { currentRevisionId: revision.id, version: { increment: 1 } } });
    const notice = await tx.notification.upsert({ where: { eventKey: `homework:grade:${revision.id}:published` }, create: { category: NotificationCategory.HOMEWORK, sourceType: "HOMEWORK", sourceId: submission.homework.id, eventKey: `homework:grade:${revision.id}:published`, title: "Опубликован результат домашней работы", body: `Оценка по заданию «${submission.homework.title}» опубликована.` }, update: {} }); await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: submission.student.id, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: submission.student.id }, update: {} }); return revision.score.toString();
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getCurrentTeacherHomeworkNotifications() {
  const teacher = await requireRole(Role.TEACHER);
  const rows = await prisma.notificationDelivery.findMany({ where: { recipientId: teacher.id, notification: { category: NotificationCategory.HOMEWORK } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, readAt: true, createdAt: true, notification: { select: { title: true, body: true, sourceType: true, sourceId: true, createdAt: true } } } });
  return { unreadCount: rows.filter((row) => row.readAt === null).length, items: rows.map((row) => ({ id: row.id, title: row.notification.title, body: row.notification.body, createdAt: row.notification.createdAt, readAt: row.readAt, href: row.notification.sourceType === "HOMEWORK" ? "/teacher/homework" : null })) };
}

export async function markCurrentTeacherHomeworkNotificationRead(deliveryId: string) {
  const teacher = await requireRole(Role.TEACHER); if (!uuid.test(deliveryId)) throw new CourseworkInputError("Некорректное уведомление.");
  const result = await prisma.notificationDelivery.updateMany({ where: { id: deliveryId, recipientId: teacher.id, notification: { category: NotificationCategory.HOMEWORK }, readAt: null }, data: { readAt: new Date() } });
  return result.count === 1;
}

export const courseworkIntegrationHelpers = { allowedFormats, homeworkCalendarProjectionId, publishedHomeworkNoticeKey };
