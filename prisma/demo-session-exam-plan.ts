import { stableDemoSeedId } from "./demo-schedule-layout";
import { moscowDateTime } from "./demo-schedule-update-core";
import type { LessonScheduleCandidate } from "../src/lib/schedule/lesson-rules";

export type DemoGroupCode = "ЦМ-26-1" | "ЦМ-26-2" | "ЦМ-25-2";
export type DemoExamSession = "winter-2027" | "summer-2027";

export type DemoSessionExam = {
  session: DemoExamSession;
  courseKey: string;
  groupCode: DemoGroupCode;
  date: string;
  startTime: string;
  endTime: string;
  examinerLogin: string;
  roomCode: string;
  origin: { kind: "MOVE"; sourceDate: string } | { kind: "CREATE" };
};

// The three autumn exam Lessons keep their IDs and history when moved. The
// remaining rows are deterministic new events. An exam never creates a grade.
export const DEMO_SESSION_EXAM_PLAN: readonly DemoSessionExam[] = [
  { session: "winter-2027", courseKey: "consumer-behavior", groupCode: "ЦМ-26-1", date: "2027-01-11", startTime: "19:00", endTime: "21:00", examinerLogin: "krylova.e_teacher", roomCode: "А-201", origin: { kind: "MOVE", sourceDate: "2026-11-28" } },
  { session: "winter-2027", courseKey: "digital-marketing", groupCode: "ЦМ-26-1", date: "2027-01-13", startTime: "19:00", endTime: "21:00", examinerLogin: "volkova.m_teacher", roomCode: "А-204", origin: { kind: "CREATE" } },
  { session: "winter-2027", courseKey: "marketing-analytics", groupCode: "ЦМ-26-1", date: "2027-01-18", startTime: "19:00", endTime: "21:00", examinerLogin: "mironova.a_teacher", roomCode: "Б-105", origin: { kind: "CREATE" } },
  { session: "winter-2027", courseKey: "brand-management", groupCode: "ЦМ-26-2", date: "2027-01-12", startTime: "19:00", endTime: "21:00", examinerLogin: "sokolov.d_teacher", roomCode: "А-204", origin: { kind: "MOVE", sourceDate: "2026-12-05" } },
  { session: "winter-2027", courseKey: "digital-marketing", groupCode: "ЦМ-26-2", date: "2027-01-14", startTime: "19:00", endTime: "21:00", examinerLogin: "volkova.m_teacher", roomCode: "Б-210", origin: { kind: "CREATE" } },
  { session: "winter-2027", courseKey: "digital-advertising", groupCode: "ЦМ-26-2", date: "2027-01-19", startTime: "19:00", endTime: "21:00", examinerLogin: "orlov.m_teacher", roomCode: "Б-105", origin: { kind: "CREATE" } },
  { session: "winter-2027", courseKey: "strategic-marketing", groupCode: "ЦМ-25-2", date: "2027-01-15", startTime: "19:00", endTime: "21:00", examinerLogin: "mironova.a_teacher", roomCode: "Б-105", origin: { kind: "MOVE", sourceDate: "2026-12-12" } },
  { session: "winter-2027", courseKey: "marketing-research", groupCode: "ЦМ-25-2", date: "2027-01-20", startTime: "19:00", endTime: "21:00", examinerLogin: "fedorova.n_teacher", roomCode: "Б-210", origin: { kind: "CREATE" } },
  { session: "winter-2027", courseKey: "marketing-strategies", groupCode: "ЦМ-25-2", date: "2027-01-21", startTime: "19:00", endTime: "21:00", examinerLogin: "volkova.m_teacher", roomCode: "В-301", origin: { kind: "CREATE" } },

  { session: "summer-2027", courseKey: "marketing-communications", groupCode: "ЦМ-26-1", date: "2027-06-15", startTime: "19:00", endTime: "21:00", examinerLogin: "sokolov.d_teacher", roomCode: "В-301", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "crm-customer-analytics", groupCode: "ЦМ-26-1", date: "2027-06-17", startTime: "19:00", endTime: "21:00", examinerLogin: "mironova.a_teacher", roomCode: "Б-105", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "customer-experience-management", groupCode: "ЦМ-26-1", date: "2027-06-21", startTime: "19:00", endTime: "21:00", examinerLogin: "krylova.e_teacher", roomCode: "В-305", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "content-marketing-social-media", groupCode: "ЦМ-26-1", date: "2027-06-23", startTime: "19:00", endTime: "21:00", examinerLogin: "volkova.m_teacher", roomCode: "А-201", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "marketing-communications", groupCode: "ЦМ-26-2", date: "2027-06-16", startTime: "19:00", endTime: "21:00", examinerLogin: "sokolov.d_teacher", roomCode: "В-301", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "crm-customer-analytics", groupCode: "ЦМ-26-2", date: "2027-06-18", startTime: "19:00", endTime: "21:00", examinerLogin: "mironova.a_teacher", roomCode: "Б-105", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "customer-experience-management", groupCode: "ЦМ-26-2", date: "2027-06-22", startTime: "19:00", endTime: "21:00", examinerLogin: "krylova.e_teacher", roomCode: "В-305", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "content-marketing-social-media", groupCode: "ЦМ-26-2", date: "2027-06-24", startTime: "19:00", endTime: "21:00", examinerLogin: "volkova.m_teacher", roomCode: "А-201", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "marketing-communications", groupCode: "ЦМ-25-2", date: "2027-06-25", startTime: "19:00", endTime: "21:00", examinerLogin: "sokolov.d_teacher", roomCode: "В-301", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "crm-customer-analytics", groupCode: "ЦМ-25-2", date: "2027-06-28", startTime: "19:00", endTime: "21:00", examinerLogin: "mironova.a_teacher", roomCode: "Б-105", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "customer-experience-management", groupCode: "ЦМ-25-2", date: "2027-06-29", startTime: "19:00", endTime: "21:00", examinerLogin: "krylova.e_teacher", roomCode: "В-305", origin: { kind: "CREATE" } },
  { session: "summer-2027", courseKey: "content-marketing-social-media", groupCode: "ЦМ-25-2", date: "2027-06-30", startTime: "19:00", endTime: "21:00", examinerLogin: "volkova.m_teacher", roomCode: "А-201", origin: { kind: "CREATE" } },
];

export function demoExamId(exam: DemoSessionExam): string {
  if (exam.origin.kind === "MOVE") {
    return stableDemoSeedId(`exam:${exam.courseKey}:${exam.groupCode}:${exam.origin.sourceDate}`);
  }
  return stableDemoSeedId(`academic-year-exam:${exam.session}:${exam.courseKey}:${exam.groupCode}`);
}

export function buildDemoSessionExamCandidates(session?: DemoExamSession): LessonScheduleCandidate[] {
  return DEMO_SESSION_EXAM_PLAN.filter((exam) => session === undefined || exam.session === session).map((exam) => ({
    id: demoExamId(exam),
    kind: "EXAM",
    state: "SCHEDULED",
    startsAt: moscowDateTime(exam.date, exam.startTime),
    endsAt: moscowDateTime(exam.date, exam.endTime),
    groupId: stableDemoSeedId(`group:${exam.groupCode}`),
    roomId: stableDemoSeedId(`room:${exam.roomCode}`),
    teacherId: null,
    substituteId: null,
    examinerId: stableDemoSeedId(`user:${exam.examinerLogin}`),
  }));
}
