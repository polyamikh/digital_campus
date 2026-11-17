import assert from "node:assert/strict";
import test from "node:test";
import { getMoscowDayBounds, getMoscowWeekBounds, moscowDateKey, moscowTime } from "./moscow-time";
import { isLessonScheduleValid } from "./lesson-rules";
import { activeMembershipWhere, studentLessonWhere } from "./schedule-query";
import { lessonCountsByMoscowDate, lessonsOnMoscowDate } from "./schedule-view";

test("Moscow midnight and week boundaries use local calendar dates", () => {
  const justAfterMoscowMidnight = new Date("2026-11-08T21:30:00.000Z");
  assert.equal(moscowDateKey(justAfterMoscowMidnight), "2026-11-09");

  const day = getMoscowDayBounds(justAfterMoscowMidnight);
  assert.equal(day.start.toISOString(), "2026-11-08T21:00:00.000Z");
  assert.equal(day.end.toISOString(), "2026-11-09T21:00:00.000Z");

  const week = getMoscowWeekBounds(justAfterMoscowMidnight);
  assert.equal(week.start.toISOString(), "2026-11-08T21:00:00.000Z");
  assert.equal(week.end.toISOString(), "2026-11-15T21:00:00.000Z");
  assert.equal(moscowDateKey(new Date("2026-11-08T20:59:59.000Z")), "2026-11-08");
});

test("formats verified UTC start and end instants as Moscow lesson times", () => {
  const startsAt = new Date("2026-11-09T16:00:00.000Z");
  const endsAt = new Date("2026-11-09T17:00:00.000Z");
  assert.equal(startsAt.toISOString(), "2026-11-09T16:00:00.000Z");
  assert.equal(moscowTime(startsAt), "19:00");
  assert.equal(endsAt.toISOString(), "2026-11-09T17:00:00.000Z");
  assert.equal(moscowTime(endsAt), "20:00");
});

test("students in different groups receive distinct group-scoped official schedule queries", () => {
  const where = studentLessonWhere("group-alice", new Date("2026-11-08T21:00:00Z"), new Date("2026-11-15T21:00:00Z"));
  const otherStudentWhere = studentLessonWhere("group-sofia", new Date("2026-11-08T21:00:00Z"), new Date("2026-11-15T21:00:00Z"));
  assert.equal(where.groupId, "group-alice");
  assert.equal(otherStudentWhere.groupId, "group-sofia");
  assert.notDeepEqual(where, otherStudentWhere);
  assert.deepEqual(where.startsAt, { gte: new Date("2026-11-08T21:00:00Z"), lt: new Date("2026-11-15T21:00:00Z") });
  assert.deepEqual(where.state.in, ["SCHEDULED", "COMPLETED"]);
});

test("active group membership lookup is scoped to the authenticated user and current instant", () => {
  const now = new Date("2026-11-09T10:00:00.000Z");
  const where = activeMembershipWhere("authenticated-student", now);
  assert.equal(where.studentId, "authenticated-student");
  assert.deepEqual(where.AND, [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  ]);
});

test("empty days and weeks have no lesson markers", () => {
  const lessons: { date: string }[] = [];
  assert.deepEqual(lessonsOnMoscowDate(lessons, "2026-11-09"), []);
  assert.deepEqual([...lessonCountsByMoscowDate(lessons)], []);
});

test("choosing November 9 filters the real week DTO to lessons on that Moscow date", () => {
  const weekLessons = [
    { id: "dm-26-1", date: "2026-11-09", startTime: "19:00", endTime: "20:20" },
    { id: "analytics-26-1", date: "2026-11-09", startTime: "20:30", endTime: "21:50" },
    { id: "tuesday-class", date: "2026-11-10", startTime: "19:00", endTime: "20:20" },
  ];
  assert.deepEqual(lessonsOnMoscowDate(weekLessons, "2026-11-09").map((lesson) => lesson.id), ["dm-26-1", "analytics-26-1"]);
  assert.deepEqual(lessonsOnMoscowDate(weekLessons, "2026-11-11"), []);
});

test("the dashboard's schedule warning uses exact approved class slots", () => {
  const atMoscow = (value: string) => new Date(`${value}+03:00`);
  assert.equal(isLessonScheduleValid("CLASS", atMoscow("2026-11-09T19:00:00"), atMoscow("2026-11-09T20:20:00")), true);
  assert.equal(isLessonScheduleValid("CLASS", atMoscow("2026-11-14T10:35:00"), atMoscow("2026-11-14T11:55:00")), true);
  assert.equal(isLessonScheduleValid("CLASS", atMoscow("2026-11-08T19:00:00"), atMoscow("2026-11-08T20:20:00")), false);
  assert.equal(isLessonScheduleValid("CLASS", atMoscow("2026-11-09T19:00:00"), atMoscow("2026-11-09T20:00:00")), false);
  assert.equal(isLessonScheduleValid("CLASS", atMoscow("2026-11-09T21:00:00"), atMoscow("2026-11-09T22:20:00")), false);
});
