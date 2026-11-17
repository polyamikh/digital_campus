import { DEMO_OFFERING_SCHEDULE, DEMO_SCHEDULE_FIRST_MONDAY, DEMO_SCHEDULE_WEEKS, stableDemoSeedId } from "./demo-schedule-layout";
import { buildDemoClassTargets, moscowDateTime } from "./demo-schedule-update-core";
import { isLessonScheduleValid, type LessonScheduleCandidate } from "../src/lib/schedule/lesson-rules";

export const DEMO_CLASS_DISTRIBUTION_MARKER = "demo-class-weekly-distribution-2026-v1";

type OfferingKey = `${string}:${string}`;
type RealisticClassSlot = {
  key: OfferingKey;
  weekdayOffset: number;
  startTime: string;
  endTime: string;
};

// One class per existing course/group offering each seeded week, spread across
// Monday-Saturday. These are demo fixture choices, not additional business rules.
export const DEMO_REALISTIC_CLASS_SLOTS: readonly RealisticClassSlot[] = [
  { key: "digital-marketing:ЦМ-26-1", weekdayOffset: 0, startTime: "19:00", endTime: "20:20" },
  { key: "digital-marketing:ЦМ-26-2", weekdayOffset: 1, startTime: "20:30", endTime: "21:50" },
  { key: "marketing-analytics:ЦМ-26-1", weekdayOffset: 2, startTime: "20:30", endTime: "21:50" },
  { key: "marketing-analytics:ЦМ-26-2", weekdayOffset: 3, startTime: "19:00", endTime: "20:20" },
  { key: "consumer-behavior:ЦМ-26-1", weekdayOffset: 4, startTime: "19:00", endTime: "20:20" },
  { key: "brand-management:ЦМ-26-2", weekdayOffset: 5, startTime: "14:30", endTime: "15:50" },
  { key: "strategic-marketing:ЦМ-25-2", weekdayOffset: 4, startTime: "19:00", endTime: "20:20" },
  { key: "e-commerce:ЦМ-26-1", weekdayOffset: 5, startTime: "14:30", endTime: "15:50" },
  { key: "digital-advertising:ЦМ-26-2", weekdayOffset: 4, startTime: "19:00", endTime: "20:20" },
  { key: "marketing-research:ЦМ-25-2", weekdayOffset: 1, startTime: "19:00", endTime: "20:20" },
  { key: "marketing-strategies:ЦМ-25-2", weekdayOffset: 5, startTime: "14:30", endTime: "15:50" },
];

const slotByKey = new Map(DEMO_REALISTIC_CLASS_SLOTS.map((slot) => [slot.key, slot]));
const dateMilliseconds = 86_400_000;
const weekMilliseconds = dateMilliseconds * 7;

function datePlusDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export type DemoRealisticClassTarget = ReturnType<typeof buildDemoClassTargets>[number] & {
  targetDate: string;
  targetStartsAt: Date;
  targetEndsAt: Date;
};

export function buildDemoRealisticClassTargets(workingDateKeys: ReadonlySet<string>): DemoRealisticClassTarget[] {
  const realisticKeys = new Set(DEMO_REALISTIC_CLASS_SLOTS.map((slot) => slot.key));
  if (DEMO_REALISTIC_CLASS_SLOTS.length !== DEMO_OFFERING_SCHEDULE.length
    || realisticKeys.size !== DEMO_REALISTIC_CLASS_SLOTS.length
    || DEMO_OFFERING_SCHEDULE.some((offering) => !realisticKeys.has(`${offering.courseKey}:${offering.groupCode}` as OfferingKey))) {
    throw new Error("Realistic schedule must describe every existing course/group offering exactly once.");
  }
  const firstMonday = Date.parse(`${DEMO_SCHEDULE_FIRST_MONDAY}T00:00:00.000Z`);
  return buildDemoClassTargets(workingDateKeys).map((source) => {
    const key = `${source.courseKey}:${source.groupCode}` as OfferingKey;
    const slot = slotByKey.get(key);
    if (!slot) throw new Error(`Missing realistic schedule slot: ${key}`);
    const weekIndex = Math.floor((Date.parse(`${source.date}T00:00:00.000Z`) - firstMonday) / weekMilliseconds);
    if (weekIndex < 0 || weekIndex >= DEMO_SCHEDULE_WEEKS) throw new Error(`Seed lesson falls outside the configured semester: ${source.date}`);
    const targetDate = datePlusDays(DEMO_SCHEDULE_FIRST_MONDAY, weekIndex * 7 + slot.weekdayOffset);
    const targetStartsAt = moscowDateTime(targetDate, slot.startTime);
    const targetEndsAt = moscowDateTime(targetDate, slot.endTime);
    if (!isLessonScheduleValid("CLASS", targetStartsAt, targetEndsAt)) {
      throw new Error(`Invalid realistic class slot for ${key} on ${targetDate}`);
    }
    return { ...source, targetDate, targetStartsAt, targetEndsAt };
  });
}

export function isDemoClassDistributionApplied(input: {
  lessonVersion: number;
  scheduleVersionCount: number;
  correctionMarker: unknown;
  currentStartsAt: Date;
  currentEndsAt: Date;
  expectedStartsAt: Date;
  expectedEndsAt: Date;
  relatedEventsMatch: boolean;
}): boolean {
  return input.lessonVersion === input.scheduleVersionCount
    && input.correctionMarker === DEMO_CLASS_DISTRIBUTION_MARKER
    && input.currentStartsAt.getTime() === input.expectedStartsAt.getTime()
    && input.currentEndsAt.getTime() === input.expectedEndsAt.getTime()
    && input.relatedEventsMatch;
}

export function buildDemoExamCandidates(): LessonScheduleCandidate[] {
  const fixtures = [
    { key: "consumer-behavior", groupCode: "ЦМ-26-1", date: "2026-11-28", examiner: "krylova.e_teacher", room: "А-201" },
    { key: "brand-management", groupCode: "ЦМ-26-2", date: "2026-12-05", examiner: "sokolov.d_teacher", room: "А-204" },
    { key: "strategic-marketing", groupCode: "ЦМ-25-2", date: "2026-12-12", examiner: "mironova.a_teacher", room: "Б-105" },
  ];
  return fixtures.map((fixture) => {
    const startsAt = moscowDateTime(fixture.date, "11:00");
    return {
      id: stableDemoSeedId(`exam:${fixture.key}:${fixture.groupCode}:${fixture.date}`),
      kind: "EXAM",
      state: "SCHEDULED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 120 * 60_000),
      groupId: stableDemoSeedId(`group:${fixture.groupCode}`),
      roomId: stableDemoSeedId(`room:${fixture.room}`),
      teacherId: null,
      substituteId: null,
      examinerId: stableDemoSeedId(`user:${fixture.examiner}`),
    };
  });
}

export function countChangedFutureTargets(targets: DemoRealisticClassTarget[], now: Date): number {
  return targets.filter((target) => target.startsAt >= now
    && (target.startsAt.getTime() !== target.targetStartsAt.getTime()
      || target.endsAt.getTime() !== target.targetEndsAt.getTime())).length;
}
