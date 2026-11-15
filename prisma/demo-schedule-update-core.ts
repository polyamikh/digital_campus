import {
  DEMO_OFFERING_SCHEDULE,
  DEMO_SCHEDULE_FIRST_MONDAY,
  DEMO_SCHEDULE_WEEKS,
  stableDemoSeedId,
} from "./demo-schedule-layout";
import { findScheduleConflicts, type LessonScheduleCandidate } from "../src/lib/schedule/lesson-rules";
import { isIP } from "node:net";

export type DemoClassTarget = {
  id: string;
  key: string;
  courseKey: string;
  groupCode: string;
  teacherLogin: string;
  roomCode: string;
  date: string;
  startsAt: Date;
  endsAt: Date;
  legacyStartsAt: Date;
  legacyEndsAt: Date;
};

export function moscowDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000+03:00`);
}

export function isLoopbackAddress(address: string): boolean {
  const parts = address.split("/");
  if (parts.length > 2) return false;
  const host = parts[0] ?? "";
  const mask = parts[1];
  const version = isIP(host);

  if (version === 4) {
    if (mask !== undefined && mask !== "32") return false;
    return Number(host.split(".")[0]) === 127;
  }

  if (version === 6) {
    return host.toLowerCase() === "::1" && (mask === undefined || mask === "128");
  }

  return false;
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function buildDemoClassTargets(workingDateKeys: ReadonlySet<string>): DemoClassTarget[] {
  const rows: DemoClassTarget[] = [];
  for (let week = 0; week < DEMO_SCHEDULE_WEEKS; week += 1) {
    for (const offering of DEMO_OFFERING_SCHEDULE) {
      const date = addUtcDays(DEMO_SCHEDULE_FIRST_MONDAY, week * 7 + offering.weekdayOffset);
      if (!workingDateKeys.has(date)) continue;
      const key = `${offering.courseKey}:${offering.groupCode}`;
      const lessonKey = `lesson:${key}:${date}`;
      const startsAt = moscowDateTime(date, offering.startTime);
      const endsAt = moscowDateTime(date, offering.endTime);
      const legacyStartsAt = moscowDateTime(date, offering.legacyStartTime);
      rows.push({
        id: stableDemoSeedId(lessonKey),
        key,
        courseKey: offering.courseKey,
        groupCode: offering.groupCode,
        teacherLogin: offering.teacherLogin,
        roomCode: offering.roomCode,
        date,
        startsAt,
        endsAt,
        legacyStartsAt,
        legacyEndsAt: new Date(legacyStartsAt.getTime() + 60 * 60_000),
      });
    }
  }
  return rows;
}

export function sameInstant(left: unknown, right: Date): boolean {
  const value = left instanceof Date ? left : typeof left === "string" ? new Date(left) : null;
  return value !== null && Number.isFinite(value.getTime()) && value.getTime() === right.getTime();
}

export function isDemoScheduleUpdateApplied(input: {
  lessonVersion: number;
  scheduleVersionCount: number;
  correctionMarker: unknown;
  currentStartsAt: Date;
  currentEndsAt: Date;
  expectedStartsAt: Date;
  expectedEndsAt: Date;
  relatedEventsMatch: boolean;
}): boolean {
  return input.lessonVersion === 2
    && input.scheduleVersionCount === 2
    && input.correctionMarker === "demo-class-slots-2026-v1"
    && input.currentStartsAt.getTime() === input.expectedStartsAt.getTime()
    && input.currentEndsAt.getTime() === input.expectedEndsAt.getTime()
    && input.relatedEventsMatch;
}

export function lessonScheduleMutation(startsAt: Date, endsAt: Date) {
  return { startsAt, endsAt, version: { increment: 1 as const } };
}

export function calendarScheduleMutation(startsAt: Date, endsAt: Date) {
  return { startsAt, endsAt };
}

export function findTransientScheduleConflicts(
  current: LessonScheduleCandidate[],
  updates: Array<{ id: string; startsAt: Date; endsAt: Date }>,
) {
  const staged = new Map(current.map((lesson) => [lesson.id, { ...lesson }]));
  for (const update of updates) {
    const lesson = staged.get(update.id);
    if (!lesson) continue;
    staged.set(update.id, { ...lesson, startsAt: update.startsAt, endsAt: update.endsAt });
    const conflicts = findScheduleConflicts([...staged.values()]);
    if (conflicts.length > 0) return conflicts;
  }
  return [];
}

export function sortScheduleUpdatesForApply<T extends { id: string; startsAt: Date }>(updates: T[]): T[] {
  return [...updates].sort((left, right) => right.startsAt.getTime() - left.startsAt.getTime() || left.id.localeCompare(right.id));
}
