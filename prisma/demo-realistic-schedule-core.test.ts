import assert from "node:assert/strict";
import test from "node:test";
import { findScheduleConflicts, isLessonScheduleValid } from "../src/lib/schedule/lesson-rules";
import { isDemoClassDistributionApplied, DEMO_CLASS_DISTRIBUTION_MARKER, buildDemoExamCandidates, buildDemoRealisticClassTargets, countChangedFutureTargets, DEMO_REALISTIC_CLASS_SLOTS } from "./demo-realistic-schedule-core";
import { buildDemoClassTargets } from "./demo-schedule-update-core";
import { stableDemoSeedId } from "./demo-schedule-layout";

function workingWeekdaysExceptHoliday(): Set<string> {
  const dates = new Set<string>();
  const start = new Date("2026-09-14T00:00:00.000Z");
  for (let week = 0; week < 15; week += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + week * 7 + offset);
      const key = date.toISOString().slice(0, 10);
      if (key !== "2026-11-04") dates.add(key);
    }
  }
  return dates;
}

test("the realistic layout keeps all existing offerings, varies groups and uses Monday through Saturday", () => {
  assert.equal(DEMO_REALISTIC_CLASS_SLOTS.length, 11);
  assert.equal(new Set(DEMO_REALISTIC_CLASS_SLOTS.map((slot) => slot.key)).size, 11);
  assert.ok(DEMO_REALISTIC_CLASS_SLOTS.some((slot) => slot.weekdayOffset === 5));
  assert.ok(DEMO_REALISTIC_CLASS_SLOTS.every((slot) => slot.weekdayOffset >= 0 && slot.weekdayOffset <= 5));
  const weekdaysByGroup = new Map<string, Set<number>>();
  for (const slot of DEMO_REALISTIC_CLASS_SLOTS) {
    const group = slot.key.split(":")[1];
    const weekdaySet = weekdaysByGroup.get(group) ?? new Set<number>();
    weekdaySet.add(slot.weekdayOffset);
    weekdaysByGroup.set(group, weekdaySet);
  }
  assert.equal(weekdaysByGroup.size, 3);
  assert.equal(new Set([...weekdaysByGroup.values()].map((days) => [...days].sort().join(","))).size, 3);
});

test("preserves 162 existing IDs and produces the approved 80-minute slots without resource conflicts", () => {
  const workingDates = workingWeekdaysExceptHoliday();
  const original = buildDemoClassTargets(workingDates);
  const targets = buildDemoRealisticClassTargets(workingDates);
  assert.equal(targets.length, 162);
  assert.deepEqual(targets.map((target) => target.id), original.map((target) => target.id));
  const candidates = targets.map((target) => ({
    id: target.id,
    kind: "CLASS" as const,
    state: "SCHEDULED" as const,
    startsAt: target.targetStartsAt,
    endsAt: target.targetEndsAt,
    groupId: stableDemoSeedId(`group:${target.groupCode}`),
    roomId: stableDemoSeedId(`room:${target.roomCode}`),
    teacherId: stableDemoSeedId(`user:${target.teacherLogin}`),
    substituteId: null,
    examinerId: null,
  }));
  assert.ok(candidates.every((candidate) => isLessonScheduleValid("CLASS", candidate.startsAt, candidate.endsAt)));
  assert.deepEqual(findScheduleConflicts(candidates), []);
  const finalEvents = [...candidates, ...buildDemoExamCandidates()];
  assert.deepEqual(findScheduleConflicts(finalEvents), []);
  assert.ok(buildDemoExamCandidates().every((exam) => isLessonScheduleValid("EXAM", exam.startsAt, exam.endsAt)));
});

test("plans 60 future class moves for November 16 through December 21 without moving earlier attendance history", () => {
  const targets = buildDemoRealisticClassTargets(workingWeekdaysExceptHoliday());
  assert.equal(countChangedFutureTargets(targets, new Date("2026-11-15T08:00:00.000Z")), 60);
  const futureChanges = targets.filter((target) => target.startsAt >= new Date("2026-11-15T08:00:00.000Z")
    && target.startsAt.getTime() !== target.targetStartsAt.getTime());
  assert.ok(futureChanges.every((target) => target.targetStartsAt >= new Date("2026-11-15T08:00:00.000Z")));
});

test("recognizes a previously applied distribution only when its marker, version and related events match", () => {
  const instant = new Date("2026-11-17T16:00:00.000Z");
  const applied = {
    lessonVersion: 3,
    scheduleVersionCount: 3,
    correctionMarker: DEMO_CLASS_DISTRIBUTION_MARKER,
    currentStartsAt: instant,
    currentEndsAt: new Date(instant.getTime() + 80 * 60_000),
    expectedStartsAt: instant,
    expectedEndsAt: new Date(instant.getTime() + 80 * 60_000),
    relatedEventsMatch: true,
  };
  assert.equal(isDemoClassDistributionApplied(applied), true);
  assert.equal(isDemoClassDistributionApplied({ ...applied, relatedEventsMatch: false }), false);
  assert.equal(isDemoClassDistributionApplied({ ...applied, lessonVersion: 4 }), false);
});
