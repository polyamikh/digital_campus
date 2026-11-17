export const ACADEMIC_YEAR_2026_2027 = "2026/2027" as const;
export const ACADEMIC_CALENDAR_TIME_ZONE = "Europe/Moscow" as const;

export type AcademicSemester = "AUTUMN" | "SPRING";

export const ACADEMIC_SEMESTERS_2026_2027 = {
  AUTUMN: { start: "2026-09-01", end: "2026-12-31" },
  SPRING: { start: "2027-02-08", end: "2027-05-29" },
} as const satisfies Record<AcademicSemester, { start: string; end: string }>;

const SPRING_DEFAULT_START = "2027-02-08";

function dateKeyInMoscow(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date supplied to academic calendar.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ACADEMIC_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) throw new Error("Could not determine Moscow calendar date.");
  return `${year}-${month}-${day}`;
}

/** Default selection only; callers may still honor an explicit user selection. */
export function getDefaultAcademicSemester(now: Date): AcademicSemester {
  return dateKeyInMoscow(now) < SPRING_DEFAULT_START ? "AUTUMN" : "SPRING";
}

export function isWithinAcademicSemester(date: Date, semester: AcademicSemester): boolean {
  const dateKey = dateKeyInMoscow(date);
  const period = ACADEMIC_SEMESTERS_2026_2027[semester];
  return dateKey >= period.start && dateKey <= period.end;
}
