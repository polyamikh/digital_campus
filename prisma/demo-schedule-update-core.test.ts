import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_OFFERING_SCHEDULE, stableDemoSeedId } from "./demo-schedule-layout";
import {
  buildDemoClassTargets,
  calendarScheduleMutation,
  findTransientScheduleConflicts,
  isLoopbackAddress,
  isDemoScheduleUpdateApplied,
  lessonScheduleMutation,
  sortScheduleUpdatesForApply,
} from "./demo-schedule-update-core";
import type { LessonScheduleCandidate } from "../src/lib/schedule/lesson-rules";

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

test("accepts only local IPv4 and IPv6 addresses with canonical host masks", () => {
  for (const address of ["::1", "::1/128", "127.0.0.1", "127.0.0.1/32", "127.8.9.10", "127.8.9.10/32"]) {
    assert.equal(isLoopbackAddress(address), true, address);
  }
  for (const address of [
    "::1/64", "::1/129", "::1/0128", "::1/128/128", "2001:db8::1", "2001:db8::1/128",
    "10.0.0.1", "10.0.0.1/32", "127.0.0.1/24", "127.0.0.1/33", "127.0.0.1/032", "127.0.0.1/32/32", "not-an-ip",
  ]) {
    assert.equal(isLoopbackAddress(address), false, address);
  }
});

test("the shared seed layout covers every offering once without changing stable lesson IDs", () => {
  assert.equal(DEMO_OFFERING_SCHEDULE.length, 11);
  const targets = buildDemoClassTargets(workingWeekdaysExceptHoliday());
  assert.equal(targets.length, 162);
  assert.equal(new Set(targets.map((target) => target.id)).size, 162);
  const target = targets.find((row) => row.courseKey === "digital-marketing" && row.groupCode === "ЦМ-26-1" && row.date === "2026-11-09");
  assert.ok(target);
  assert.equal(target.id, stableDemoSeedId("lesson:digital-marketing:ЦМ-26-1:2026-11-09"));
  assert.equal(target.startsAt.toISOString(), "2026-11-09T16:00:00.000Z");
  assert.equal(target.endsAt.toISOString(), "2026-11-09T17:20:00.000Z");
  assert.equal(target.legacyStartsAt.toISOString(), "2026-11-09T16:00:00.000Z");
  assert.equal(target.legacyEndsAt.toISOString(), "2026-11-09T17:00:00.000Z");
});

test("a completed correction is recognized as a no-op on repeated runs", () => {
  const startsAt = new Date("2026-11-09T16:00:00.000Z");
  const endsAt = new Date("2026-11-09T17:20:00.000Z");
  const applied = {
    lessonVersion: 2,
    scheduleVersionCount: 2,
    correctionMarker: "demo-class-slots-2026-v1",
    currentStartsAt: startsAt,
    currentEndsAt: endsAt,
    expectedStartsAt: startsAt,
    expectedEndsAt: endsAt,
    relatedEventsMatch: true,
  };
  assert.equal(isDemoScheduleUpdateApplied(applied), true);
  assert.equal(isDemoScheduleUpdateApplied({ ...applied, relatedEventsMatch: false }), false);
  assert.equal(isDemoScheduleUpdateApplied({ ...applied, lessonVersion: 3 }), false);
  assert.equal(isDemoScheduleUpdateApplied({ ...applied, correctionMarker: null }), false);
});

test("the update write set touches only schedule timestamps/version and calendar timestamps", () => {
  const startsAt = new Date("2026-11-09T16:00:00.000Z");
  const endsAt = new Date("2026-11-09T17:20:00.000Z");
  assert.deepEqual(lessonScheduleMutation(startsAt, endsAt), { startsAt, endsAt, version: { increment: 1 } });
  assert.deepEqual(calendarScheduleMutation(startsAt, endsAt), { startsAt, endsAt });
  assert.deepEqual(Object.keys(lessonScheduleMutation(startsAt, endsAt)).sort(), ["endsAt", "startsAt", "version"]);
  assert.deepEqual(Object.keys(calendarScheduleMutation(startsAt, endsAt)).sort(), ["endsAt", "startsAt"]);
});

test("the deterministic row update order does not temporarily violate exclusion constraints", () => {
  const targets = buildDemoClassTargets(workingWeekdaysExceptHoliday());
  const current: LessonScheduleCandidate[] = targets.map((target) => ({
    id: target.id,
    kind: "CLASS",
    state: target.legacyStartsAt < new Date("2026-11-08T06:00:00.000Z") ? "COMPLETED" : "SCHEDULED",
    startsAt: target.legacyStartsAt,
    endsAt: target.legacyEndsAt,
    groupId: stableDemoSeedId(`group:${target.groupCode}`),
    roomId: stableDemoSeedId(`room:${target.roomCode}`),
    teacherId: stableDemoSeedId(`user:${target.teacherLogin}`),
    substituteId: null,
    examinerId: null,
  }));
  assert.deepEqual(findTransientScheduleConflicts(current, sortScheduleUpdatesForApply(targets)), []);
});
