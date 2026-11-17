import { isLessonScheduleValid, type LessonScheduleCandidate } from "../src/lib/schedule/lesson-rules";
import { stableDemoSeedId } from "./demo-schedule-layout";
import { moscowDateTime } from "./demo-schedule-update-core";
import type { DemoGroupCode } from "./demo-session-exam-plan";

export const SPRING_TERM_START = "2027-02-08";
export const SPRING_TERM_END = "2027-05-29";
export const SPRING_TEACHING_WEEKS = 16;
export const SPRING_2027_PUBLIC_CALENDAR_SOURCE_URL = "https://www.consultant.ru/law/ref/calendar/proizvodstvennye/2027/";

// Based on the published 2027 production calendar and Government Decree
// 1187 of 17 September 2026. Saturday teaching remains permitted by the
// university timetable; Sundays and federal non-working dates are omitted.
export const SPRING_2027_PUBLIC_NON_TEACHING_DATES = new Set([
  "2027-02-22", "2027-02-23", "2027-03-08", "2027-05-01", "2027-05-03", "2027-05-08", "2027-05-10",
]);
export const SPRING_2027_ADDITIONAL_NON_TEACHING_DATES: ReadonlySet<string> = new Set();

export type SpringCourseKey =
  | "marketing-communications"
  | "crm-customer-analytics"
  | "customer-experience-management"
  | "content-marketing-social-media";

export type SpringCourseDefinition = {
  key: SpringCourseKey;
  code: string;
  subjectCode: string;
  name: string;
  teacherLogin: string;
};

export const DEMO_SPRING_COURSES: readonly SpringCourseDefinition[] = [
  { key: "marketing-communications", code: "MC-2027", subjectCode: "SUB-MC-2027", name: "Маркетинговые коммуникации", teacherLogin: "sokolov.d_teacher" },
  { key: "crm-customer-analytics", code: "CRM-2027", subjectCode: "SUB-CRM-2027", name: "CRM и аналитика клиентских данных", teacherLogin: "mironova.a_teacher" },
  { key: "customer-experience-management", code: "CXM-2027", subjectCode: "SUB-CXM-2027", name: "Управление клиентским опытом", teacherLogin: "krylova.e_teacher" },
  { key: "content-marketing-social-media", code: "CMS-2027", subjectCode: "SUB-CMS-2027", name: "Контент-маркетинг и социальные сети", teacherLogin: "volkova.m_teacher" },
];

export type SpringOffering = {
  courseKey: SpringCourseKey;
  groupCode: DemoGroupCode;
  teacherLogin: string;
  roomCode: string;
  weekdayOffset: number;
  startTime: string;
  endTime: string;
};

export const DEMO_SPRING_OFFERINGS: readonly SpringOffering[] = [
  { courseKey: "marketing-communications", groupCode: "ЦМ-26-1", teacherLogin: "sokolov.d_teacher", roomCode: "В-301", weekdayOffset: 0, startTime: "19:00", endTime: "20:20" },
  { courseKey: "crm-customer-analytics", groupCode: "ЦМ-26-1", teacherLogin: "mironova.a_teacher", roomCode: "Б-105", weekdayOffset: 2, startTime: "20:30", endTime: "21:50" },
  { courseKey: "customer-experience-management", groupCode: "ЦМ-26-1", teacherLogin: "krylova.e_teacher", roomCode: "В-305", weekdayOffset: 4, startTime: "19:00", endTime: "20:20" },
  { courseKey: "content-marketing-social-media", groupCode: "ЦМ-26-1", teacherLogin: "volkova.m_teacher", roomCode: "А-201", weekdayOffset: 5, startTime: "14:30", endTime: "15:50" },

  { courseKey: "marketing-communications", groupCode: "ЦМ-26-2", teacherLogin: "sokolov.d_teacher", roomCode: "В-301", weekdayOffset: 1, startTime: "19:00", endTime: "20:20" },
  { courseKey: "crm-customer-analytics", groupCode: "ЦМ-26-2", teacherLogin: "mironova.a_teacher", roomCode: "Б-210", weekdayOffset: 3, startTime: "19:00", endTime: "20:20" },
  { courseKey: "customer-experience-management", groupCode: "ЦМ-26-2", teacherLogin: "krylova.e_teacher", roomCode: "В-305", weekdayOffset: 5, startTime: "10:35", endTime: "11:55" },
  { courseKey: "content-marketing-social-media", groupCode: "ЦМ-26-2", teacherLogin: "volkova.m_teacher", roomCode: "А-204", weekdayOffset: 4, startTime: "20:30", endTime: "21:50" },

  { courseKey: "marketing-communications", groupCode: "ЦМ-25-2", teacherLogin: "sokolov.d_teacher", roomCode: "А-201", weekdayOffset: 2, startTime: "19:00", endTime: "20:20" },
  { courseKey: "crm-customer-analytics", groupCode: "ЦМ-25-2", teacherLogin: "mironova.a_teacher", roomCode: "А-204", weekdayOffset: 4, startTime: "19:00", endTime: "20:20" },
  { courseKey: "customer-experience-management", groupCode: "ЦМ-25-2", teacherLogin: "krylova.e_teacher", roomCode: "В-305", weekdayOffset: 1, startTime: "20:30", endTime: "21:50" },
  { courseKey: "content-marketing-social-media", groupCode: "ЦМ-25-2", teacherLogin: "volkova.m_teacher", roomCode: "А-204", weekdayOffset: 5, startTime: "12:55", endTime: "14:15" },
];

export type DemoSpringLesson = SpringOffering & {
  id: string;
  date: string;
  weekIndex: number;
  title: string;
  format: "Лекция" | "Семинар";
  startsAt: Date;
  endsAt: Date;
  courseId: string;
  groupId: string;
  teacherId: string;
  roomId: string;
};

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function buildDemoSpringLessons(): DemoSpringLesson[] {
  if (DEMO_SPRING_COURSES.length !== 4 || DEMO_SPRING_OFFERINGS.length !== 12) {
    throw new Error("The spring plan requires four new courses and twelve course/group offerings.");
  }
  const courseByKey = new Map(DEMO_SPRING_COURSES.map((course) => [course.key, course]));
  const result: DemoSpringLesson[] = [];
  for (let weekIndex = 0; weekIndex < SPRING_TEACHING_WEEKS; weekIndex += 1) {
    for (const offering of DEMO_SPRING_OFFERINGS) {
      const date = addDays(SPRING_TERM_START, weekIndex * 7 + offering.weekdayOffset);
      if (date > SPRING_TERM_END || SPRING_2027_PUBLIC_NON_TEACHING_DATES.has(date)
        || SPRING_2027_ADDITIONAL_NON_TEACHING_DATES.has(date)) continue;
      const course = courseByKey.get(offering.courseKey);
      if (!course || course.teacherLogin !== offering.teacherLogin) {
        throw new Error(`Invalid spring course/teacher mapping for ${offering.courseKey}.`);
      }
      const startsAt = moscowDateTime(date, offering.startTime);
      const endsAt = moscowDateTime(date, offering.endTime);
      if (!isLessonScheduleValid("CLASS", startsAt, endsAt)) {
        throw new Error(`Invalid spring class slot ${offering.groupCode}/${course.name} on ${date}.`);
      }
      const id = stableDemoSeedId(`spring-lesson:${offering.courseKey}:${offering.groupCode}:${date}`);
      result.push({
        ...offering,
        id,
        date,
        weekIndex,
        title: `${course.name} — ${(weekIndex % 2 === 0 ? "лекция" : "семинар")} ${weekIndex + 1}`,
        format: weekIndex % 2 === 0 ? "Лекция" : "Семинар",
        startsAt,
        endsAt,
        courseId: stableDemoSeedId(`course:spring:${course.key}`),
        groupId: stableDemoSeedId(`group:${offering.groupCode}`),
        teacherId: stableDemoSeedId(`user:${offering.teacherLogin}`),
        roomId: stableDemoSeedId(`room:${offering.roomCode}`),
      });
    }
  }
  return result;
}

export function buildDemoSpringLessonCandidates(): LessonScheduleCandidate[] {
  return buildDemoSpringLessons().map((lesson) => ({
    id: lesson.id,
    kind: "CLASS",
    state: "SCHEDULED",
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    groupId: lesson.groupId,
    roomId: lesson.roomId,
    teacherId: lesson.teacherId,
    substituteId: null,
    examinerId: null,
  }));
}
