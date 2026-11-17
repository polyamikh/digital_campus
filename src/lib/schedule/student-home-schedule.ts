import "server-only";

import { prisma } from "@/lib/prisma";
import { getMoscowWeekBounds, moscowDateKey, moscowTime } from "./moscow-time";
import { isLessonScheduleValid } from "./lesson-rules";
import { activeMembershipWhere, studentLessonWhere } from "./schedule-query";

export type StudentLessonDto = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  discipline: string;
  type: string;
  teacherOrExaminer: string | null;
  room: string | null;
};

export type StudentHomeSchedule = {
  todayDate: string;
  groupCode: string | null;
  lessons: StudentLessonDto[];
  timeWindowViolationCount: number;
  membershipProblem: "missing" | "ambiguous" | null;
};

export async function getStudentScheduleForWeek(studentId: string, weekContaining: Date, now = new Date()): Promise<StudentHomeSchedule> {
  const memberships = await prisma.groupMembership.findMany({
    where: activeMembershipWhere(studentId, now),
    select: { groupId: true, group: { select: { code: true } } },
    take: 2,
  });

  if (memberships.length !== 1) {
    return {
      todayDate: moscowDateKey(now),
      groupCode: null,
      lessons: [],
      timeWindowViolationCount: 0,
      membershipProblem: memberships.length === 0 ? "missing" : "ambiguous",
    };
  }

  const range = getMoscowWeekBounds(weekContaining);
  const rows = await prisma.lesson.findMany({
    where: studentLessonWhere(memberships[0].groupId, range.start, range.end),
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      title: true,
      format: true,
      kind: true,
      course: { select: { subject: { select: { name: true } } } },
      teacher: { select: { profile: { select: { displayName: true } } } },
      examiner: { select: { profile: { select: { displayName: true } } } },
      substitute: { select: { profile: { select: { displayName: true } } } },
      room: { select: { code: true } },
    },
  });

  const lessons: StudentLessonDto[] = rows.map((lesson) => ({
    id: lesson.id,
    date: moscowDateKey(lesson.startsAt),
    startTime: moscowTime(lesson.startsAt),
    endTime: moscowTime(lesson.endsAt),
    discipline: lesson.course.subject.name || lesson.title,
    type: lesson.kind === "EXAM" ? "Экзамен" : lesson.format || "Занятие",
    teacherOrExaminer: lesson.kind === "EXAM"
      ? lesson.examiner?.profile?.displayName ?? null
      : lesson.substitute?.profile?.displayName ?? lesson.teacher?.profile?.displayName ?? null,
    room: lesson.room?.code ?? null,
  }));

  return {
    todayDate: moscowDateKey(now),
    groupCode: memberships[0].group.code,
    lessons,
    timeWindowViolationCount: rows.filter((lesson) => !isLessonScheduleValid(lesson.kind, lesson.startsAt, lesson.endsAt)).length,
    membershipProblem: null,
  };
}

export function getStudentHomeSchedule(studentId: string, now = new Date()): Promise<StudentHomeSchedule> {
  return getStudentScheduleForWeek(studentId, now, now);
}
