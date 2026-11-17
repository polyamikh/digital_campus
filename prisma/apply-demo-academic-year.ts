import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { validateLocalDatabaseUrl } from "../src/lib/auth/demo-password-reset-core";
import { createPrismaPgConfig } from "../src/lib/prisma-pg-config";
import { findScheduleConflicts, lessonScheduleViolation, type LessonScheduleCandidate } from "../src/lib/schedule/lesson-rules";
import { isLoopbackAddress, moscowDateTime, sameInstant } from "./demo-schedule-update-core";
import { stableDemoSeedId } from "./demo-schedule-layout";
import { buildDemoSpringLessons, DEMO_SPRING_COURSES, DEMO_SPRING_OFFERINGS, SPRING_TERM_END, SPRING_TERM_START, type DemoSpringLesson } from "./demo-spring-semester-plan";
import { buildDemoSessionExamCandidates, demoExamId, DEMO_SESSION_EXAM_PLAN, type DemoSessionExam } from "./demo-session-exam-plan";
import { assertAcademicYearApplyConfirmed, isAssignableTeacher, resolveAcademicYearMode, type AcademicYearScriptMode } from "./demo-academic-year-safety";

const PLAN_MARKER = "demo-academic-year-plan-2026-2027-v1";
const MOSCOW = "+03:00";
const GROUP_CODES = ["ЦМ-26-1", "ЦМ-26-2", "ЦМ-25-2"] as const;
const EXISTING_COURSES = [
  ["digital-marketing", "Digital Marketing", "volkova.m_teacher"],
  ["marketing-analytics", "Marketing Analytics", "mironova.a_teacher"],
  ["consumer-behavior", "Consumer Behavior", "sokolov.d_teacher"],
  ["brand-management", "Brand Management", "krylova.e_teacher"],
  ["strategic-marketing", "Strategic Marketing", "voronov.a_teacher"],
  ["e-commerce", "E-commerce", "lebedeva.v_teacher"],
  ["digital-advertising", "Digital Advertising", "orlov.m_teacher"],
  ["marketing-research", "Marketing Research", "fedorova.n_teacher"],
  ["marketing-strategies", "Marketing Strategies", "volkova.m_teacher"],
] as const;

type DbClient = PrismaClient | Prisma.TransactionClient;
type PlannedLessonData = {
  id: string;
  courseId: string;
  groupId: string;
  teacherId: string | null;
  examinerId: string | null;
  substituteId: string | null;
  roomId: string | null;
  title: string;
  format: string | null;
  kind: "CLASS" | "EXAM";
  startsAt: Date;
  endsAt: Date;
  state: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  version: number;
};
type LessonRecord = Prisma.LessonGetPayload<{
  include: {
    versions: { orderBy: { version: "asc" } };
    changeRequests: { select: { state: true } };
    attendanceRecords: { select: { id: true } };
    staffReservations: { select: { staffId: true; startsAt: true; endsAt: true; isActive: true } };
    calendarEvents: { select: { id: true; userId: true; startsAt: true; endsAt: true; sourceType: true; sourceId: true } };
  };
}>;

function asSnapshot(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("У LessonScheduleVersion обнаружен некорректный snapshot.");
  }
  return value as Record<string, Prisma.JsonValue>;
}

function lessonStateMatchesSnapshot(lesson: LessonRecord): boolean {
  const latest = lesson.versions.at(-1);
  if (!latest || latest.version !== lesson.version || lesson.versions.length !== lesson.version) return false;
  const snapshot = asSnapshot(latest.snapshot);
  return snapshot.courseId === lesson.courseId
    && snapshot.groupId === lesson.groupId
    && snapshot.teacherId === lesson.teacherId
    && snapshot.examinerId === lesson.examinerId
    && (snapshot.substituteId === lesson.substituteId || snapshot.substituteId === undefined && lesson.substituteId === null)
    && snapshot.roomId === lesson.roomId
    && snapshot.title === lesson.title
    && snapshot.format === lesson.format
    && snapshot.kind === lesson.kind
    && snapshot.state === lesson.state
    && sameInstant(snapshot.startsAt, lesson.startsAt)
    && sameInstant(snapshot.endsAt, lesson.endsAt);
}

function makeSnapshot(lesson: PlannedLessonData, marker?: string): Prisma.InputJsonObject {
  return {
    courseId: lesson.courseId,
    groupId: lesson.groupId,
    teacherId: lesson.teacherId ?? null,
    examinerId: lesson.examinerId ?? null,
    substituteId: lesson.substituteId ?? null,
    roomId: lesson.roomId ?? null,
    title: lesson.title,
    format: lesson.format ?? null,
    kind: lesson.kind,
    state: lesson.state,
    startsAt: lesson.startsAt.toISOString(),
    endsAt: lesson.endsAt.toISOString(),
    ...(marker ? { academicYearPlan: marker } : {}),
  };
}

function expectedStaffIds(lesson: { teacherId: string | null; examinerId: string | null; substituteId: string | null }): string[] {
  return [...new Set([lesson.substituteId ?? lesson.teacherId, lesson.examinerId].filter((id): id is string => id !== null))].sort();
}

function reservationsMatch(lesson: LessonRecord): boolean {
  const active = lesson.staffReservations.filter((row) => row.isActive);
  const actualIds = active.map((row) => row.staffId).sort();
  const expectedIds = lesson.state === "SCHEDULED" ? expectedStaffIds(lesson) : [];
  return JSON.stringify(actualIds) === JSON.stringify(expectedIds)
    && active.every((row) => row.startsAt.getTime() === lesson.startsAt.getTime() && row.endsAt.getTime() === lesson.endsAt.getTime());
}

function expectedClassLesson(row: DemoSpringLesson): PlannedLessonData {
  return {
    id: row.id,
    courseId: row.courseId,
    groupId: row.groupId,
    teacherId: row.teacherId,
    examinerId: null,
    substituteId: null,
    roomId: row.roomId,
    title: row.title,
    format: row.format,
    kind: "CLASS",
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    state: "SCHEDULED",
    version: 1,
  };
}

function expectedExamLesson(row: DemoSessionExam): PlannedLessonData {
  const candidate = buildDemoSessionExamCandidates(row.session).find((item) => item.id === demoExamId(row));
  if (!candidate) throw new Error(`Не удалось построить экзамен ${row.courseKey}/${row.groupCode}.`);
  const courseId = row.courseKey.startsWith("marketing-communications")
    || row.courseKey.startsWith("crm-") || row.courseKey.startsWith("customer-")
    || row.courseKey.startsWith("content-")
    ? stableDemoSeedId(`course:spring:${row.courseKey}`)
    : stableDemoSeedId(`course:${row.courseKey}`);
  const courseName = [...EXISTING_COURSES.map((course) => [course[0], course[1]] as const), ...DEMO_SPRING_COURSES.map((course) => [course.key, course.name] as const)]
    .find(([key]) => key === row.courseKey)?.[1];
  if (!courseName) throw new Error(`Неизвестная дисциплина ${row.courseKey}.`);
  return {
    id: candidate.id,
    courseId,
    groupId: candidate.groupId,
    teacherId: null,
    examinerId: candidate.examinerId,
    substituteId: null,
    roomId: candidate.roomId,
    title: `${courseName} — демонстрационный экзамен`,
    format: null,
    kind: "EXAM",
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    state: "SCHEDULED",
    version: 1,
  };
}

function sameLessonFields(actual: LessonRecord, expected: PlannedLessonData, compareVersion = true): boolean {
  return actual.id === expected.id
    && actual.courseId === expected.courseId
    && actual.groupId === expected.groupId
    && actual.teacherId === (expected.teacherId ?? null)
    && actual.examinerId === (expected.examinerId ?? null)
    && actual.substituteId === (expected.substituteId ?? null)
    && actual.roomId === (expected.roomId ?? null)
    && actual.title === expected.title
    && actual.format === (expected.format ?? null)
    && actual.kind === expected.kind
    && actual.state === expected.state
    && (!compareVersion || actual.version === expected.version)
    && actual.startsAt.getTime() === expected.startsAt.getTime()
    && actual.endsAt.getTime() === expected.endsAt.getTime();
}

function hasPlanMarker(lesson: LessonRecord): boolean {
  const latest = lesson.versions.at(-1);
  return Boolean(latest && asSnapshot(latest.snapshot).academicYearPlan === PLAN_MARKER);
}

function idOfExistingExam(row: DemoSessionExam): string {
  return demoExamId(row);
}

function sourceExamFieldsMatch(lesson: LessonRecord, row: DemoSessionExam): boolean {
  if (row.origin.kind !== "MOVE") return false;
  const expectedCourseId = stableDemoSeedId(`course:${row.courseKey}`);
  const expectedGroupId = stableDemoSeedId(`group:${row.groupCode}`);
  const expectedExaminerId = stableDemoSeedId(`user:${row.examinerLogin}`);
  const oldRoom = row.roomCode;
  const oldStartsAt = moscowDateTime(row.origin.sourceDate, "11:00");
  const oldEndsAt = moscowDateTime(row.origin.sourceDate, "13:00");
  const courseName = EXISTING_COURSES.find(([key]) => key === row.courseKey)?.[1];
  return lesson.id === idOfExistingExam(row)
    && lesson.courseId === expectedCourseId
    && lesson.groupId === expectedGroupId
    && lesson.teacherId === null
    && lesson.examinerId === expectedExaminerId
    && lesson.substituteId === null
    && lesson.roomId === stableDemoSeedId(`room:${oldRoom}`)
    && lesson.title === `${courseName} — демонстрационный экзамен`
    && lesson.format === null
    && lesson.kind === "EXAM"
    && lesson.state === "SCHEDULED"
    && lesson.startsAt.getTime() === oldStartsAt.getTime()
    && lesson.endsAt.getTime() === oldEndsAt.getTime();
}

function expectedAcademicEventData(lesson: PlannedLessonData, userId: string): Prisma.AcademicCalendarEventCreateManyInput {
  return {
    id: stableDemoSeedId(`calendar:lesson:${userId}:${lesson.id}`),
    userId,
    kind: lesson.kind === "EXAM" ? "EXAM" : "LESSON",
    sourceType: "LESSON",
    sourceId: lesson.id,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    lessonId: lesson.id,
    homeworkId: null,
    testId: null,
    personalTaskId: null,
    assignedTaskId: null,
  };
}

function eventProjectionMatches(events: LessonRecord["calendarEvents"], expected: Prisma.AcademicCalendarEventCreateManyInput[]): boolean {
  const actualByUser = new Map(events.map((event) => [event.userId, event]));
  return actualByUser.size === expected.length && expected.every((row) => {
    const actual = actualByUser.get(row.userId);
    const expectedStart = row.startsAt instanceof Date ? row.startsAt : new Date(row.startsAt);
    const expectedEnd = row.endsAt == null ? null : row.endsAt instanceof Date ? row.endsAt : new Date(row.endsAt);
    return actual !== undefined && actual.sourceType === "LESSON" && actual.sourceId === row.lessonId
      && sameInstant(actual.startsAt, expectedStart)
      && (actual.endsAt?.getTime() ?? null) === (expectedEnd?.getTime() ?? null);
  });
}

function scheduledCandidate(lesson: LessonRecord | PlannedLessonData): LessonScheduleCandidate {
  return {
    id: lesson.id,
    kind: lesson.kind,
    state: lesson.state,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    groupId: lesson.groupId,
    roomId: lesson.roomId,
    teacherId: lesson.teacherId ?? null,
    substituteId: lesson.substituteId ?? null,
    examinerId: lesson.examinerId ?? null,
  };
}

function addMonthsRange() {
  return {
    semesterStart: new Date(`2026-09-01T00:00:00.000${MOSCOW}`),
    summerEnd: new Date(`2027-07-06T00:00:00.000${MOSCOW}`),
  };
}

async function inspect(db: DbClient, now: Date) {
  const springRows = buildDemoSpringLessons();
  const examCandidates = buildDemoSessionExamCandidates();
  if (springRows.length !== 180 || DEMO_SESSION_EXAM_PLAN.length !== 21) {
    throw new Error("Внутренний план не прошёл проверку ожидаемых количеств: 180 занятий и 21 экзамен.");
  }

  const requiredLogins = [...new Set([
    ...EXISTING_COURSES.map(([, , teacher]) => teacher),
    ...DEMO_SPRING_COURSES.map((course) => course.teacherLogin),
    ...DEMO_SESSION_EXAM_PLAN.map((exam) => exam.examinerLogin),
  ])];
  const users = await db.user.findMany({
    where: { login: { in: requiredLogins } },
    select: { id: true, login: true, isActive: true, roles: { where: { revokedAt: null }, select: { role: true, revokedAt: true } } },
  });
  const userByLogin = new Map(users.map((user) => [user.login, user]));
  for (const login of requiredLogins) {
    const user = userByLogin.get(login);
    if (!user) {
      throw new Error(`Не найден преподаватель: ${login}.`);
    }
    if (!isAssignableTeacher(user)) {
      throw new Error(`Нет активного преподавателя с действующей ролью TEACHER: ${login}.`);
    }
    if (user.id !== stableDemoSeedId(`user:${login}`)) throw new Error(`ID преподавателя ${login} отличается от ожидаемого демо-ID.`);
  }

  const groups = await db.group.findMany({ where: { code: { in: [...GROUP_CODES] } }, select: { id: true, code: true } });
  const groupByCode = new Map(groups.map((group) => [group.code, group]));
  for (const code of GROUP_CODES) {
    const group = groupByCode.get(code);
    if (!group || group.id !== stableDemoSeedId(`group:${code}`)) throw new Error(`Группа ${code} отсутствует или не совпадает с ожидаемой.`);
  }
  const roomCodes = [...new Set([
    ...DEMO_SPRING_OFFERINGS.map((offering) => offering.roomCode),
    ...DEMO_SESSION_EXAM_PLAN.map((exam) => exam.roomCode),
  ])];
  const rooms = await db.room.findMany({ where: { code: { in: roomCodes } }, select: { id: true, code: true } });
  const roomByCode = new Map(rooms.map((room) => [room.code, room]));
  for (const code of roomCodes) {
    const room = roomByCode.get(code);
    if (!room || room.id !== stableDemoSeedId(`room:${code}`)) throw new Error(`Аудитория ${code} отсутствует или не совпадает с ожидаемой.`);
  }

  const existingCourseIds = EXISTING_COURSES.map(([key]) => stableDemoSeedId(`course:${key}`));
  const existingCourses = await db.course.findMany({ where: { id: { in: existingCourseIds } }, select: { id: true, name: true } });
  const existingCourseMap = new Map(existingCourses.map((course) => [course.id, course]));
  for (const [key, name] of EXISTING_COURSES) {
    const course = existingCourseMap.get(stableDemoSeedId(`course:${key}`));
    if (!course || course.name !== name) throw new Error(`Существующая дисциплина ${name} отсутствует или отличается от демоданных.`);
  }

  const allCourseIds = [
    ...existingCourseIds,
    ...DEMO_SPRING_COURSES.map((course) => stableDemoSeedId(`course:spring:${course.key}`)),
  ];
  const allLessons = await db.lesson.findMany({
    include: {
      versions: { orderBy: { version: "asc" } },
      changeRequests: { select: { state: true } },
      attendanceRecords: { select: { id: true } },
      staffReservations: { select: { staffId: true, startsAt: true, endsAt: true, isActive: true } },
      calendarEvents: { select: { id: true, userId: true, startsAt: true, endsAt: true, sourceType: true, sourceId: true } },
    },
  });
  const lessonById = new Map(allLessons.map((lesson) => [lesson.id, lesson]));
  const moved: Array<{ row: DemoSessionExam; current: LessonRecord }> = [];
  const examsToCreate: DemoSessionExam[] = [];
  let examsAlreadyCorrect = 0;

  for (const row of DEMO_SESSION_EXAM_PLAN) {
    const id = demoExamId(row);
    const current = lessonById.get(id);
    const expected = expectedExamLesson(row);
    if (row.origin.kind === "MOVE") {
      if (!current) throw new Error(`Не найден существующий экзамен для переноса: ${row.courseKey}/${row.groupCode}/${row.origin.sourceDate}.`);
      if (!lessonStateMatchesSnapshot(current) || !reservationsMatch(current)) throw new Error(`Нарушена история или StaffReservation экзамена ${id}.`);
      if (current.changeRequests.some((request) => request.state === "PENDING")) throw new Error(`Для экзамена ${id} есть незавершённый запрос изменения расписания.`);
      if (current.attendanceRecords.length > 0) throw new Error(`У экзамена ${id} есть посещаемость; перенос требует ручной проверки.`);
      const isSourceRecord = sourceExamFieldsMatch(current, row);
      const expectedEvents = await expectedEventsForLesson(db, isSourceRecord ? current : expected);
      if (!eventProjectionMatches(current.calendarEvents, expectedEvents)) throw new Error(`Календарные проекции экзамена ${id} отсутствуют или расходятся с Lesson.`);
      if (isSourceRecord) {
        if (current.startsAt < now) throw new Error(`Исходный экзамен ${id} уже прошёл; автоматический перенос запрещён.`);
        moved.push({ row, current });
      } else if (sameLessonFields(current, expected, false) && hasPlanMarker(current)) {
        examsAlreadyCorrect += 1;
      } else {
        throw new Error(`Экзамен ${id} изменён относительно исходных или утверждённых данных; автоматическая перезапись запрещена.`);
      }
    } else if (current) {
      if (!sameLessonFields(current, expected) || !lessonStateMatchesSnapshot(current) || !reservationsMatch(current)
        || !hasPlanMarker(current) || current.changeRequests.some((request) => request.state === "PENDING")) {
        throw new Error(`Новая экзаменационная запись ${id} уже существует с неожиданными данными; требуется ручная проверка.`);
      }
      const expectedEvents = await expectedEventsForLesson(db, expected);
      if (!eventProjectionMatches(current.calendarEvents, expectedEvents)) throw new Error(`Календарные проекции экзамена ${id} отсутствуют или расходятся с Lesson.`);
      examsAlreadyCorrect += 1;
    } else {
      examsToCreate.push(row);
    }
  }

  const springToCreate: DemoSpringLesson[] = [];
  let springAlreadyCorrect = 0;
  const plannedSpringIds = new Set(springRows.map((row) => row.id));
  for (const row of springRows) {
    const current = lessonById.get(row.id);
    const expected = expectedClassLesson(row);
    if (current) {
      if (!sameLessonFields(current, expected) || !lessonStateMatchesSnapshot(current) || !reservationsMatch(current)
        || !hasPlanMarker(current) || current.changeRequests.some((request) => request.state === "PENDING")
        || current.attendanceRecords.length > 0) {
        throw new Error(`Весеннее занятие ${row.id} уже существует с неожиданными данными; требуется ручная проверка.`);
      }
      const expectedEvents = await expectedEventsForLesson(db, expected);
      if (!eventProjectionMatches(current.calendarEvents, expectedEvents)) throw new Error(`Календарные проекции занятия ${row.id} отсутствуют или расходятся с Lesson.`);
      springAlreadyCorrect += 1;
    } else {
      springToCreate.push(row);
    }
  }

  const springCourseIds = new Set(allCourseIds.slice(existingCourseIds.length));
  const extraSpringLessons = allLessons.filter((lesson) => lesson.kind === "CLASS"
    && springCourseIds.has(lesson.courseId) && !plannedSpringIds.has(lesson.id));
  if (extraSpringLessons.length) throw new Error(`У новых дисциплин уже есть ${extraSpringLessons.length} неучтённых занятий.`);

  const expectedPlanExamIds = new Set(DEMO_SESSION_EXAM_PLAN.map(demoExamId));
  const { semesterStart, summerEnd } = addMonthsRange();
  const academicYearExams = allLessons.filter((lesson) => lesson.kind === "EXAM" && lesson.state === "SCHEDULED"
    && lesson.startsAt >= semesterStart && lesson.startsAt < summerEnd);
  const unexpectedAcademicYearExams = academicYearExams.filter((lesson) => !expectedPlanExamIds.has(lesson.id));
  if (unexpectedAcademicYearExams.length) throw new Error(`В 2026/2027 учебном году есть ${unexpectedAcademicYearExams.length} незапланированных экзаменов; запись остановлена во избежание дублей или пропуска событий.`);

  const subjectResults: Array<{ courseKey: string; status: "create" | "existing" }> = [];
  for (const course of DEMO_SPRING_COURSES) {
    const subjectId = stableDemoSeedId(`subject:spring:${course.key}`);
    const courseId = stableDemoSeedId(`course:spring:${course.key}`);
    const teacherId = userByLogin.get(course.teacherLogin)?.id;
    if (!teacherId) throw new Error(`Преподаватель для ${course.name} не найден.`);
    const [subjectById, subjectByCode, courseById, courseByCode] = await Promise.all([
      db.subject.findUnique({ where: { id: subjectId }, select: { id: true, code: true, name: true } }),
      db.subject.findUnique({ where: { code: course.subjectCode }, select: { id: true, code: true, name: true } }),
      db.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, name: true, subjectId: true, ownerId: true } }),
      db.course.findFirst({ where: { code: course.code }, select: { id: true, code: true, name: true, subjectId: true, ownerId: true } }),
    ]);
    if (subjectById && (subjectById.code !== course.subjectCode || subjectById.name !== course.name)) throw new Error(`Subject ${course.key} ID уже занят несовпадающими данными.`);
    if (subjectByCode && subjectByCode.id !== subjectId) throw new Error(`Код предмета ${course.subjectCode} уже занят другой записью.`);
    if (courseById && (courseById.code !== course.code || courseById.name !== course.name || courseById.subjectId !== subjectId || courseById.ownerId !== teacherId)) throw new Error(`Course ${course.key} ID уже занят несовпадающими данными.`);
    if (courseByCode && courseByCode.id !== courseId) throw new Error(`Код курса ${course.code} уже занят другой записью.`);
    subjectResults.push({ courseKey: course.key, status: subjectById && courseById ? "existing" : "create" });
  }

  const membershipRows = await db.groupMembership.findMany({
    where: { groupId: { in: GROUP_CODES.map((code) => stableDemoSeedId(`group:${code}`)) }, OR: [{ endsAt: null }, { endsAt: { gt: new Date(`${SPRING_TERM_START}T00:00:00.000${MOSCOW}`) } }] },
    select: { groupId: true, studentId: true, startsAt: true },
  });
  const membersByGroup = new Map<string, string[]>();
  for (const groupCode of GROUP_CODES) membersByGroup.set(stableDemoSeedId(`group:${groupCode}`), []);
  for (const membership of membershipRows) {
    const groupMembers = membersByGroup.get(membership.groupId);
    if (!groupMembers) continue;
    if (membership.startsAt && membership.startsAt > new Date(`${SPRING_TERM_START}T00:00:00.000${MOSCOW}`)) continue;
    groupMembers.push(membership.studentId);
  }
  if (GROUP_CODES.some((code) => (membersByGroup.get(stableDemoSeedId(`group:${code}`))?.length ?? 0) === 0)) {
    throw new Error("Для одной из групп отсутствует активный студенческий состав; календарные проекции не будут созданы.");
  }

  const offeringResults: Array<{ key: string; courseGroup: "create" | "existing"; teacherAssignment: "create" | "existing" }> = [];
  const springCourseByKey = new Map(DEMO_SPRING_COURSES.map((course) => [course.key, course]));
  for (const offering of DEMO_SPRING_OFFERINGS) {
    const course = springCourseByKey.get(offering.courseKey);
    if (!course) throw new Error(`Не найдена дисциплина назначения ${offering.courseKey}.`);
    const courseId = stableDemoSeedId(`course:spring:${course.key}`);
    const groupId = stableDemoSeedId(`group:${offering.groupCode}`);
    const teacherId = userByLogin.get(offering.teacherLogin)?.id;
    if (!teacherId) throw new Error(`Нет преподавателя ${offering.teacherLogin}.`);
    const courseGroup = await db.courseGroup.findUnique({ where: { courseId_groupId: { courseId, groupId } }, select: { id: true } });
    const expectedCourseGroupId = stableDemoSeedId(`course-group:spring:${offering.courseKey}:${offering.groupCode}`);
    if (courseGroup && courseGroup.id !== expectedCourseGroupId) throw new Error(`Назначение CourseGroup ${offering.courseKey}/${offering.groupCode} использует неожиданный ID.`);
    const start = new Date(`${SPRING_TERM_START}T00:00:00.000${MOSCOW}`);
    const end = new Date(`${SPRING_TERM_END}T23:59:59.999${MOSCOW}`);
    const assignment = await db.teacherAssignment.findUnique({
      where: { teacherId_courseId_groupId: { teacherId, courseId, groupId } },
      select: { id: true, startsAt: true, endsAt: true },
    });
    const expectedAssignmentId = stableDemoSeedId(`teacher-assignment:spring:${offering.courseKey}:${offering.groupCode}`);
    if (assignment && (assignment.id !== expectedAssignmentId || assignment.startsAt?.getTime() !== start.getTime() || assignment.endsAt?.getTime() !== end.getTime())) {
      throw new Error(`TeacherAssignment ${offering.courseKey}/${offering.groupCode} расходится с утверждённым планом.`);
    }
    offeringResults.push({ key: `${offering.courseKey}/${offering.groupCode}`, courseGroup: courseGroup ? "existing" : "create", teacherAssignment: assignment ? "existing" : "create" });
  }

  const updates = moved.map(({ row, current }) => {
    const expected = expectedExamLesson(row);
    const nextSnapshot = makeSnapshot(expected, PLAN_MARKER);
    return { id: current.id, currentVersion: current.version, data: expected, snapshot: nextSnapshot, eventCount: current.calendarEvents.length };
  });
  const updateById = new Map(updates.map((row) => [row.id, row]));
  const finalById = new Map<string, LessonScheduleCandidate>();
  for (const lesson of allLessons) if (lesson.state === "SCHEDULED") finalById.set(lesson.id, scheduledCandidate(lesson));
  for (const [id, update] of updateById) finalById.set(id, scheduledCandidate(update.data));
  for (const row of examsToCreate) {
    const expected = expectedExamLesson(row);
    finalById.set(expected.id, scheduledCandidate(expected));
  }
  for (const row of springToCreate) {
    const expected = expectedClassLesson(row);
    finalById.set(expected.id, scheduledCandidate(expected));
  }
  const finalCandidates = [...finalById.values()];
  const conflicts = findScheduleConflicts(finalCandidates);
  const invalidPlanned = [...updates.map((row) => row.data), ...examsToCreate.map(expectedExamLesson), ...springToCreate.map(expectedClassLesson)]
    .map((row) => ({ id: row.id, violation: lessonScheduleViolation(row.kind, row.startsAt, row.endsAt) }))
    .filter((row): row is { id: string; violation: string } => row.violation !== null);
  const idCollisions = [...springRows.map((row) => row.id), ...examCandidates.map((row) => row.id)];
  if (new Set(idCollisions).size !== idCollisions.length) throw new Error("В плановых Lesson обнаружены дублирующиеся устойчивые ID.");

  return {
    springRows,
    springToCreate,
    springAlreadyCorrect,
    examsToCreate,
    examsAlreadyCorrect,
    moved,
    updates,
    subjectResults,
    offeringResults,
    conflicts,
    invalidPlanned,
    currentConflicts: findScheduleConflicts(allLessons.filter((lesson) => lesson.state === "SCHEDULED").map(scheduledCandidate)),
  };
}

async function expectedEventsForLesson(db: DbClient, lesson: PlannedLessonData | LessonRecord): Promise<Prisma.AcademicCalendarEventCreateManyInput[]> {
  const members = await db.groupMembership.findMany({
    where: { groupId: lesson.groupId, OR: [{ endsAt: null }, { endsAt: { gt: lesson.startsAt } }] },
    select: { studentId: true, startsAt: true },
  });
  const userIds = new Set(members.filter((row) => !row.startsAt || row.startsAt <= lesson.startsAt).map((row) => row.studentId));
  const staffId = lesson.kind === "EXAM" ? lesson.examinerId : lesson.teacherId;
  if (staffId) userIds.add(staffId);
  return [...userIds].map((userId) => expectedAcademicEventData(lesson, userId));
}

function printReport(report: Awaited<ReturnType<typeof inspect>>): void {
  console.log("План демонстрационного учебного года 2026/2027:");
  console.log(`  Новые дисциплины: ${report.subjectResults.filter((row) => row.status === "create").length} из ${DEMO_SPRING_COURSES.length} (${report.subjectResults.filter((row) => row.status === "existing").length} уже есть).`);
  console.log(`  Новые назначения группа–дисциплина: ${report.offeringResults.filter((row) => row.courseGroup === "create").length} CourseGroup и ${report.offeringResults.filter((row) => row.teacherAssignment === "create").length} TeacherAssignment.`);
  console.log(`  Весенние занятия: ${report.springToCreate.length} создать, ${report.springAlreadyCorrect} уже соответствуют плану, всего ${report.springRows.length}.`);
  console.log(`  Экзамены: перенести ${report.updates.length}, создать ${report.examsToCreate.length}, уже выполнено ${report.examsAlreadyCorrect}.`);
  console.log(`  Текущие конфликты расписания: ${report.currentConflicts.length}; после плана: ${report.conflicts.length}; недопустимые новые слоты: ${report.invalidPlanned.length}.`);
  for (const conflict of report.currentConflicts) console.log(`  Текущий конфликт ${conflict.resource} ${conflict.resourceId}: ${conflict.lessonIds.join(" / ")}`);
  for (const row of report.moved) console.log(`  Перенос ${row.row.courseKey}/${row.row.groupCode}: ${row.row.origin.kind === "MOVE" ? row.row.origin.sourceDate : "?"} → ${row.row.date} ${row.row.startTime}–${row.row.endTime} (Lesson ${row.current.id}).`);
  for (const conflict of report.conflicts) console.log(`  Конфликт ${conflict.resource} ${conflict.resourceId}: ${conflict.lessonIds.join(" / ")}`);
  for (const invalid of report.invalidPlanned) console.log(`  Недопустимый слот Lesson ${invalid.id}: ${invalid.violation}`);
  console.log("  Изменяются только новые Subject/Course/CourseGroup/TeacherAssignment, новые Lesson, их календарные проекции и версии; три существующих экзамена получают новую дату/версию.");
  console.log("  Оценки, ДЗ, посещаемость, пароли, профили и осенние занятия в набор записи не входят.");
}

async function applyPlan(tx: Prisma.TransactionClient, report: Awaited<ReturnType<typeof inspect>>): Promise<void> {
  if (report.conflicts.length || report.invalidPlanned.length || report.currentConflicts.length > 0) {
    throw new Error("Применение остановлено: устраните существующие или плановые конфликты/недопустимые слоты.");
  }
  await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;

  const teacherByLogin = new Map((await tx.user.findMany({
    where: { login: { in: [...new Set([...DEMO_SPRING_COURSES.map((course) => course.teacherLogin), ...DEMO_SESSION_EXAM_PLAN.map((exam) => exam.examinerLogin)])] } },
    select: { id: true, login: true },
  })).map((user) => [user.login, user.id]));
  for (const course of DEMO_SPRING_COURSES) {
    const teacherId = teacherByLogin.get(course.teacherLogin);
    if (!teacherId) throw new Error(`Преподаватель ${course.teacherLogin} не найден во время транзакции.`);
    const subjectId = stableDemoSeedId(`subject:spring:${course.key}`);
    const courseId = stableDemoSeedId(`course:spring:${course.key}`);
    const existingSubject = await tx.subject.findUnique({ where: { id: subjectId } });
    if (!existingSubject) await tx.subject.create({ data: { id: subjectId, code: course.subjectCode, name: course.name } });
    const existingCourse = await tx.course.findUnique({ where: { id: courseId } });
    if (!existingCourse) await tx.course.create({ data: { id: courseId, code: course.code, name: course.name, subjectId, ownerId: teacherId } });
  }

  const start = new Date(`${SPRING_TERM_START}T00:00:00.000${MOSCOW}`);
  const end = new Date(`${SPRING_TERM_END}T23:59:59.999${MOSCOW}`);
  for (const offering of DEMO_SPRING_OFFERINGS) {
    const courseId = stableDemoSeedId(`course:spring:${offering.courseKey}`);
    const groupId = stableDemoSeedId(`group:${offering.groupCode}`);
    const teacherId = teacherByLogin.get(offering.teacherLogin);
    if (!teacherId) throw new Error(`Преподаватель ${offering.teacherLogin} не найден.`);
    const courseGroupId = stableDemoSeedId(`course-group:spring:${offering.courseKey}:${offering.groupCode}`);
    if (!await tx.courseGroup.findUnique({ where: { courseId_groupId: { courseId, groupId } } })) {
      await tx.courseGroup.create({ data: { id: courseGroupId, courseId, groupId } });
    }
    const assignmentId = stableDemoSeedId(`teacher-assignment:spring:${offering.courseKey}:${offering.groupCode}`);
    if (!await tx.teacherAssignment.findUnique({ where: { teacherId_courseId_groupId: { teacherId, courseId, groupId } } })) {
      await tx.teacherAssignment.create({ data: { id: assignmentId, teacherId, courseId, groupId, startsAt: start, endsAt: end } });
    }
  }

  for (const update of report.updates) {
    const result = await tx.lesson.updateMany({
      where: { id: update.id, version: update.currentVersion, state: "SCHEDULED" },
      data: { startsAt: update.data.startsAt, endsAt: update.data.endsAt, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new Error(`Lesson ${update.id} изменился конкурентно; транзакция будет отменена.`);
    await tx.lessonScheduleVersion.create({
      data: {
        id: stableDemoSeedId(`lesson-schedule-version:${update.id}:${PLAN_MARKER}`),
        lessonId: update.id,
        version: update.currentVersion + 1,
        snapshot: update.snapshot,
        changedAt: new Date(),
      },
    });
    const eventUpdate = await tx.academicCalendarEvent.updateMany({
      where: { lessonId: update.id, sourceType: "LESSON", sourceId: update.id },
      data: { startsAt: update.data.startsAt, endsAt: update.data.endsAt },
    });
    if (eventUpdate.count !== update.eventCount) throw new Error(`Число календарных проекций экзамена ${update.id} изменилось; транзакция будет отменена.`);
  }

  const allCourseByKey = new Map<string, string>();
  for (const [key] of EXISTING_COURSES) allCourseByKey.set(key, stableDemoSeedId(`course:${key}`));
  for (const course of DEMO_SPRING_COURSES) allCourseByKey.set(course.key, stableDemoSeedId(`course:spring:${course.key}`));
  const createRows: PlannedLessonData[] = [
    ...report.springToCreate.map(expectedClassLesson),
    ...report.examsToCreate.map(expectedExamLesson),
  ];
  const knownCourseIds = new Set(allCourseByKey.values());
  for (const lesson of createRows) {
    if (!knownCourseIds.has(lesson.courseId)) throw new Error(`Неизвестная дисциплина для Lesson ${lesson.id}.`);
    await tx.lesson.create({ data: lesson });
    await tx.lessonScheduleVersion.create({
      data: {
        id: stableDemoSeedId(`lesson-schedule-version:${lesson.id}:1`),
        lessonId: lesson.id,
        version: 1,
        snapshot: makeSnapshot(lesson, PLAN_MARKER),
        changedAt: new Date(),
      },
    });
    const events = await expectedEventsForLesson(tx, lesson);
    await tx.academicCalendarEvent.createMany({ data: events, skipDuplicates: false });
  }

  const changedIds = [...report.updates.map((row) => row.id), ...createRows.map((row) => row.id)];
  const reloaded = await tx.lesson.findMany({
    where: { id: { in: changedIds } },
    include: {
      versions: { orderBy: { version: "asc" } },
      changeRequests: { select: { state: true } },
      attendanceRecords: { select: { id: true } },
      staffReservations: { select: { staffId: true, startsAt: true, endsAt: true, isActive: true } },
      calendarEvents: { select: { id: true, userId: true, startsAt: true, endsAt: true, sourceType: true, sourceId: true } },
    },
  });
  if (reloaded.length !== changedIds.length || reloaded.some((lesson) => !lessonStateMatchesSnapshot(lesson) || !reservationsMatch(lesson))) {
    throw new Error("Проверка истории или StaffReservation после записи не прошла; транзакция будет отменена.");
  }
}

async function main(): Promise<void> {
  const mode: AcademicYearScriptMode = resolveAcademicYearMode(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  const target = validateLocalDatabaseUrl(connectionString);
  assertAcademicYearApplyConfirmed(mode, process.env);
  if (!connectionString) throw new Error("DATABASE_URL не задан.");
  const prisma = new PrismaClient({ adapter: new PrismaPg(createPrismaPgConfig(connectionString)) });
  try {
    const endpoint = await prisma.$queryRaw<Array<{ databaseName: string; serverAddress: string | null; sessionTimezone: string }>>`
      SELECT current_database() AS "databaseName", inet_server_addr()::text AS "serverAddress", current_setting('TimeZone') AS "sessionTimezone"
    `;
    const server = endpoint[0];
    if (target.database !== "digital_campus" || server?.databaseName !== "digital_campus"
      || !server.serverAddress || !isLoopbackAddress(server.serverAddress) || server.sessionTimezone !== "UTC") {
      throw new Error("Запуск разрешён только для loopback PostgreSQL digital_campus с UTC-сессией.");
    }
    if (mode === "dry-run") {
      const report = await inspect(prisma, new Date());
      printReport(report);
      console.log("Dry-run: база данных не изменялась.");
      return;
    }
    await prisma.$transaction(async (tx) => {
      const report = await inspect(tx, new Date());
      printReport(report);
      await applyPlan(tx, report);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 120_000 });
    console.log("Демонстрационный учебный план применён.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const connectionString = process.env.DATABASE_URL;
  const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
  console.error(`План учебного года остановлен безопасно: ${message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[подключение скрыто]").replace(connectionString ?? "\u0000", "[подключение скрыто]")}`);
  process.exitCode = 1;
});
