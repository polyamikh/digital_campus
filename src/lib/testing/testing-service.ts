import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { NotificationCategory, NotificationChannel, PublicationState, Role, TestAttemptState } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { prisma } from "@/lib/prisma";
import { parseMoscowDateTime } from "@/lib/tasks/tasks-core";
import { activeStudentMembershipScope, canLowerAttemptLimit, publishedTestResult, shiftReminder, studentAttemptScope, studentTestScope, teacherAssignmentScope, safeExternalTestUrl, testDeletionDisposition, validAttemptLimit } from "./testing-core";

export class TestingInputError extends Error {}
export class TestingConflictError extends Error {}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") throw new TestingInputError("Заполните обязательные поля.");
  const clean = value.trim();
  if (!clean || clean.length > max) throw new TestingInputError("Проверьте название теста.");
  return clean;
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new TestingInputError("Укажите корректную дату.");
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new TestingInputError("Укажите корректную дату и время.");
  try { return parseMoscowDateTime(match[1], `${match[2]}:${match[3]}`).value; }
  catch { throw new TestingInputError("Укажите корректную дату и время."); }
}

function activeAt(now: Date) {
  return { AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };
}

export async function getCurrentStudentTesting(now = new Date()) {
  const student = await requireRole(Role.STUDENT);
  const memberships = await prisma.groupMembership.findMany({
    where: activeMembershipWhere(student.id, now),
    select: { groupId: true, group: { select: { code: true } } },
    take: 2,
  });
  if (memberships.length !== 1) return { groupCode: null, membershipState: memberships.length ? "AMBIGUOUS" as const : "MISSING" as const, tests: [] };
  const groupId = memberships[0].groupId;
  const rows = await prisma.test.findMany({
    where: studentTestScope(groupId),
    orderBy: [{ closesAt: "asc" }, { title: "asc" }],
    select: {
      id: true, courseId: true, title: true, externalUrl: true, opensAt: true, closesAt: true, attemptLimit: true, state: true, publishedAt: true,
      course: { select: { subject: { select: { name: true } } } },
      author: { select: { profile: { select: { displayName: true } } } },
      assessment: { select: { id: true, courseId: true, groupId: true, gradeEntries: {
        where: { studentId: student.id }, select: { currentRevision: { select: { score: true, state: true, publishedAt: true } } },
      } } },
      attempts: { where: studentAttemptScope(student.id), orderBy: { attemptNo: "desc" }, select: { attemptNo: true, state: true, submittedAt: true, publishedAt: true } },
    },
  });
  const tests = rows.filter((row) => row.assessment !== null && row.assessment.courseId === row.courseId && row.assessment.groupId === groupId).map((row) => {
    const currentGrade = row.assessment?.gradeEntries[0]?.currentRevision;
    const publishedGrade = publishedTestResult(currentGrade);
    return {
      id: row.id, title: row.title, courseName: row.course.subject.name,
      teacherName: row.author.profile?.displayName ?? "Преподаватель",
      externalUrl: safeExternalTestUrl(row.externalUrl), opensAt: row.opensAt, closesAt: row.closesAt,
      attemptLimit: row.attemptLimit, attemptsUsed: row.attempts.length,
      attempts: row.attempts.map((attempt) => ({ attemptNo: attempt.attemptNo, state: attempt.state, submittedAt: attempt.submittedAt, publishedAt: attempt.publishedAt })),
      result: publishedGrade,
    };
  });
  return { groupCode: memberships[0].group.code, membershipState: "READY" as const, tests };
}

export async function getCurrentTeacherTestingWorkspace(now = new Date()) {
  const teacher = await requireRole(Role.TEACHER);
  const assignments = await prisma.teacherAssignment.findMany({
    where: { ...teacherAssignmentScope(teacher.id), ...activeAt(now) },
    orderBy: [{ group: { code: "asc" } }, { course: { subject: { name: "asc" } } }],
    select: { id: true, courseId: true, groupId: true, group: { select: { id: true, code: true } }, course: { select: { subject: { select: { name: true } } } } },
  });
  const pairs = assignments.map(({ courseId, groupId }) => ({ courseId, assessment: { is: { groupId } } }));
  const tests = pairs.length ? await prisma.test.findMany({
    where: { OR: pairs }, orderBy: [{ title: "asc" }],
    select: {
      id: true, title: true, externalUrl: true, opensAt: true, closesAt: true, attemptLimit: true, state: true, publishedAt: true, version: true,
      courseId: true, course: { select: { subject: { select: { name: true } } } },
      assessment: { select: { id: true, groupId: true, state: true, gradeEntries: { select: {
        studentId: true, currentRevision: { select: { score: true, state: true, publishedAt: true } },
        revisions: { select: { score: true, state: true, retake: { select: { attemptNo: true } }, retakeId: true } },
      student: { select: { login: true, profile: { select: { displayName: true } } } },
      } } } },
      attempts: { orderBy: { attemptNo: "desc" }, select: { id: true, studentId: true, attemptNo: true, state: true, submittedAt: true, publishedAt: true, student: { select: { login: true, profile: { select: { displayName: true } } } } } },
    },
  }) : [];
  const groupCodes = new Map(assignments.map((assignment) => [assignment.groupId, assignment.group.code]));
  const activeStudents = assignments.length ? await prisma.groupMembership.findMany({
    where: { groupId: { in: [...new Set(assignments.map((item) => item.groupId))] }, ...activeStudentMembershipScope(now) },
    select: { groupId: true, studentId: true },
  }) : [];
  const studentsByGroup = new Map<string, Set<string>>();
  for (const membership of activeStudents) studentsByGroup.set(membership.groupId, new Set([...(studentsByGroup.get(membership.groupId) ?? []), membership.studentId]));
  const studentRows = activeStudents.length ? await prisma.user.findMany({ where: { id: { in: activeStudents.map((row) => row.studentId) } }, select: { id: true, login: true, profile: { select: { displayName: true } } } }) : [];
  const studentById = new Map(studentRows.map((row) => [row.id, { id: row.id, name: row.profile?.displayName ?? row.login }]));
  const structures = assignments.length ? await prisma.assessmentStructureVersion.findMany({
    where: { courseId: { in: [...new Set(assignments.map((item) => item.courseId))] }, publishedAt: { not: null } },
    orderBy: [{ courseId: "asc" }, { version: "desc" }],
    select: { id: true, courseId: true, version: true, weights: { select: { componentId: true, componentName: true, position: true } } },
  }) : [];
  const componentOptions = assignments.flatMap((assignment) => {
    const structure = structures.find((item) => item.courseId === assignment.courseId);
    return structure ? structure.weights.map((weight) => ({ assignmentId: assignment.id, courseId: assignment.courseId, groupId: assignment.groupId, groupCode: assignment.group.code, courseName: assignment.course.subject.name, structureVersionId: structure.id, componentId: weight.componentId, componentName: weight.componentName })) : [];
  });
  return {
    assignments: assignments.map((assignment) => ({ id: assignment.id, courseId: assignment.courseId, groupId: assignment.groupId, groupCode: assignment.group.code, courseName: assignment.course.subject.name })),
    componentOptions,
    tests: tests.map((row) => {
      const groupId = row.assessment?.groupId ?? "";
      const groupCode = groupId ? groupCodes.get(groupId) ?? "" : "";
      const attempts = row.attempts.filter((attempt) => groupId && studentsByGroup.get(groupId)?.has(attempt.studentId)).map((attempt) => ({
        id: attempt.id, studentId: attempt.studentId, attemptNo: attempt.attemptNo, state: attempt.state,
        submittedAt: attempt.submittedAt, publishedAt: attempt.publishedAt,
        studentName: attempt.student.profile?.displayName ?? attempt.student.login,
        result: (() => {
          const entry = row.assessment?.gradeEntries.find((candidate) => candidate.studentId === attempt.studentId);
          return entry?.revisions.find((revision) => attempt.attemptNo === 1 ? revision.retakeId === null : revision.retake?.attemptNo === attempt.attemptNo)?.score.toString() ?? null;
        })(),
        resultPublished: (() => {
          const entry = row.assessment?.gradeEntries.find((candidate) => candidate.studentId === attempt.studentId);
          return entry?.revisions.some((revision) => (attempt.attemptNo === 1 ? revision.retakeId === null : revision.retake?.attemptNo === attempt.attemptNo) && revision.state === "PUBLISHED") ?? false;
        })(),
      }));
      return { id: row.id, title: row.title, courseName: row.course.subject.name, groupCode, groupId, state: row.state, version: row.version, externalUrl: safeExternalTestUrl(row.externalUrl), opensAt: row.opensAt, closesAt: row.closesAt, attemptLimit: row.attemptLimit, students: groupId ? [...(studentsByGroup.get(groupId) ?? [])].map((id) => studentById.get(id)).filter((item): item is { id: string; name: string } => Boolean(item)) : [], attempts };
    }),
  };
}

export async function createTeacherTest(input: { assignmentId: unknown; componentId: unknown; title: unknown; externalUrl: unknown; opensAt: unknown; closesAt: unknown; attemptLimit: unknown }, now = new Date()) {
  const teacher = await requireRole(Role.TEACHER);
  const title = cleanText(input.title, 240);
  if (typeof input.assignmentId !== "string" || !uuidPattern.test(input.assignmentId) || typeof input.componentId !== "string" || !uuidPattern.test(input.componentId)) throw new TestingInputError("Выберите свою дисциплину и компонент оценивания.");
  const externalUrl = input.externalUrl === "" || input.externalUrl === null ? null : safeExternalTestUrl(input.externalUrl);
  if (input.externalUrl && !externalUrl) throw new TestingInputError("Ссылка должна быть действительным HTTPS-адресом без логина и пароля.");
  const opensAt = parseDate(input.opensAt);
  const closesAt = parseDate(input.closesAt);
  if (opensAt && closesAt && closesAt <= opensAt) throw new TestingInputError("Срок завершения должен быть позже открытия.");
  const attemptLimit = input.attemptLimit === "" || input.attemptLimit === null ? null : Number(input.attemptLimit);
  if (!validAttemptLimit(attemptLimit)) throw new TestingInputError("Количество попыток должно быть положительным целым числом.");
  const assignment = await prisma.teacherAssignment.findFirst({ where: { ...teacherAssignmentScope(teacher.id, input.assignmentId), ...activeAt(now) } });
  if (!assignment) throw new TestingInputError("Дисциплина или группа недоступна для этого преподавателя.");
  const structure = await prisma.assessmentStructureVersion.findFirst({ where: { courseId: assignment.courseId, publishedAt: { not: null } }, orderBy: [{ version: "desc" }], include: { weights: { where: { componentId: input.componentId } } } });
  const weight = structure?.weights[0];
  if (!structure || !weight) throw new TestingInputError("Для дисциплины нет опубликованного компонента оценивания.");
  const test = await prisma.$transaction(async (tx) => {
    const assessment = await tx.assessment.create({ data: { courseId: assignment.courseId, groupId: assignment.groupId, componentId: input.componentId as string, structureVersionId: structure.id, authorId: teacher.id, title, state: "DRAFT" } });
    const created = await tx.test.create({ data: { courseId: assignment.courseId, authorId: teacher.id, assessmentId: assessment.id, title, externalUrl, opensAt, closesAt, attemptLimit, state: PublicationState.DRAFT } });
    await tx.publicationVersion.create({ data: { testId: created.id, number: 1, state: PublicationState.DRAFT, content: { title } } });
    return created;
  });
  return test.id;
}

export async function updateTeacherTest(input: { testId: unknown; expectedVersion: unknown; title: unknown; externalUrl: unknown; opensAt: unknown; closesAt: unknown; attemptLimit: unknown }, now = new Date()) {
  const teacher = await requireRole(Role.TEACHER);
  if (typeof input.testId !== "string" || !uuidPattern.test(input.testId) || !Number.isInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) throw new TestingInputError("Некорректная версия теста.");
  const title = cleanText(input.title, 240);
  const externalUrl = input.externalUrl === "" || input.externalUrl === null ? null : safeExternalTestUrl(input.externalUrl);
  if (input.externalUrl && !externalUrl) throw new TestingInputError("Ссылка должна быть действительным HTTPS-адресом без логина и пароля.");
  const opensAt = parseDate(input.opensAt);
  const closesAt = parseDate(input.closesAt);
  if (opensAt && closesAt && closesAt <= opensAt) throw new TestingInputError("Срок завершения должен быть позже открытия.");
  const attemptLimit = input.attemptLimit === "" || input.attemptLimit === null ? null : Number(input.attemptLimit);
  if (!validAttemptLimit(attemptLimit)) throw new TestingInputError("Количество попыток должно быть положительным целым числом.");

  await prisma.$transaction(async (tx) => {
    const test = await assertTeacherTest(tx, teacher.id, input.testId as string, now);
    if (test.version !== Number(input.expectedVersion)) throw new TestingConflictError("Тест уже изменился. Обновите страницу и повторите попытку.");
    const attemptsUsed = await tx.testAttempt.count({ where: { testId: test.id } });
    if (!canLowerAttemptLimit(attemptLimit, attemptsUsed)) throw new TestingInputError("Нельзя установить лимит ниже уже использованного количества попыток.");
    const updated = await tx.test.updateMany({
      where: { id: test.id, version: test.version },
      data: { title, externalUrl, opensAt, closesAt, attemptLimit, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new TestingConflictError("Тест уже изменился. Обновите страницу и повторите попытку.");
    if (test.assessmentId) await tx.assessment.update({ where: { id: test.assessmentId }, data: { title, version: { increment: 1 } } });

    const previousVersion = await tx.publicationVersion.aggregate({ where: { testId: test.id }, _max: { number: true } });
    const nextVersion = (previousVersion._max.number ?? 0) + 1;
    await tx.publicationVersion.create({ data: {
      testId: test.id, number: nextVersion, state: test.state,
      content: { title, externalUrl, opensAt: opensAt?.toISOString() ?? null, closesAt: closesAt?.toISOString() ?? null, attemptLimit },
      publishedAt: test.state === PublicationState.PUBLISHED ? now : null,
    } });

    if (test.closesAt?.getTime() !== closesAt?.getTime()) {
      if (closesAt) {
        await tx.academicCalendarEvent.updateMany({ where: { testId: test.id }, data: { startsAt: closesAt } });
        const reminders = await tx.reminder.findMany({ where: { testId: test.id, sentAt: null }, select: { id: true, dueAt: true, scheduledAt: true } });
        for (const reminder of reminders) await tx.reminder.update({ where: { id: reminder.id }, data: { dueAt: closesAt, scheduledAt: shiftReminder(reminder.dueAt, closesAt, reminder.scheduledAt) } });
      } else {
        await tx.academicCalendarEvent.deleteMany({ where: { testId: test.id } });
        await tx.reminder.deleteMany({ where: { testId: test.id, sentAt: null } });
      }
    }
    if (test.state === PublicationState.PUBLISHED) {
      await notifyTestGroup(tx, test.id, test.assessment!.groupId, `updated:v${nextVersion}`, "Изменён тест", `Преподаватель обновил тест «${title}» или его срок.`, now);
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function removeTeacherTest(testId: string, expectedVersion: number, now = new Date()): Promise<"deleted" | "withdrawn"> {
  const teacher = await requireRole(Role.TEACHER);
  if (!uuidPattern.test(testId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TestingInputError("Некорректная версия теста.");
  return prisma.$transaction(async (tx) => {
    const test = await assertTeacherTest(tx, teacher.id, testId, now);
    if (test.version !== expectedVersion) throw new TestingConflictError("Тест уже изменился. Обновите страницу и повторите попытку.");
    const [attempts, gradeEntries, gradeRevisions, publishedResults, sentReminders, notifications, homework] = await Promise.all([
      tx.testAttempt.count({ where: { testId } }),
      test.assessmentId ? tx.gradebookEntry.count({ where: { assessmentId: test.assessmentId } }) : Promise.resolve(0),
      test.assessmentId ? tx.gradeRevision.count({ where: { entry: { assessmentId: test.assessmentId } } }) : Promise.resolve(0),
      test.assessmentId ? tx.gradeRevision.count({ where: { entry: { assessmentId: test.assessmentId }, state: "PUBLISHED", publishedAt: { not: null } } }) : Promise.resolve(0),
      tx.reminder.count({ where: { testId, sentAt: { not: null } } }),
      tx.notification.count({ where: { sourceType: "TEST", sourceId: testId } }),
      test.assessmentId ? tx.homework.count({ where: { assessmentId: test.assessmentId } }) : Promise.resolve(0),
    ]);
    const disposition = testDeletionDisposition({ attempts, gradeEntries, gradeRevisions, publishedResults, sentReminders, notifications, linkedHomework: homework > 0 });
    if (disposition === "WITHDRAW") {
      if (test.state !== PublicationState.WITHDRAWN) {
        const updated = await tx.test.updateMany({ where: { id: test.id, version: test.version }, data: { state: PublicationState.WITHDRAWN, version: { increment: 1 } } });
        if (updated.count !== 1) throw new TestingConflictError("Тест уже изменился. Обновите страницу и повторите попытку.");
        const previousVersion = await tx.publicationVersion.aggregate({ where: { testId }, _max: { number: true } });
        await tx.publicationVersion.create({ data: {
          testId, number: (previousVersion._max.number ?? 0) + 1, state: PublicationState.WITHDRAWN,
          content: { title: test.title, externalUrl: test.externalUrl, opensAt: test.opensAt?.toISOString() ?? null, closesAt: test.closesAt?.toISOString() ?? null, attemptLimit: test.attemptLimit, withdrawn: true },
          publishedAt: now,
        } });
        await notifyTestGroup(tx, test.id, test.assessment!.groupId, `withdrawn:v${test.version + 1}`, "Тест отменён", `Тест «${test.title}» снят с публикации. История результатов сохранена.`, now);
      }
      await tx.academicCalendarEvent.deleteMany({ where: { testId } });
      await tx.reminder.deleteMany({ where: { testId, sentAt: null } });
      return "withdrawn";
    }

    await tx.academicCalendarEvent.deleteMany({ where: { testId } });
    await tx.reminder.deleteMany({ where: { testId, sentAt: null } });
    await tx.question.deleteMany({ where: { testId } });
    await tx.publicationVersion.deleteMany({ where: { testId } });
    await tx.test.delete({ where: { id: testId } });
    if (test.assessmentId) await tx.assessment.delete({ where: { id: test.assessmentId } });
    return "deleted";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function assertTeacherTest(tx: Prisma.TransactionClient, teacherId: string, testId: string, now: Date) {
  const test = await tx.test.findUnique({ where: { id: testId }, include: { assessment: true } });
  if (!test?.assessment) throw new TestingInputError("Тест не найден.");
  const assignment = await tx.teacherAssignment.findFirst({ where: { ...teacherAssignmentScope(teacherId), courseId: test.courseId, groupId: test.assessment.groupId, ...activeAt(now) }, select: { id: true } });
  if (!assignment) throw new TestingInputError("Тест не относится к вашим дисциплинам и группам.");
  return test;
}

async function notifyTestUsers(tx: Prisma.TransactionClient, testId: string, event: string, title: string, body: string, recipientIds: string[], now: Date) {
  const uniqueRecipientIds = [...new Set(recipientIds)];
  if (!uniqueRecipientIds.length) return;
  const eventKey = `testing:${event}:${testId}`;
  const notification = await tx.notification.upsert({
    where: { eventKey }, create: { category: NotificationCategory.TEST, sourceType: "TEST", sourceId: testId, eventKey, title, body }, update: {}, select: { id: true },
  });
  const muted = await tx.notificationPreference.findMany({ where: { userId: { in: uniqueRecipientIds }, category: NotificationCategory.TEST, muted: true }, select: { userId: true } });
  const mutedIds = new Set(muted.map((row) => row.userId));
  await tx.notificationDelivery.createMany({ data: uniqueRecipientIds.map((recipientId) => ({ notificationId: notification.id, recipientId, channel: NotificationChannel.IN_APP, mutedAt: mutedIds.has(recipientId) ? now : null })), skipDuplicates: true });
}

async function notifyTestGroup(tx: Prisma.TransactionClient, testId: string, groupId: string, event: string, title: string, body: string, now: Date) {
  const memberships = await tx.groupMembership.findMany({ where: { groupId, ...activeStudentMembershipScope(now) }, select: { studentId: true } });
  await notifyTestUsers(tx, testId, event, title, body, memberships.map((row) => row.studentId), now);
}

export async function publishTeacherTest(testId: string, now = new Date()) {
  const teacher = await requireRole(Role.TEACHER);
  if (!uuidPattern.test(testId)) throw new TestingInputError("Тест не найден.");
  await prisma.$transaction(async (tx) => {
    const test = await assertTeacherTest(tx, teacher.id, testId, now);
    if (test.state !== PublicationState.DRAFT || !test.assessmentId || !test.assessment) throw new TestingConflictError("Тест уже опубликован или недоступен.");
    await tx.test.update({ where: { id: test.id }, data: { state: PublicationState.PUBLISHED, publishedAt: now, version: { increment: 1 } } });
    await tx.assessment.update({ where: { id: test.assessmentId }, data: { state: "PUBLISHED", publishedAt: now, version: { increment: 1 } } });
    await tx.publicationVersion.updateMany({ where: { testId, state: PublicationState.DRAFT }, data: { state: PublicationState.PUBLISHED, publishedAt: now } });
    await notifyTestGroup(tx, test.id, test.assessment.groupId, "published", "Назначен новый тест", `Опубликован тест «${test.title}».`, now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recordTeacherTestResult(input: { testId: unknown; studentId: unknown; score: unknown }, now = new Date()) {
  const teacher = await requireRole(Role.TEACHER);
  if (typeof input.testId !== "string" || !uuidPattern.test(input.testId) || typeof input.studentId !== "string" || !uuidPattern.test(input.studentId)) throw new TestingInputError("Некорректные данные результата.");
  const score = Number(input.score);
  if (!Number.isFinite(score) || score < 0 || score > 100 || String(input.score).trim() === "") throw new TestingInputError("Оценка должна быть в диапазоне от 0 до 100.");
  await prisma.$transaction(async (tx) => {
    const test = await assertTeacherTest(tx, teacher.id, input.testId as string, now);
    if (test.state !== PublicationState.PUBLISHED || !test.assessmentId || !test.assessment) throw new TestingInputError("Сначала опубликуйте тест.");
    const membership = await tx.groupMembership.findFirst({ where: { ...activeMembershipWhere(input.studentId as string, now), groupId: test.assessment.groupId, student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { id: true } });
    if (!membership) throw new TestingInputError("Студент не относится к назначенной группе.");
    const attemptsUsed = await tx.testAttempt.count({ where: { testId: test.id, studentId: input.studentId as string } });
    if (test.attemptLimit !== null && attemptsUsed >= test.attemptLimit) throw new TestingConflictError("Разрешённое количество попыток уже использовано.");
    const previousLastAttempt = await tx.testAttempt.findFirst({ where: { testId: test.id, studentId: input.studentId as string }, orderBy: { attemptNo: "desc" }, select: { attemptNo: true } });
    const attemptNo = (previousLastAttempt?.attemptNo ?? 0) + 1;
    let entry = await tx.gradebookEntry.findUnique({ where: { assessmentId_studentId: { assessmentId: test.assessmentId, studentId: input.studentId as string } } });
    if (entry && await tx.gradeRevision.count({ where: { entryId: entry.id, state: "DRAFT" } })) throw new TestingConflictError("Сначала опубликуйте или обработайте сохранённый черновик результата.");
    await tx.testAttempt.create({ data: { testId: test.id, studentId: input.studentId as string, attemptNo, state: TestAttemptState.REVIEWED, startedAt: now, submittedAt: now, reviewedAt: now } });
    if (!entry) entry = await tx.gradebookEntry.create({ data: { assessmentId: test.assessmentId, studentId: input.studentId as string } });
    const retake = attemptNo > 1 ? await tx.retake.create({ data: { entryId: entry.id, attemptNo } }) : null;
    await tx.gradeRevision.create({ data: { entryId: entry.id, authorId: teacher.id, retakeId: retake?.id ?? null, score: new Prisma.Decimal(score), state: "DRAFT", reason: "Результат внешнего теста внесён преподавателем" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function publishTeacherTestResult(attemptId: string, now = new Date()) {
  const teacher = await requireRole(Role.TEACHER);
  if (!uuidPattern.test(attemptId)) throw new TestingInputError("Попытка не найдена.");
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.testAttempt.findUnique({ where: { id: attemptId }, include: { test: { include: { assessment: true } } } });
    if (!attempt?.test.assessment) throw new TestingInputError("Попытка не найдена.");
    await assertTeacherTest(tx, teacher.id, attempt.testId, now);
    if (attempt.state !== TestAttemptState.REVIEWED) throw new TestingConflictError("Результат уже опубликован или ещё не готов.");
    const entry = await tx.gradebookEntry.findUnique({ where: { assessmentId_studentId: { assessmentId: attempt.test.assessment.id, studentId: attempt.studentId } }, include: { currentRevision: true, revisions: true } });
    if (!entry) throw new TestingConflictError("Запись результата не найдена.");
    const retake = attempt.attemptNo > 1 ? await tx.retake.findUnique({ where: { entryId_attemptNo: { entryId: entry.id, attemptNo: attempt.attemptNo } } }) : null;
    const revision = entry.revisions.find((item) => attempt.attemptNo > 1 ? item.retakeId === retake?.id && item.state === "DRAFT" : item.retakeId === null && item.state === "DRAFT");
    if (!revision) throw new TestingConflictError("Черновик оценки не найден.");
    if (entry.currentRevisionId) await tx.gradeRevision.update({ where: { id: entry.currentRevisionId }, data: { state: "SUPERSEDED" } });
    await tx.gradeRevision.update({ where: { id: revision.id }, data: { state: "PUBLISHED", publishedAt: now } });
    await tx.gradebookEntry.update({ where: { id: entry.id }, data: { currentRevisionId: revision.id, version: { increment: 1 } } });
    await tx.testAttempt.update({ where: { id: attempt.id }, data: { state: TestAttemptState.PUBLISHED, publishedAt: now } });
    await notifyTestUsers(tx, attempt.testId, `result:${attempt.studentId}:${attempt.attemptNo}`, "Результат теста опубликован", `Преподаватель опубликовал результат теста «${attempt.test.title}».`, [attempt.studentId], now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
