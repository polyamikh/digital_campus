import assert from "node:assert/strict";
import { test } from "node:test";
import { getWeekDateKeys, scheduleDayVisualState, selectedScheduleDay, shiftScheduleWeek, validScheduleDateKey } from "./schedule-week-core";
import { getMoscowWeekBounds } from "./moscow-time";

test("builds Monday through Sunday from a Moscow calendar date, regardless of host timezone", () => {
  assert.deepEqual(getWeekDateKeys("2026-11-11"), [
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
  ]);
  assert.deepEqual(getWeekDateKeys("2026-11-15"), [
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
  ]);
});

test("validates date keys and refuses impossible or repeated query values", () => {
  assert.equal(validScheduleDateKey("2026-11-09"), "2026-11-09");
  assert.equal(validScheduleDateKey("2026-02-30"), null);
  assert.equal(validScheduleDateKey("2026-1-09"), null);
  assert.equal(validScheduleDateKey(["2026-11-09", "2026-11-10"]), null);
});

test("moves between adjacent calendar weeks without local timezone arithmetic", () => {
  assert.equal(shiftScheduleWeek("2026-11-09", -1), "2026-11-02");
  assert.equal(shiftScheduleWeek("2026-11-09", 1), "2026-11-16");
  assert.equal(shiftScheduleWeek("2027-01-04", -1), "2026-12-28");
});

test("converts requested Moscow week dates into exact server query bounds", () => {
  const mondayNoonUtc = new Date("2026-11-09T12:00:00.000Z");
  const bounds = getMoscowWeekBounds(mondayNoonUtc);
  assert.equal(bounds.start.toISOString(), "2026-11-08T21:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-11-15T21:00:00.000Z");
});

test("keeps selected day inside the requested week and defaults to today when included", () => {
  const week = getWeekDateKeys("2026-11-11");
  assert.equal(selectedScheduleDay("2026-11-14", week, "2026-11-11"), "2026-11-14");
  assert.equal(selectedScheduleDay("2026-11-16", week, "2026-11-11"), "2026-11-11");
  assert.equal(selectedScheduleDay(undefined, week, "2026-11-11"), "2026-11-11");
  assert.equal(selectedScheduleDay(undefined, week, "2026-11-16"), "2026-11-09");
});

test("only the actual Moscow today gets the today accent, independently of selection", () => {
  assert.deepEqual(scheduleDayVisualState("2026-11-11", "2026-11-11", "2026-11-11"), {
    isToday: true, isSelected: true, selectedNonToday: false,
  });
  assert.deepEqual(scheduleDayVisualState("2026-11-12", "2026-11-11", "2026-11-12"), {
    isToday: false, isSelected: true, selectedNonToday: true,
  });
  assert.deepEqual(scheduleDayVisualState("2026-11-09", "2026-11-18", "2026-11-09"), {
    isToday: false, isSelected: true, selectedNonToday: true,
  });
});
