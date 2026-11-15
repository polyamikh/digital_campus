import { createHash } from "node:crypto";

export type DemoGroupCode = "ЦМ-26-1" | "ЦМ-26-2" | "ЦМ-25-2";

export type DemoOfferingSchedule = {
  courseKey: string;
  groupCode: DemoGroupCode;
  teacherLogin: string;
  roomCode: string;
  weekdayOffset: number;
  startTime: string;
  endTime: string;
  legacyStartTime: string;
};

export const DEMO_SCHEDULE_NAMESPACE = "digital-campus-contest-seed-v1";
export const DEMO_SCHEDULE_FIRST_MONDAY = "2026-09-14";
export const DEMO_SCHEDULE_WEEKS = 15;

// Stable offering keys preserve seeded Lesson IDs because their date keys stay unchanged.
export const DEMO_OFFERING_SCHEDULE: readonly DemoOfferingSchedule[] = [
  { courseKey: "digital-marketing", groupCode: "ЦМ-26-1", teacherLogin: "volkova.m_teacher", roomCode: "А-201", weekdayOffset: 0, startTime: "19:00", endTime: "20:20", legacyStartTime: "19:00" },
  { courseKey: "digital-marketing", groupCode: "ЦМ-26-2", teacherLogin: "volkova.m_teacher", roomCode: "А-204", weekdayOffset: 0, startTime: "20:30", endTime: "21:50", legacyStartTime: "20:00" },
  { courseKey: "marketing-analytics", groupCode: "ЦМ-26-1", teacherLogin: "mironova.a_teacher", roomCode: "Б-105", weekdayOffset: 0, startTime: "20:30", endTime: "21:50", legacyStartTime: "21:00" },
  { courseKey: "marketing-analytics", groupCode: "ЦМ-26-2", teacherLogin: "mironova.a_teacher", roomCode: "Б-210", weekdayOffset: 1, startTime: "19:00", endTime: "20:20", legacyStartTime: "19:00" },
  { courseKey: "consumer-behavior", groupCode: "ЦМ-26-1", teacherLogin: "sokolov.d_teacher", roomCode: "В-301", weekdayOffset: 1, startTime: "19:00", endTime: "20:20", legacyStartTime: "20:00" },
  { courseKey: "brand-management", groupCode: "ЦМ-26-2", teacherLogin: "krylova.e_teacher", roomCode: "В-305", weekdayOffset: 1, startTime: "20:30", endTime: "21:50", legacyStartTime: "21:00" },
  { courseKey: "strategic-marketing", groupCode: "ЦМ-25-2", teacherLogin: "voronov.a_teacher", roomCode: "А-201", weekdayOffset: 2, startTime: "19:00", endTime: "20:20", legacyStartTime: "19:00" },
  { courseKey: "e-commerce", groupCode: "ЦМ-26-1", teacherLogin: "lebedeva.v_teacher", roomCode: "А-204", weekdayOffset: 2, startTime: "19:00", endTime: "20:20", legacyStartTime: "20:00" },
  { courseKey: "digital-advertising", groupCode: "ЦМ-26-2", teacherLogin: "orlov.m_teacher", roomCode: "Б-105", weekdayOffset: 2, startTime: "19:00", endTime: "20:20", legacyStartTime: "21:00" },
  { courseKey: "marketing-research", groupCode: "ЦМ-25-2", teacherLogin: "fedorova.n_teacher", roomCode: "Б-210", weekdayOffset: 3, startTime: "19:00", endTime: "20:20", legacyStartTime: "19:00" },
  { courseKey: "marketing-strategies", groupCode: "ЦМ-25-2", teacherLogin: "volkova.m_teacher", roomCode: "В-301", weekdayOffset: 3, startTime: "20:30", endTime: "21:50", legacyStartTime: "20:00" },
];

export function demoOfferingSchedule(courseKey: string, groupCode: string): DemoOfferingSchedule {
  const offering = DEMO_OFFERING_SCHEDULE.find((row) => row.courseKey === courseKey && row.groupCode === groupCode);
  if (!offering) throw new Error(`No approved demo schedule slot for ${courseKey}:${groupCode}`);
  return offering;
}

export function stableDemoSeedId(key: string): string {
  const hex = createHash("sha256").update(`${DEMO_SCHEDULE_NAMESPACE}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}
