import "server-only";

import { CareerEventState, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getMoscowWeekBounds } from "@/lib/schedule/moscow-time";
import { taskMonthUtcBounds, validTaskMonthKey } from "@/lib/tasks/tasks-core";
import { detectDeanScheduleConflicts, publishedScoreSummary } from "./dean-core";

const activeWindow = (now: Date) => ({ AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] });
const profileName = { select: { displayName: true, email: true, phone: true, settings: true } } as const;

export async function getDeanOverview(now = new Date()) {
  await requireRole(Role.DEAN);
  const week = getMoscowWeekBounds(now);
  const [students, teachers, lessons, requests, passes, notices, pendingReviews] = await Promise.all([
    prisma.user.count({ where: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }),
    prisma.user.count({ where: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } } }),
    prisma.lesson.findMany({ where: { state: "SCHEDULED", startsAt: { gte: now, lt: week.end } }, orderBy: { startsAt: "asc" }, take: 8, select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, room: { select: { code: true } }, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
    prisma.serviceRequest.count({ where: { state: { in: ["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUESTED", "READY_FOR_ISSUE"] } } }),
    prisma.passRequest.count({ where: { state: { in: ["SUBMITTED", "IN_REVIEW", "APPROVED"] } } }),
    prisma.notificationDelivery.count({ where: { recipient: { isActive: true, roles: { some: { role: Role.DEAN, revokedAt: null } } }, readAt: null } }),
    prisma.submission.count({ where: { state: "UNDER_REVIEW" } }),
  ]);
  return { students, teachers, lessons, requests, passes, notices, pendingReviews };
}

export async function getDeanProfile() {
  const dean = await requireRole(Role.DEAN);
  const [user, roles] = await Promise.all([
    prisma.user.findUnique({ where: { id: dean.id }, select: { login: true, profile: profileName } }),
    prisma.userRole.findMany({ where: { role: Role.DEAN, revokedAt: null, user: { isActive: true } }, select: { userId: true, user: { select: { profile: { select: { displayName: true } } } } }, orderBy: { user: { login: "asc" } } }),
  ]);
  return { login: user?.login ?? dean.login, profile: user?.profile, coworkers: roles.map((row) => row.user.profile?.displayName ?? "Сотрудник деканата") };
}

export async function getDeanStudents(filters: { search?: string; groupId?: string; programId?: string; status?: string } = {}) {
  await requireRole(Role.DEAN);
  const now = new Date();
  const q = filters.search?.trim().slice(0, 100);
  const rows = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } }, ...(q ? { OR: [{ login: { contains: q, mode: "insensitive" } }, { profile: { displayName: { contains: q, mode: "insensitive" } } }] } : {}), ...(filters.groupId || filters.programId ? { memberships: { some: { ...activeWindow(now), ...(filters.groupId ? { groupId: filters.groupId } : {}), ...(filters.programId ? { group: { academicProgramId: filters.programId } } : {}) } } } : {}), ...(filters.status ? { studentAcademicProfile: { academicStatus: filters.status } } : {}) },
    orderBy: [{ profile: { displayName: "asc" } }, { login: "asc" }], take: 300,
    select: { id: true, login: true, profile: { select: { displayName: true, email: true, phone: true } }, studentAcademicProfile: { select: { studentNumber: true, admissionYear: true, academicStatus: true } }, memberships: { where: activeWindow(now), take: 1, include: { group: { include: { academicProgram: true } } } } },
  });
  const [groups, programs] = await Promise.all([prisma.group.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }), prisma.academicProgram.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  return { students: rows, groups, programs };
}

export async function getDeanStudentDetail(studentId: string) {
  await requireRole(Role.DEAN);
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return null;
  const now = new Date();
  return prisma.user.findFirst({ where: { id: studentId, isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } }, select: {
    id: true, login: true, profile: { select: { displayName: true, email: true, phone: true } }, studentAcademicProfile: { select: { studentNumber: true, admissionYear: true, academicStatus: true } },
    memberships: {
      where: activeWindow(now),
      include: { group: { include: {
        academicProgram: true,
        courseLinks: { include: { course: { select: { subject: { select: { name: true } } } } } },
      } } },
    },
    confirmedDebts: { where: { resolvedAt: null }, include: { course: { select: { subject: { select: { name: true } } } }, confirmedBy: { select: { profile: { select: { displayName: true } } } } } },
    serviceRequests: { orderBy: { submittedAt: "desc" }, take: 15, select: { id: true, category: true, state: true, submittedAt: true, deadlineAt: true, title: true } },
    gradeEntries: { where: { currentRevision: { is: { state: "PUBLISHED", publishedAt: { not: null } } } }, select: { id: true, currentRevision: { select: { score: true } }, assessment: { select: { title: true, course: { select: { subject: { select: { name: true } } } } } } } },
  } });
}

export async function getDeanTeachers(search?: string) {
  await requireRole(Role.DEAN);
  const q = search?.trim().slice(0, 100);
  const teachers = await prisma.user.findMany({ where: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } }, ...(q ? { OR: [{ login: { contains: q, mode: "insensitive" } }, { profile: { displayName: { contains: q, mode: "insensitive" } } }] } : {}) }, orderBy: [{ profile: { displayName: "asc" } }, { login: "asc" }], take: 300,
    select: { id: true, login: true, profile: { select: { displayName: true, email: true, phone: true, settings: true } }, teaching: { where: activeWindow(new Date()), select: { course: { select: { subject: { select: { name: true } } } }, group: { select: { code: true } } } }, taughtLessons: { where: { state: "SCHEDULED", startsAt: { gte: new Date() } }, select: { id: true } } },
  });
  return teachers.map((teacher) => ({ ...teacher, courses: [...new Set(teacher.teaching.map((item) => item.course.subject.name))], groups: [...new Set(teacher.teaching.map((item) => item.group.code))], upcomingLessonCount: teacher.taughtLessons.length }));
}

export async function getDeanSchedule(input: { from?: Date; to?: Date; groupId?: string; courseId?: string; teacherId?: string; roomId?: string } = {}) {
  await requireRole(Role.DEAN);
  const from = input.from && Number.isFinite(input.from.getTime()) ? input.from : new Date();
  const to = input.to && Number.isFinite(input.to.getTime()) && input.to > from ? input.to : new Date(from.getTime() + 7 * 86400000);
  const where = { startsAt: { gte: from, lt: to }, state: { not: "CANCELLED" as const }, ...(input.groupId ? { groupId: input.groupId } : {}), ...(input.courseId ? { courseId: input.courseId } : {}), ...(input.roomId ? { roomId: input.roomId } : {}), ...(input.teacherId ? { OR: [{ teacherId: input.teacherId }, { examinerId: input.teacherId }, { substituteId: input.teacherId }] } : {}) };
  const [lessons, groups, courses, teachers, rooms, changes] = await Promise.all([
    prisma.lesson.findMany({ where, orderBy: { startsAt: "asc" }, take: 1000, select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, state: true, format: true, version: true, room: { select: { id: true, code: true } }, group: { select: { id: true, code: true } }, course: { select: { id: true, subject: { select: { name: true } } } }, teacher: { select: { id: true, profile: { select: { displayName: true } } } }, examiner: { select: { id: true, profile: { select: { displayName: true } } } }, substitute: { select: { id: true, profile: { select: { displayName: true } } } } } }),
    prisma.group.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }), prisma.course.findMany({ orderBy: { subject: { name: "asc" } }, select: { id: true, subject: { select: { name: true } } } }),
    prisma.user.findMany({ where: { roles: { some: { role: Role.TEACHER, revokedAt: null } }, isActive: true }, orderBy: { profile: { displayName: "asc" } }, select: { id: true, profile: { select: { displayName: true } } } }), prisma.room.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
    prisma.scheduleChangeRequest.findMany({ where: { submittedAt: { gte: from, lt: to } }, orderBy: { submittedAt: "desc" }, take: 100, select: { id: true, kind: true, state: true, submittedAt: true, reason: true, lesson: { select: { title: true, startsAt: true, group: { select: { code: true } } } }, requester: { select: { profile: { select: { displayName: true } } } } } }),
  ]);
  const conflicts = detectDeanScheduleConflicts(lessons.map((lesson) => ({ id: lesson.id, groupId: lesson.group.id, groupCode: lesson.group.code, roomId: lesson.room?.id ?? null, roomCode: lesson.room?.code ?? null, startsAt: lesson.startsAt, endsAt: lesson.endsAt, staffIds: [lesson.teacher?.id, lesson.examiner?.id, lesson.substitute?.id].filter((id): id is string => Boolean(id)) })));
  return { lessons, groups, courses, teachers, rooms, changes, conflicts };
}

export async function getDeanAnalytics(groupId?: string, courseId?: string, studentId?: string) {
  await requireRole(Role.DEAN);
  const scope = { ...(groupId ? { groupId } : {}), ...(courseId ? { courseId } : {}) };
  const publishedEntry = { currentRevision: { is: { state: "PUBLISHED" as const, publishedAt: { not: null } } } };
  const [assessments, attendance, submissions, assignmentRows, courses, students, debts] = await Promise.all([
    prisma.assessment.findMany({ where: { ...scope, state: "PUBLISHED", ...(studentId ? { gradeEntries: { some: { studentId, ...publishedEntry } } } : {}) }, select: { id: true, title: true, group: { select: { id: true, code: true } }, course: { select: { id: true, subject: { select: { name: true } } } }, component: { select: { name: true } }, gradeEntries: { where: { ...publishedEntry, ...(studentId ? { studentId } : {}) }, select: { studentId: true, student: { select: { login: true, profile: { select: { displayName: true } } } }, currentRevision: { select: { score: true } } } } }, take: 500 }),
    prisma.attendanceRecord.findMany({ where: { ...(groupId ? { groupId } : {}), ...(courseId ? { lesson: { courseId } } : {}), ...(studentId ? { studentId } : {}) }, select: { status: true } }),
    prisma.submission.findMany({ where: { homework: { ...scope }, ...(studentId ? { studentId } : {}) }, select: { state: true } }),
    prisma.group.findMany({ where: groupId ? { id: groupId } : {}, orderBy: { code: "asc" }, select: { id: true, code: true } }),
    prisma.course.findMany({ orderBy: { subject: { name: "asc" } }, select: { id: true, subject: { select: { name: true } } } }),
    prisma.user.findMany({ where: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } }, ...(groupId ? { memberships: { some: { groupId, ...activeWindow(new Date()) } } } : {}) }, orderBy: [{ profile: { displayName: "asc" } }, { login: "asc" }], take: 300, select: { id: true, login: true, profile: { select: { displayName: true } }, memberships: { where: activeWindow(new Date()), take: 1, select: { group: { select: { code: true } } } } } }),
    prisma.confirmedAcademicDebt.findMany({ where: { resolvedAt: null, ...(studentId ? { studentId } : {}), ...(groupId ? { student: { memberships: { some: { groupId, ...activeWindow(new Date()) } } } } : {}), ...(courseId ? { courseId } : {}) }, orderBy: { confirmedAt: "desc" }, take: 500, select: { id: true, confirmedAt: true, reason: true, course: { select: { subject: { select: { name: true } } } }, student: { select: { login: true, profile: { select: { displayName: true } }, memberships: { where: activeWindow(new Date()), take: 1, select: { group: { select: { code: true } } } } } } } }),
  ]);
  const scoreSummary = publishedScoreSummary(assessments.flatMap((assessment) => assessment.gradeEntries.map((entry) => Number(entry.currentRevision?.score))));
  const states = submissions.reduce<Record<string, number>>((all, row) => ({ ...all, [row.state]: (all[row.state] ?? 0) + 1 }), {});
  const attendanceCounts = attendance.reduce<Record<string, number>>((all, row) => ({ ...all, [row.status]: (all[row.status] ?? 0) + 1 }), {});
  const results = assessments.flatMap((assessment) => assessment.gradeEntries.map((entry) => ({ id: entry.studentId + assessment.id, studentId: entry.studentId, studentName: entry.student.profile?.displayName ?? entry.student.login, groupCode: assessment.group.code, courseName: assessment.course.subject.name, componentName: assessment.component.name, assessmentTitle: assessment.title, score: entry.currentRevision?.score.toString() ?? "—" })));
  return { assessmentCount: assessments.length, publishedGradeCount: scoreSummary.count, averagePublishedScore: scoreSummary.average, attendanceCounts, submissionStates: states, unresolvedDebtCount: debts.length, debts, results, groups: assignmentRows, courses, students };
}

export async function getDeanAnnouncements() {
  await requireRole(Role.DEAN);
  const [announcements, groups] = await Promise.all([
    prisma.officialAnnouncement.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { versions: { orderBy: { number: "desc" } }, roleAudiences: true, groupAudiences: { include: { group: { select: { code: true } } } } } }),
    prisma.group.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);
  return { announcements, groups };
}

export async function getDeanCalendar(from: Date, to: Date) {
  await requireRole(Role.DEAN);
  const [lessons, requests, passes, events] = await Promise.all([
    prisma.lesson.findMany({ where: { startsAt: { gte: from, lt: to }, state: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" }, take: 1000, select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } }, room: { select: { code: true } } } }),
    prisma.serviceRequest.findMany({ where: { deadlineAt: { gte: from, lt: to }, state: { notIn: ["COMPLETED", "REJECTED", "CANCELLED"] } }, orderBy: { deadlineAt: "asc" }, select: { id: true, title: true, deadlineAt: true, state: true, student: { select: { profile: { select: { displayName: true } } } } } }),
    prisma.passRequest.findMany({ where: { submittedAt: { gte: from, lt: to }, state: { in: ["SUBMITTED", "IN_REVIEW", "APPROVED"] } }, orderBy: { submittedAt: "asc" }, select: { id: true, kind: true, state: true, submittedAt: true } }),
    prisma.careerEvent.findMany({ where: { startsAt: { gte: from, lt: to }, state: CareerEventState.PUBLISHED }, orderBy: { startsAt: "asc" }, select: { id: true, title: true, startsAt: true, endsAt: true, location: true } }),
  ]);
  return { lessons, requests, passes, events };
}

export async function getDeanCalendarMonth(monthValue?: string) {
  await requireRole(Role.DEAN);
  const month = monthValue && validTaskMonthKey(monthValue) ? monthValue : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit" }).format(new Date());
  const bounds = taskMonthUtcBounds(month);
  return { month, ...(await getDeanCalendar(bounds.start, bounds.end)) };
}

export async function getDeanNotifications() {
  const dean = await requireRole(Role.DEAN);
  const [deliveries, preferences] = await Promise.all([
    prisma.notificationDelivery.findMany({ where: { recipientId: dean.id }, orderBy: { createdAt: "desc" }, take: 200, include: { notification: true } }),
    prisma.notificationPreference.findMany({ where: { userId: dean.id }, select: { category: true, muted: true } }),
  ]);
  return { deliveries, preferences };
}

export async function getDeanCareer() {
  await requireRole(Role.DEAN);
  const [opportunities, events, categories, applications, registrations] = await Promise.all([
    prisma.careerOpportunity.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { category: true, _count: { select: { applications: true } } } }),
    prisma.careerEvent.findMany({ orderBy: { startsAt: "desc" }, take: 200, include: { _count: { select: { registrations: true } } } }),
    prisma.careerCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.careerApplication.findMany({ orderBy: { appliedAt: "desc" }, take: 300, select: { id: true, state: true, appliedAt: true, student: { select: { profile: { select: { displayName: true } }, login: true } }, opportunity: { select: { title: true } } } }),
    prisma.careerEventRegistration.findMany({ orderBy: { createdAt: "desc" }, take: 300, select: { id: true, state: true, createdAt: true, event: { select: { title: true } }, student: { select: { profile: { select: { displayName: true } }, login: true } } } }),
  ]);
  return { opportunities, events, categories, applications, registrations };
}

export async function getDeanNotificationsUnreadCount() {
  const dean = await requireRole(Role.DEAN);
  return prisma.notificationDelivery.count({ where: { recipientId: dean.id, readAt: null, mutedAt: null } });
}
