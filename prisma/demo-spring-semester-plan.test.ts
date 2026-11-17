import assert from "node:assert/strict";
import test from "node:test";
import { findScheduleConflicts, isLessonScheduleValid, WEEKDAY_CLASS_SLOTS, SATURDAY_CLASS_SLOTS } from "../src/lib/schedule/lesson-rules";
import { DEMO_SPRING_COURSES, DEMO_SPRING_OFFERINGS, SPRING_2027_PUBLIC_NON_TEACHING_DATES, SPRING_TERM_END, SPRING_TERM_START, buildDemoSpringLessons } from "./demo-spring-semester-plan";
import { DEMO_SESSION_EXAM_PLAN } from "./demo-session-exam-plan";

const GROUPS = ["ЦМ-26-1", "ЦМ-26-2", "ЦМ-25-2"] as const;

test("spring plan defines four courses and twelve course/group offerings", () => {
  assert.equal(DEMO_SPRING_COURSES.length, 4);
  assert.equal(new Set(DEMO_SPRING_COURSES.map((row) => row.key)).size, 4);
  assert.equal(DEMO_SPRING_OFFERINGS.length, 12);
  for (const group of GROUPS) {
    assert.equal(DEMO_SPRING_OFFERINGS.filter((row) => row.groupCode === group).length, 4);
  }
});

test("spring meetings stay inside term, omit Sundays and official non-teaching holidays", () => {
  const lessons = buildDemoSpringLessons();
  assert.equal(lessons.length, 180);
  assert.equal(new Set(lessons.map((row) => row.id)).size, lessons.length);
  for (const lesson of lessons) {
    assert.ok(lesson.date >= SPRING_TERM_START && lesson.date <= SPRING_TERM_END);
    assert.notEqual(new Date(`${lesson.date}T12:00:00.000Z`).getUTCDay(), 0);
    assert.equal(SPRING_2027_PUBLIC_NON_TEACHING_DATES.has(lesson.date), false);
    assert.equal(isLessonScheduleValid("CLASS", lesson.startsAt, lesson.endsAt), true);
    const weekday = new Date(`${lesson.date}T00:00:00.000Z`).getUTCDay();
    const approvedSlots = weekday === 6 ? SATURDAY_CLASS_SLOTS : WEEKDAY_CLASS_SLOTS;
    assert.ok(approvedSlots.some((slot) => slot.start === lesson.startTime && slot.end === lesson.endTime));
  }
});

test("new spring courses are unique from each group's winter-exam disciplines", () => {
  for (const group of GROUPS) {
    const winterCourses = new Set(DEMO_SESSION_EXAM_PLAN.filter((row) => row.groupCode === group && row.session === "winter-2027").map((row) => row.courseKey));
    assert.ok(DEMO_SPRING_OFFERINGS.filter((row) => row.groupCode === group).every((row) => !winterCourses.has(row.courseKey)));
  }
});

test("spring lessons do not overlap by group, room or staff", () => {
  const lessons = buildDemoSpringLessons().map((lesson) => ({
    id: lesson.id,
    kind: "CLASS" as const,
    state: "SCHEDULED" as const,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    groupId: lesson.groupId,
    roomId: lesson.roomId,
    teacherId: lesson.teacherId,
    substituteId: null,
    examinerId: null,
  }));
  assert.deepEqual(findScheduleConflicts(lessons), []);
});

test("rebuilding spring lessons yields identical deterministic keys and no duplicate records", () => {
  const first = buildDemoSpringLessons();
  const second = buildDemoSpringLessons();
  assert.deepEqual(second.map((row) => [row.id, row.startsAt.toISOString(), row.endsAt.toISOString()]),
    first.map((row) => [row.id, row.startsAt.toISOString(), row.endsAt.toISOString()]));
  assert.equal(new Set(first.map((row) => row.id)).size, first.length);
});
