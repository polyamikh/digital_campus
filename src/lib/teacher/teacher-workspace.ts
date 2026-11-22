import "server-only";

import { AssessmentState, CalendarEventKind, ConsentState, GradeRevisionState, NotificationCategory, NotificationChannel, PersonalTaskCategory, PersonalTaskPriority, Role, ScheduleChangeKind } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { getMoscowWeekBounds, moscowDateKey } from "@/lib/schedule/moscow-time";
import { prisma } from "@/lib/prisma";
import { parseTaskEventTimes, taskMonthGrid, taskViewDateKeys, validTaskMonthKey, validTaskDateKey, type TaskCalendarMode } from "@/lib/tasks/tasks-core";
import { parseTeacherGradeDrafts, validateAssessmentStructureInput } from "./teacher-grade-core";
import { serializeTeacherGradebook } from "./teacher-grade-serialization";
import { ACADEMIC_SEMESTERS_2026_2027, getDefaultAcademicSemester, type AcademicSemester } from "@/lib/academic-calendar/academic-year-2026-2027";
import { getMoscowDayBounds } from "@/lib/schedule/moscow-time";

const activeAssignment = (now: Date) => ({ AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] });

async function assignmentsFor(teacherId: string, now: Date) {
  return prisma.teacherAssignment.findMany({
    where: { teacherId, ...activeAssignment(now), teacher: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } } },
    orderBy: [{ course: { subject: { name: "asc" } } }, { group: { code: "asc" } }],
    select: { id: true, courseId: true, groupId: true, startsAt: true, endsAt: true, course: { select: { name: true, subject: { select: { name: true } } } }, group: { select: { id: true, code: true, name: true } } },
  });
}

export async function getTeacherProfile() {
  const teacher = await requireRole(Role.TEACHER);
  const [profile, assignments] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: teacher.id }, select: { displayName: true, email: true, phone: true, settings: true, updatedAt: true } }),
    assignmentsFor(teacher.id, new Date()),
  ]);
  const settings = profile?.settings && typeof profile.settings === "object" && !Array.isArray(profile.settings) ? profile.settings as Record<string, unknown> : {};
  return {
    displayName: profile?.displayName ?? teacher.login, email: profile?.email ?? null, phone: profile?.phone ?? null,
    officeHours: typeof settings.officeHours === "string" ? settings.officeHours : null,
    assignments: assignments.map((item) => ({ id: item.id, courseName: item.course.subject.name, groupCode: item.group.code, startsAt: item.startsAt, endsAt: item.endsAt })),
  };
}

export async function getTeacherHome(now = new Date(), scheduleWeek?: string) {
  const teacher = await requireRole(Role.TEACHER);
  const [profile, assignments] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: teacher.id }, select: { displayName: true } }),
    assignmentsFor(teacher.id, now),
  ]);
  const week = getMoscowWeekBounds(now);
  const widgetWeek = scheduleWeek && validTaskDateKey(scheduleWeek) ? getMoscowWeekBounds(new Date(scheduleWeek + "T12:00:00.000Z")) : week;
  const pairs = assignments.map(({ courseId, groupId }) => ({ courseId, groupId }));
  const pairScope = pairs.length ? { OR: pairs } : { id: { in: [] as string[] } };
  const [lessons, weeklyLessonCount, pendingReviews, upcomingWork, recentNotifications] = await Promise.all([
    prisma.lesson.findMany({ where: { OR: [{ teacherId: teacher.id }, { substituteId: teacher.id }, { examinerId: teacher.id }], state: "SCHEDULED", startsAt: { gte: widgetWeek.start, lt: widgetWeek.end } }, orderBy: { startsAt: "asc" }, take: 100, select: { id: true, title: true, kind: true, format: true, startsAt: true, endsAt: true, room: { select: { code: true } }, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
    prisma.lesson.count({ where: { OR: [{ teacherId: teacher.id }, { substituteId: teacher.id }, { examinerId: teacher.id }], state: "SCHEDULED", startsAt: { gte: week.start, lt: week.end } } }),
    prisma.submission.count({ where: { state: "UNDER_REVIEW", homework: { authorId: teacher.id, ...pairScope } } }),
    prisma.homework.findMany({ where: { authorId: teacher.id, state: "PUBLISHED", deadline: { gte: now }, ...pairScope }, orderBy: { deadline: "asc" }, take: 5, select: { id: true, title: true, deadline: true, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
    prisma.notificationDelivery.findMany({ where: { recipientId: teacher.id, readAt: null, mutedAt: null }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, createdAt: true, notification: { select: { category: true, title: true } } } }),
  ]);
  return { displayName: profile?.displayName ?? teacher.login, assignmentCount: assignments.length, lessons, widgetWeekStart: moscowDateKey(widgetWeek.start), today: moscowDateKey(now), weeklyLessonCount, pendingReviews, upcomingWork, recentNotifications };
}

export async function getTeacherSchedule(dateValue?: string) {
  const teacher = await requireRole(Role.TEACHER);
  const dateKey = dateValue && validTaskDateKey(dateValue) ? dateValue : moscowDateKey(new Date());
  const bounds = getMoscowWeekBounds(new Date(dateKey + "T12:00:00.000Z"));
  const [lessons, requestableLessons, requests, profile] = await Promise.all([
    prisma.lesson.findMany({
      where: { OR: [{ teacherId: teacher.id }, { examinerId: teacher.id }, { substituteId: teacher.id }], startsAt: { gte: bounds.start, lt: bounds.end }, state: { not: "CANCELLED" } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, kind: true, format: true, startsAt: true, endsAt: true, state: true, version: true, courseId: true, groupId: true, teacherId: true, examinerId: true, substituteId: true, room: { select: { code: true, name: true } }, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } }, teacher: { select: { profile: { select: { displayName: true } } } }, examiner: { select: { profile: { select: { displayName: true } } } }, substitute: { select: { profile: { select: { displayName: true } } } } },
    }),
    prisma.lesson.findMany({ where: { teacherId: teacher.id, startsAt: { gt: new Date() }, state: "SCHEDULED" }, orderBy: { startsAt: "asc" }, take: 100, select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, courseId: true, groupId: true, room: { select: { code: true } }, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
    prisma.scheduleChangeRequest.findMany({ where: { requesterId: teacher.id, submittedAt: { gte: bounds.start, lt: bounds.end } }, orderBy: { submittedAt: "desc" }, select: { id: true, lessonId: true, kind: true, state: true, submittedAt: true, reason: true, lesson: { select: { title: true, startsAt: true, course: { select: { subject: { select: { name: true } } } }, group: { select: { code: true } } } } } }),
    prisma.userProfile.findUnique({ where: { userId: teacher.id }, select: { settings: true } }),
  ]);
  const profileSettings = profile?.settings && typeof profile.settings === "object" && !Array.isArray(profile.settings) ? profile.settings as Record<string, unknown> : {};
  const lessonPairs = [...new Map([...lessons, ...requestableLessons].map((lesson) => [`${lesson.courseId}:${lesson.groupId}`, { courseId: lesson.courseId, groupId: lesson.groupId }])).values()];
  const substituteRows = lessonPairs.length ? await prisma.teacherAssignment.findMany({ where: { OR: lessonPairs, teacherId: { not: teacher.id }, ...activeAssignment(new Date()), teacher: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } } }, select: { courseId: true, groupId: true, teacherId: true, teacher: { select: { login: true, profile: { select: { displayName: true } } } } }, distinct: ["courseId", "groupId", "teacherId"] }) : [];
  const substitutes = substituteRows.map((row) => ({ courseId: row.courseId, groupId: row.groupId, id: row.teacherId, name: row.teacher.profile?.displayName ?? row.teacher.login }));
  return { teacherId: teacher.id, dateKey, weekStart: bounds.start, weekEnd: bounds.end, lessons, requestableLessons, requests, substitutes, officeHours: typeof profileSettings.officeHours === "string" ? profileSettings.officeHours : null };
}

export async function getTeacherCalendar(monthValue?: string, modeValue?: TaskCalendarMode, dayValue?: string) {
  const teacher = await requireRole(Role.TEACHER); const now = new Date();
  const month = monthValue && validTaskMonthKey(monthValue) ? monthValue : moscowDateKey(now).slice(0, 7);
  const mode: TaskCalendarMode = modeValue === "week" || modeValue === "day" || modeValue === "list" ? modeValue : "month";
  const candidateDay = dayValue && validTaskDateKey(dayValue) ? dayValue : null;
  const monthGrid = taskMonthGrid(month);
  const selectedDate = candidateDay && (mode === "week" || mode === "day" || (mode === "list" ? candidateDay.startsWith(month) : monthGrid.includes(candidateDay))) ? candidateDay : month !== moscowDateKey(now).slice(0, 7) || !monthGrid.includes(moscowDateKey(now)) ? month + "-01" : moscowDateKey(now);
  const dateKeys = taskViewDateKeys(mode, month, selectedDate);
  const firstBounds = getMoscowDayBounds(new Date(dateKeys[0]! + "T12:00:00.000Z"));
  const lastBounds = getMoscowDayBounds(new Date(dateKeys[dateKeys.length - 1]! + "T12:00:00.000Z"));
  const bounds = { start: firstBounds.start, end: lastBounds.end };
  const assignments = await assignmentsFor(teacher.id, now);
  const pairs = assignments.map(({ courseId, groupId }) => ({ courseId, groupId }));
  const pairScope = pairs.length ? { OR: pairs } : { id: { in: [] as string[] } };
  const [lessons, personalTasks, submissions, homeworkDeadlines, tests] = await Promise.all([
    prisma.lesson.findMany({ where: { OR: [{ teacherId: teacher.id }, { substituteId: teacher.id }, { examinerId: teacher.id }], startsAt: { gte: bounds.start, lt: bounds.end }, state: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" }, select: { id: true, title: true, kind: true, format: true, startsAt: true, endsAt: true, teacherId: true, examinerId: true, substituteId: true, room: { select: { code: true } }, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
    prisma.personalTask.findMany({ where: { ownerId: teacher.id, OR: [{ dueAt: null }, { dueAt: { gte: bounds.start, lt: bounds.end } }], state: { not: "CANCELLED" } }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], select: { id: true, title: true, details: true, dueAt: true, endsAt: true, hasDueTime: true, category: true, priority: true, state: true, version: true, reminders: { where: { sentAt: null }, orderBy: { scheduledAt: "asc" }, take: 1, select: { scheduledAt: true } } } }),
    prisma.submission.findMany({ where: { state: "UNDER_REVIEW", homework: { authorId: teacher.id, ...pairScope }, submittedAt: { gte: bounds.start, lt: bounds.end } }, orderBy: { submittedAt: "asc" }, take: 100, select: { id: true, submittedAt: true, homework: { select: { id: true, title: true, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } } } }),
    prisma.homework.findMany({ where: { authorId: teacher.id, state: "PUBLISHED", deadline: { gte: bounds.start, lt: bounds.end }, ...pairScope }, orderBy: { deadline: "asc" }, take: 100, select: { id: true, title: true, deadline: true, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
    prisma.test.findMany({ where: { authorId: teacher.id, courseId: { in: [...new Set(assignments.map((item) => item.courseId))] }, state: "PUBLISHED", closesAt: { gte: bounds.start, lt: bounds.end } }, orderBy: { closesAt: "asc" }, take: 100, select: { id: true, title: true, closesAt: true, course: { select: { subject: { select: { name: true } } } } } }),
  ]);
  const tasksWithoutDate = personalTasks.filter((task) => !task.dueAt);
  return { month, mode, selectedDate, today: moscowDateKey(now), lessons, personalTasks: personalTasks.filter((task) => task.dueAt), tasksWithoutDate, submissions, homeworkDeadlines, tests };
}

export async function getTeacherCalendarExport(semesterValue?: string) {
  const teacher = await requireRole(Role.TEACHER);
  const semester: AcademicSemester = semesterValue === "AUTUMN" || semesterValue === "SPRING" ? semesterValue : getDefaultAcademicSemester(new Date());
  const period = ACADEMIC_SEMESTERS_2026_2027[semester];
  const rangeStart = getMoscowDayBounds(new Date(period.start + "T12:00:00.000Z")).start;
  const rangeEnd = getMoscowDayBounds(new Date(period.end + "T12:00:00.000Z")).end;
  const assignments = await assignmentsFor(teacher.id, new Date());
  const pairs = assignments.map(({ courseId, groupId }) => ({ courseId, groupId }));
  const pairScope = pairs.length ? { OR: pairs } : { id: { in: [] as string[] } };
  const [lessons, tasks, reviews, homeworkDeadlines] = await Promise.all([
    prisma.lesson.findMany({ where: { OR: [{ teacherId: teacher.id }, { substituteId: teacher.id }, { examinerId: teacher.id }], state: { not: "CANCELLED" }, startsAt: { gte: rangeStart, lt: rangeEnd } }, orderBy: { startsAt: "asc" }, take: 1000, select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, room: { select: { code: true } }, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
    prisma.personalTask.findMany({ where: { ownerId: teacher.id, state: { not: "CANCELLED" }, dueAt: { not: null, gte: rangeStart, lt: rangeEnd } }, orderBy: { dueAt: "asc" }, take: 1000, select: { id: true, title: true, details: true, dueAt: true, endsAt: true, hasDueTime: true } }),
    prisma.submission.findMany({ where: { state: "UNDER_REVIEW", submittedAt: { not: null, gte: rangeStart, lt: rangeEnd }, homework: { authorId: teacher.id, ...pairScope } }, orderBy: { submittedAt: "asc" }, take: 1000, select: { id: true, submittedAt: true, homework: { select: { title: true, deadline: true, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } } } }),
    prisma.homework.findMany({ where: { authorId: teacher.id, state: "PUBLISHED", deadline: { gte: rangeStart, lt: rangeEnd }, ...pairScope }, orderBy: { deadline: "asc" }, take: 1000, select: { id: true, title: true, deadline: true, group: { select: { code: true } }, course: { select: { subject: { select: { name: true } } } } } }),
  ]);
  return { semester, lessons, tasks, reviews, homeworkDeadlines };
}

export async function getTeacherScheduleSubstitutes(lessonIdValue: string) {
  const teacher = await requireRole(Role.TEACHER);
  if (!/^[0-9a-f-]{36}$/i.test(lessonIdValue)) return [];
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonIdValue, teacherId: teacher.id, state: "SCHEDULED", startsAt: { gt: new Date() } }, select: { groupId: true, courseId: true } });
  if (!lesson) return [];
  const peers = await prisma.teacherAssignment.findMany({ where: { groupId: lesson.groupId, courseId: lesson.courseId, teacherId: { not: teacher.id }, ...activeAssignment(new Date()), teacher: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } } }, select: { teacherId: true, teacher: { select: { login: true, profile: { select: { displayName: true } } } } }, distinct: ["teacherId"] });
  return peers.map(({ teacherId, teacher: peer }) => ({ id: teacherId, name: peer.profile?.displayName ?? peer.login }));
}

export async function createTeacherPersonalTask(input: { title: unknown; details: unknown; date: unknown; startTime: unknown; endTime: unknown; allDay: unknown; category: unknown; priority: unknown; reminderMinutes: unknown }) {
  const teacher = await requireRole(Role.TEACHER);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  if (!title || title.length > 240 || details.length > 5000) throw new Error("Проверьте название и описание события.");
  const times = parseTaskEventTimes(input.date, input.startTime, input.endTime, input.allDay);
  const category = input.category === PersonalTaskCategory.WORK ? PersonalTaskCategory.WORK : input.category === PersonalTaskCategory.PERSONAL ? PersonalTaskCategory.PERSONAL : null;
  const priority = Object.values(PersonalTaskPriority).find((value) => value === input.priority);
  const minutes = Number(input.reminderMinutes ?? 0);
  if (!category || !priority || ![0, 5, 15, 30, 60, 1440].includes(minutes)) throw new Error("Проверьте категорию, приоритет и напоминание.");
  return prisma.$transaction(async (tx) => {
    const task = await tx.personalTask.create({ data: { ownerId: teacher.id, title, details: details || null, dueAt: times.startsAt, endsAt: times.endsAt, hasDueTime: !times.allDay, category, priority } });
    await tx.academicCalendarEvent.create({ data: { userId: teacher.id, kind: CalendarEventKind.PERSONAL_TASK, sourceType: "PERSONAL_TASK", sourceId: task.id, startsAt: times.startsAt, endsAt: times.endsAt, personalTaskId: task.id } });
    if (minutes > 0) await tx.reminder.create({ data: { kind: CalendarEventKind.PERSONAL_TASK, sourceType: "PERSONAL_TASK", sourceId: task.id, dueAt: times.startsAt, scheduledAt: new Date(times.startsAt.getTime() - minutes * 60000), personalTaskId: task.id } });
    return task.id;
  });
}

export async function updateTeacherPersonalTask(input: { id: unknown; version: unknown; title: unknown; details: unknown; date: unknown; startTime: unknown; endTime: unknown; allDay: unknown; category: unknown; priority: unknown; reminderMinutes: unknown; state?: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const id = String(input.id ?? ""); const version = Number(input.version);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(version)) throw new Error("Некорректная задача.");
  const title = typeof input.title === "string" ? input.title.trim() : ""; const details = typeof input.details === "string" ? input.details.trim() : "";
  if (!title || title.length > 240 || details.length > 5000) throw new Error("Проверьте название и описание события.");
  const times = parseTaskEventTimes(input.date, input.startTime, input.endTime, input.allDay);
  const category = input.category === PersonalTaskCategory.WORK ? PersonalTaskCategory.WORK : input.category === PersonalTaskCategory.PERSONAL ? PersonalTaskCategory.PERSONAL : null;
  const priority = Object.values(PersonalTaskPriority).find((value) => value === input.priority); const minutes = Number(input.reminderMinutes ?? 0);
  if (!category || !priority || ![0, 5, 15, 30, 60, 1440].includes(minutes)) throw new Error("Проверьте категорию, приоритет и напоминание.");
  return prisma.$transaction(async (tx) => {
    const changed = await tx.personalTask.updateMany({ where: { id, ownerId: teacher.id, version }, data: { title, details: details || null, dueAt: times.startsAt, endsAt: times.endsAt, hasDueTime: !times.allDay, category, priority, state: input.state === "COMPLETED" ? "COMPLETED" : "OPEN", version: { increment: 1 } } });
    if (!changed.count) throw new Error("Событие изменилось или недоступно. Обновите страницу.");
    await tx.academicCalendarEvent.upsert({ where: { userId_sourceType_sourceId: { userId: teacher.id, sourceType: "PERSONAL_TASK", sourceId: id } }, create: { userId: teacher.id, kind: CalendarEventKind.PERSONAL_TASK, sourceType: "PERSONAL_TASK", sourceId: id, startsAt: times.startsAt, endsAt: times.endsAt, personalTaskId: id }, update: { startsAt: times.startsAt, endsAt: times.endsAt, personalTaskId: id } });
    const pending = await tx.reminder.findMany({ where: { personalTaskId: id, sentAt: null }, orderBy: { scheduledAt: "asc" }, select: { id: true } });
    if (minutes === 0) {
      if (pending.length) await tx.reminder.deleteMany({ where: { id: { in: pending.map((item) => item.id) } } });
    } else if (pending[0]) {
      await tx.reminder.update({ where: { id: pending[0].id }, data: { dueAt: times.startsAt, scheduledAt: new Date(times.startsAt.getTime() - minutes * 60000) } });
      if (pending.length > 1) await tx.reminder.deleteMany({ where: { id: { in: pending.slice(1).map((item) => item.id) } } });
    } else {
      await tx.reminder.create({ data: { kind: CalendarEventKind.PERSONAL_TASK, sourceType: "PERSONAL_TASK", sourceId: id, dueAt: times.startsAt, scheduledAt: new Date(times.startsAt.getTime() - minutes * 60000), personalTaskId: id } });
    }
    return true;
  });
}

export async function deleteTeacherPersonalTask(idValue: string, versionValue: number) {
  const teacher = await requireRole(Role.TEACHER); const id = String(idValue ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(versionValue)) throw new Error("Некорректное событие.");
  return prisma.$transaction(async (tx) => {
    const removed = await tx.personalTask.deleteMany({ where: { id, ownerId: teacher.id, version: versionValue } });
    if (!removed.count) throw new Error("Событие недоступно или уже изменилось.");
    await tx.academicCalendarEvent.deleteMany({ where: { userId: teacher.id, sourceType: "PERSONAL_TASK", sourceId: id } });
    return true;
  });
}

export async function toggleTeacherPersonalTaskCompletion(idValue: unknown, versionValue: unknown) {
  const teacher = await requireRole(Role.TEACHER); const id = String(idValue ?? ""); const version = Number(versionValue);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(version)) throw new Error("Некорректное событие.");
  const existing = await prisma.personalTask.findFirst({ where: { id, ownerId: teacher.id, version }, select: { id: true, state: true } });
  if (!existing) throw new Error("Событие недоступно или уже изменилось.");
  const result = await prisma.personalTask.updateMany({ where: { id, ownerId: teacher.id, version }, data: { state: existing.state === "COMPLETED" ? "OPEN" : "COMPLETED", version: { increment: 1 } } });
  if (!result.count) throw new Error("Событие изменилось. Обновите страницу.");
  return true;
}

export async function getTeacherGroups() {
  const teacher = await requireRole(Role.TEACHER); const now = new Date(); const assignments = await assignmentsFor(teacher.id, now);
  const groupIds = [...new Set(assignments.map((item) => item.groupId))];
  if (!groupIds.length) return { groups: [] };
  const pairs = assignments.map(({ courseId, groupId }) => ({ courseId, groupId }));
  const pairScope = pairs.length ? { OR: pairs } : { id: { in: [] as string[] } };
  const [groups, memberships, assessments, pendingReviews] = await Promise.all([
    prisma.group.findMany({ where: { id: { in: groupIds } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.groupMembership.findMany({
      where: { groupId: { in: groupIds }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } },
      orderBy: [{ group: { code: "asc" } }, { student: { login: "asc" } }],
      select: { groupId: true, studentId: true, student: { select: { login: true, profile: { select: { displayName: true } }, studentAcademicProfile: { select: { academicStatus: true } } } } },
    }),
    prisma.assessment.findMany({ where: { groupId: { in: groupIds }, course: { assignments: { some: { teacherId: teacher.id, ...activeAssignment(now) } } }, state: AssessmentState.PUBLISHED }, select: { id: true, groupId: true, gradeEntries: { where: { currentRevision: { is: { state: GradeRevisionState.PUBLISHED, publishedAt: { not: null } } } }, select: { studentId: true } } } }),
    prisma.submission.findMany({ where: { state: "UNDER_REVIEW", homework: { authorId: teacher.id, ...pairScope } }, select: { studentId: true, homework: { select: { groupId: true } } } }),
  ]);
  return { groups: groups.map((group) => {
    const roster = memberships.filter((item) => item.groupId === group.id);
    const groupAssessments = assessments.filter((item) => item.groupId === group.id);
    const groupPending = pendingReviews.filter((item) => item.homework.groupId === group.id);
    return {
      id: group.id, code: group.code, name: group.name,
      courseNames: [...new Set(assignments.filter((item) => item.groupId === group.id).map((item) => item.course.subject.name))],
      courses: assignments.filter((item) => item.groupId === group.id).map((item) => ({ courseId: item.courseId, name: item.course.subject.name })),
      publishedGradeEntryCount: groupAssessments.reduce((sum, item) => sum + item.gradeEntries.length, 0),
      pendingReviewCount: groupPending.length,
      students: roster.map((item) => ({ id: item.studentId, login: item.student.login, name: item.student.profile?.displayName ?? item.student.login, academicStatus: item.student.studentAcademicProfile?.academicStatus ?? null, publishedWorkCount: groupAssessments.reduce((sum, assessment) => sum + assessment.gradeEntries.filter((entry) => entry.studentId === item.studentId).length, 0), pendingReviewCount: groupPending.filter((submission) => submission.studentId === item.studentId).length })),
    };
  }) };
}

export async function getTeacherGroupAnnouncements() {
  const teacher = await requireRole(Role.TEACHER); const assignments = await assignmentsFor(teacher.id, new Date());
  const groupIds = [...new Set(assignments.map((item) => item.groupId))];
  const announcements = groupIds.length ? await prisma.courseAnnouncement.findMany({ where: { groupId: { in: groupIds } }, orderBy: { publishedAt: "desc" }, take: 100, select: { id: true, title: true, body: true, publishedAt: true, groupId: true, courseId: true, course: { select: { name: true } }, group: { select: { code: true } } } }) : [];
  return announcements;
}

export async function createTeacherGroupAnnouncement(input: { groupId: unknown; courseId: unknown; title: unknown; body: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const groupId = String(input.groupId ?? ""); const courseId = String(input.courseId ?? "");
  const title = typeof input.title === "string" ? input.title.trim() : ""; const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(groupId) || !/^[0-9a-f-]{36}$/i.test(courseId) || !title || title.length > 240 || !body || body.length > 5000) throw new Error("Проверьте дисциплину, название и текст объявления.");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const assignment = await tx.teacherAssignment.findFirst({ where: { teacherId: teacher.id, groupId, courseId, ...activeAssignment(now), teacher: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } } }, select: { id: true } });
    if (!assignment) throw new Error("Объявление можно адресовать только группе вашей действующей дисциплины.");
    const announcement = await tx.courseAnnouncement.create({ data: { courseId, groupId, authorId: teacher.id, title, body, publishedAt: now }, select: { id: true } });
    const memberships = await tx.groupMembership.findMany({ where: { groupId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { studentId: true } });
    const recipientIds = [...new Set(memberships.map((item) => item.studentId))];
    if (recipientIds.length) {
      const notification = await tx.notification.create({ data: { category: NotificationCategory.COURSE_ANNOUNCEMENT, sourceType: "COURSE_ANNOUNCEMENT", sourceId: announcement.id, eventKey: `teacher-announcement:${announcement.id}:published`, title, body }, select: { id: true } });
      const muted = await tx.notificationPreference.findMany({ where: { userId: { in: recipientIds }, category: NotificationCategory.COURSE_ANNOUNCEMENT, muted: true }, select: { userId: true } });
      const mutedIds = new Set(muted.map((item) => item.userId));
      await tx.notificationDelivery.createMany({ data: recipientIds.map((recipientId) => ({ notificationId: notification.id, recipientId, channel: NotificationChannel.IN_APP, ...(mutedIds.has(recipientId) ? { mutedAt: now } : {}) })), skipDuplicates: true });
    }
    return announcement.id;
  }, { isolationLevel: "Serializable" });
}

export async function getTeacherGradebook(courseIdValue?: string, groupIdValue?: string) {
  const teacher = await requireRole(Role.TEACHER); const now = new Date(); const assignments = await assignmentsFor(teacher.id, now);
  const selected = assignments.find((item) => item.courseId === courseIdValue && item.groupId === groupIdValue) ?? assignments.find((item) => item.courseId === courseIdValue) ?? assignments[0] ?? null;
  if (!selected) return { assignments: [], selected: null, students: [], assessments: [], structures: [] };
  const [roster, structures, assessments] = await Promise.all([
    prisma.groupMembership.findMany({
      where: { groupId: selected.groupId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } },
      orderBy: { student: { login: "asc" } },
      select: { studentId: true, student: { select: { login: true, profile: { select: { displayName: true } } } } },
    }),
    prisma.assessmentStructureVersion.findMany({ where: { courseId: selected.courseId, publishedAt: { not: null } }, orderBy: { version: "desc" }, select: { id: true, version: true, publishedAt: true, reason: true, weights: { orderBy: { position: "asc" }, select: { id: true, componentId: true, componentName: true, maximumPoints: true, position: true, isRequired: true } } } }),
    prisma.assessment.findMany({ where: { courseId: selected.courseId, groupId: selected.groupId }, orderBy: [{ createdAt: "asc" }], select: { id: true, title: true, state: true, componentId: true, structureVersionId: true, publishedAt: true, component: { select: { name: true } }, gradeEntries: { select: { id: true, studentId: true, currentRevisionId: true, currentRevision: { select: { id: true, score: true, state: true, publishedAt: true, reason: true, retakeId: true } }, revisions: { orderBy: { createdAt: "desc" }, select: { id: true, score: true, reason: true, state: true, createdAt: true, publishedAt: true, author: { select: { profile: { select: { displayName: true } }, login: true } } } }, student: { select: { login: true, profile: { select: { displayName: true } } } } } } } }),
  ]);
  return serializeTeacherGradebook({
    assignments: assignments.map((item) => ({ id: item.id, courseId: item.courseId, groupId: item.groupId, courseName: item.course.subject.name, groupCode: item.group.code })),
    selected: { courseId: selected.courseId, groupId: selected.groupId, courseName: selected.course.subject.name, groupCode: selected.group.code },
    students: roster.map((item) => ({ id: item.studentId, login: item.student.login, name: item.student.profile?.displayName ?? item.student.login })),
    structures: structures.map((item) => ({ ...item, weights: item.weights.map((weight) => ({ ...weight, maximumPoints: weight.maximumPoints.toString() })) })),
    assessments: assessments.map((assessment) => ({ ...assessment, entries: assessment.gradeEntries.map((entry) => ({ ...entry, score: entry.currentRevision?.state === GradeRevisionState.PUBLISHED ? entry.currentRevision.score.toString() : null, pendingScore: entry.revisions.find((revision) => revision.state === GradeRevisionState.DRAFT)?.score.toString() ?? null, revisions: entry.revisions.map((revision) => ({ ...revision, score: revision.score.toString(), authorName: revision.author.profile?.displayName ?? revision.author.login })), studentName: entry.student.profile?.displayName ?? entry.student.login })) })),
  });
}

export async function getTeacherNotifications() {
  const teacher = await requireRole(Role.TEACHER);
  const [deliveries, preferences] = await Promise.all([
    prisma.notificationDelivery.findMany({ where: { recipientId: teacher.id }, orderBy: { createdAt: "desc" }, take: 150, select: { id: true, createdAt: true, readAt: true, mutedAt: true, notification: { select: { category: true, critical: true, title: true, body: true, sourceId: true, sourceType: true } } } }),
    prisma.notificationPreference.findMany({ where: { userId: teacher.id }, select: { category: true, muted: true } }),
  ]);
  return { deliveries, preferences: Object.fromEntries(preferences.map((item) => [item.category, !item.muted])) };
}

export async function markTeacherNotificationRead(deliveryId: string) {
  const teacher = await requireRole(Role.TEACHER);
  if (!/^[0-9a-f-]{36}$/i.test(deliveryId)) throw new Error("Некорректное уведомление.");
  return prisma.notificationDelivery.updateMany({ where: { id: deliveryId, recipientId: teacher.id, readAt: null }, data: { readAt: new Date() } });
}

export async function markTeacherNotificationCategoryRead() {
  const teacher = await requireRole(Role.TEACHER);
  return prisma.notificationDelivery.updateMany({ where: { recipientId: teacher.id, readAt: null, mutedAt: null }, data: { readAt: new Date() } });
}

export async function setTeacherNotificationPreference(categoryValue: unknown, enabled: boolean) {
  const teacher = await requireRole(Role.TEACHER); const category = Object.values(NotificationCategory).find((value) => value === categoryValue);
  if (!category || category === NotificationCategory.CRITICAL_OFFICIAL) throw new Error("Эту категорию нельзя отключить.");
  return prisma.$transaction(async (tx) => {
    await tx.notificationPreference.upsert({ where: { userId_category: { userId: teacher.id, category } }, create: { userId: teacher.id, category, muted: !enabled }, update: { muted: !enabled } });
    if (!enabled) await tx.notificationDelivery.updateMany({ where: { recipientId: teacher.id, notification: { category }, readAt: null }, data: { mutedAt: new Date() } });
  });
}

export async function saveTeacherGradeDrafts(input: unknown) {
  const teacher = await requireRole(Role.TEACHER);
  if (!Array.isArray(input)) throw new Error("Некорректный набор оценок.");
  const parsed = parseTeacherGradeDrafts(input as Array<{ assessmentId: unknown; studentId: unknown; score: unknown; reason: unknown }>);
  if (!parsed.ok) throw new Error(parsed.error);
  return prisma.$transaction(async (tx) => {
    const assessmentIds = [...new Set(parsed.rows.map((row) => row.assessmentId))];
    const assessments = await tx.assessment.findMany({ where: { id: { in: assessmentIds } }, select: { id: true, courseId: true, groupId: true, title: true, component: { select: { name: true } } } });
    if (assessments.length !== assessmentIds.length) throw new Error("Одна из работ недоступна.");
    const now = new Date();
    for (const row of parsed.rows) {
      const assessment = assessments.find((item) => item.id === row.assessmentId)!;
      const [assignment, membership, entry] = await Promise.all([
        tx.teacherAssignment.findFirst({ where: { teacherId: teacher.id, courseId: assessment.courseId, groupId: assessment.groupId, ...activeAssignment(now) }, select: { id: true } }),
        tx.groupMembership.findFirst({ where: { ...activeMembershipWhere(row.studentId, now), groupId: assessment.groupId, student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { id: true } }),
        tx.gradebookEntry.findUnique({ where: { assessmentId_studentId: { assessmentId: row.assessmentId, studentId: row.studentId } }, select: { id: true, currentRevision: { select: { state: true } } } }),
      ]);
      if (!assignment || !membership) throw new Error("Оценку можно выставить только студенту своей действующей группы.");
      if (entry?.currentRevision?.state === GradeRevisionState.PUBLISHED && !row.reason) throw new Error("Для изменения опубликованной оценки укажите причину.");
      const gradeEntry = entry ?? await tx.gradebookEntry.create({ data: { assessmentId: row.assessmentId, studentId: row.studentId }, select: { id: true, currentRevision: { select: { state: true } } } });
      const draft = await tx.gradeRevision.findFirst({ where: { entryId: gradeEntry.id, authorId: teacher.id, state: GradeRevisionState.DRAFT }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (draft) await tx.gradeRevision.update({ where: { id: draft.id }, data: { score: new Prisma.Decimal(row.score), reason: row.reason || null } });
      else await tx.gradeRevision.create({ data: { entryId: gradeEntry.id, authorId: teacher.id, score: new Prisma.Decimal(row.score), reason: row.reason || null } });
    }
    return { saved: parsed.rows.length };
  }, { isolationLevel: "Serializable" });
}

export async function publishTeacherGradeDraft(input: { assessmentId: unknown; studentId: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const assessmentId = String(input.assessmentId ?? ""); const studentId = String(input.studentId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(assessmentId) || !/^[0-9a-f-]{36}$/i.test(studentId)) throw new Error("Некорректная работа или студент.");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const assessment = await tx.assessment.findFirst({ where: { id: assessmentId, course: { assignments: { some: { teacherId: teacher.id, ...activeAssignment(now) } } } }, select: { id: true, courseId: true, groupId: true, title: true, homework: { select: { id: true } }, test: { select: { id: true } }, course: { select: { subject: { select: { name: true } } } } } });
    if (!assessment) throw new Error("Работа не относится к вашим действующим назначениям.");
    const membership = await tx.groupMembership.findFirst({ where: { ...activeMembershipWhere(studentId, now), groupId: assessment.groupId }, select: { id: true } });
    if (!membership) throw new Error("Студент не состоит в группе этой работы.");
    const entry = await tx.gradebookEntry.findUnique({ where: { assessmentId_studentId: { assessmentId, studentId } }, select: { id: true, currentRevisionId: true, revisions: { where: { authorId: teacher.id, state: GradeRevisionState.DRAFT }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, reason: true } } } });
    const revision = entry?.revisions[0];
    if (!entry || !revision) throw new Error("Черновик оценки не найден.");
    if (entry.currentRevisionId && !revision.reason?.trim()) throw new Error("Для исправления опубликованной оценки требуется причина.");
    if (entry.currentRevisionId) await tx.gradeRevision.updateMany({ where: { id: entry.currentRevisionId, entryId: entry.id, state: GradeRevisionState.PUBLISHED }, data: { state: GradeRevisionState.SUPERSEDED } });
    await tx.gradeRevision.update({ where: { id: revision.id }, data: { state: GradeRevisionState.PUBLISHED, publishedAt: now } });
    await tx.gradebookEntry.update({ where: { id: entry.id }, data: { currentRevisionId: revision.id, version: { increment: 1 } } });
    const category = assessment.homework ? NotificationCategory.HOMEWORK : assessment.test ? NotificationCategory.TEST : NotificationCategory.OTHER;
    const eventKey = `grade:${revision.id}:published`;
    const notice = await tx.notification.upsert({ where: { eventKey }, create: { category, sourceType: "GRADE", sourceId: assessment.id, eventKey, title: "Опубликована оценка", body: `Опубликован результат работы «${assessment.title}» по дисциплине «${assessment.course.subject.name}».` }, update: {} });
    const preference = await tx.notificationPreference.findUnique({ where: { userId_category: { userId: studentId, category } }, select: { muted: true } });
    await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: studentId, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: studentId, ...(preference?.muted ? { mutedAt: now } : {}) }, update: {} });
    return { published: true, assessmentTitle: assessment.title };
  }, { isolationLevel: "Serializable" });
}

export async function createTeacherAssessmentStructure(input: { courseId: unknown; rawComponents: unknown; reason: unknown }) {
  const teacher = await requireRole(Role.TEACHER); const courseId = String(input.courseId ?? ""); const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(courseId) || reason.length > 1000) throw new Error("Проверьте дисциплину и пояснение.");
  const parsed = validateAssessmentStructureInput(input.rawComponents);
  if (!parsed.ok) throw new Error(parsed.error);
  if (!reason) throw new Error("Укажите причину создания новой версии структуры оценивания.");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const assignment = await tx.teacherAssignment.findFirst({ where: { teacherId: teacher.id, courseId, ...activeAssignment(now) }, select: { id: true } });
    if (!assignment) throw new Error("Структуру можно менять только для своей действующей дисциплины.");
    const previous = await tx.assessmentStructureVersion.aggregate({ where: { courseId }, _max: { version: true } });
    const version = (previous._max.version ?? 0) + 1;
    const components = [];
    for (const item of parsed.components) {
      const component = await tx.assessmentComponent.upsert({ where: { courseId_name: { courseId, name: item.name } }, create: { courseId, name: item.name }, update: {} });
      components.push({ ...item, componentId: component.id });
    }
    const structure = await tx.assessmentStructureVersion.create({ data: { courseId, version, createdById: teacher.id, createdAt: now, publishedAt: now, reason, weights: { create: components.map((item) => ({ componentId: item.componentId, courseId, componentName: item.name, maximumPoints: new Prisma.Decimal(item.maximumPoints), isRequired: false, position: item.position, effectiveAt: now })) } }, select: { id: true, version: true } });
    return structure;
  }, { isolationLevel: "Serializable" });
}

export async function createTeacherScheduleSubstitution(input: { lessonId: unknown; substituteId: unknown; reason: unknown }) {
  const teacher = await requireRole(Role.TEACHER);
  const lessonId = String(input.lessonId ?? "");
  const substituteId = String(input.substituteId ?? "");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(lessonId) || !/^[0-9a-f-]{36}$/i.test(substituteId) || substituteId === teacher.id || reason.length < 3 || reason.length > 2000) {
    throw new Error("Проверьте занятие, преподавателя-замену и причину запроса.");
  }
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const lesson = await tx.lesson.findFirst({
      where: { id: lessonId, teacherId: teacher.id, state: "SCHEDULED", startsAt: { gt: now } },
      select: { id: true, version: true, startsAt: true, endsAt: true, roomId: true, format: true, title: true, courseId: true, groupId: true },
    });
    if (!lesson) throw new Error("Можно запросить замену только для своего будущего занятия.");
    const [assignment, substitute] = await Promise.all([
      tx.teacherAssignment.findFirst({ where: { teacherId: teacher.id, courseId: lesson.courseId, groupId: lesson.groupId, ...activeAssignment(now) }, select: { id: true } }),
      tx.user.findFirst({ where: { id: substituteId, isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } }, select: { id: true } }),
    ]);
    if (!assignment || !substitute) throw new Error("Преподаватель или назначение недоступны.");
    const pending = await tx.scheduleChangeRequest.findFirst({ where: { lessonId, requesterId: teacher.id, kind: ScheduleChangeKind.SUBSTITUTE, state: "PENDING" }, select: { id: true } });
    if (pending) throw new Error("Для этого занятия уже ожидает решения запрос на замену.");
    const request = await tx.scheduleChangeRequest.create({ data: { lessonId, requesterId: teacher.id, baseVersion: lesson.version, kind: ScheduleChangeKind.SUBSTITUTE, reason }, select: { id: true } });
    const proposal = await tx.scheduleChangeProposal.create({ data: { requestId: request.id, startsAt: lesson.startsAt, endsAt: lesson.endsAt, roomId: lesson.roomId, format: lesson.format, substituteId }, select: { id: true } });
    await tx.substituteConsent.create({ data: { requestId: request.id, proposalId: proposal.id, teacherId: substituteId, state: ConsentState.PENDING } });
    const deans = await tx.user.findMany({ where: { isActive: true, roles: { some: { role: Role.DEAN, revokedAt: null } } }, select: { id: true } });
    if (deans.length) {
      const eventKey = `schedule-substitute:${request.id}:submitted`;
      const notification = await tx.notification.create({ data: { category: NotificationCategory.SCHEDULE, sourceType: "SCHEDULE_CHANGE_REQUEST", sourceId: request.id, eventKey, title: "Запрос на замену преподавателя", body: `Поступил запрос на замену для занятия «${lesson.title}».`, critical: false }, select: { id: true } });
      const mutedPreferences = await tx.notificationPreference.findMany({ where: { userId: { in: deans.map(({ id }) => id) }, category: NotificationCategory.SCHEDULE, muted: true }, select: { userId: true } });
      const muted = new Set(mutedPreferences.map((preference) => preference.userId));
      await tx.notificationDelivery.createMany({ data: deans.map(({ id }) => ({ notificationId: notification.id, recipientId: id, channel: NotificationChannel.IN_APP, ...(muted.has(id) ? { mutedAt: now } : {}) })), skipDuplicates: true });
    }
    return request.id;
  }, { isolationLevel: "Serializable" });
}
