import assert from "node:assert/strict";
import test from "node:test";
import { EXAM_DURATIONS_MINUTES, findScheduleConflicts, isLessonScheduleValid } from "../src/lib/schedule/lesson-rules";
import { buildDemoSessionExamCandidates, demoExamId, DEMO_SESSION_EXAM_PLAN } from "./demo-session-exam-plan";
import { buildDemoSpringLessonCandidates } from "./demo-spring-semester-plan";
import { stableDemoSeedId } from "./demo-schedule-layout";

const GROUPS = ["ЦМ-26-1", "ЦМ-26-2", "ЦМ-25-2"] as const;

test("winter has exactly three and summer exactly four exams per group", () => {
  for (const session of ["winter-2027", "summer-2027"] as const) {
    const rows = DEMO_SESSION_EXAM_PLAN.filter((row) => row.session === session);
    const counts = GROUPS.map((group) => rows.filter((row) => row.groupCode === group).length);
    assert.deepEqual(counts, session === "winter-2027" ? [3, 3, 3] : [4, 4, 4]);
  }
});

test("no group takes an exam for the same course in both sessions", () => {
  for (const group of GROUPS) {
    const winter = new Set(DEMO_SESSION_EXAM_PLAN.filter((row) => row.groupCode === group && row.session === "winter-2027").map((row) => row.courseKey));
    const summer = DEMO_SESSION_EXAM_PLAN.filter((row) => row.groupCode === group && row.session === "summer-2027");
    assert.ok(summer.every((row) => !winter.has(row.courseKey)));
  }
});

test("exactly three seeded semester exams are moved and eighteen are created", () => {
  const moved = DEMO_SESSION_EXAM_PLAN.filter((row) => row.origin.kind === "MOVE");
  const created = DEMO_SESSION_EXAM_PLAN.filter((row) => row.origin.kind === "CREATE");
  assert.equal(moved.length, 3);
  assert.equal(created.length, 18);
  assert.deepEqual(moved.map((row) => [row.courseKey, row.groupCode, row.origin.kind === "MOVE" ? row.origin.sourceDate : null]), [
    ["consumer-behavior", "ЦМ-26-1", "2026-11-28"],
    ["brand-management", "ЦМ-26-2", "2026-12-05"],
    ["strategic-marketing", "ЦМ-25-2", "2026-12-12"],
  ]);
  for (const row of moved) {
    if (row.origin.kind === "MOVE") assert.equal(demoExamId(row), stableDemoSeedId(`exam:${row.courseKey}:${row.groupCode}:${row.origin.sourceDate}`));
  }
});

test("rebuilding the plan yields the same stable identifiers and does not grow the write set", () => {
  const firstExamIds = buildDemoSessionExamCandidates().map((row) => row.id);
  const secondExamIds = buildDemoSessionExamCandidates().map((row) => row.id);
  assert.deepEqual(secondExamIds, firstExamIds);
  assert.equal(new Set(firstExamIds).size, firstExamIds.length);
});

test("all exam dates fit the approved windows, avoid Sundays and use valid duration/time bounds", () => {
  const ids = new Set<string>();
  for (const exam of buildDemoSessionExamCandidates()) {
    assert.ok(!ids.has(exam.id));
    ids.add(exam.id);
    const planned = DEMO_SESSION_EXAM_PLAN.find((row) => demoExamId(row) === exam.id);
    assert.ok(planned);
    assert.ok(planned.session === "winter-2027"
      ? planned.date >= "2027-01-09" && planned.date <= "2027-01-25"
      : planned.date >= "2027-06-13" && planned.date <= "2027-07-05");
    assert.notEqual(new Date(`${planned.date}T12:00:00.000Z`).getUTCDay(), 0);
    assert.equal(isLessonScheduleValid("EXAM", exam.startsAt, exam.endsAt), true);
    assert.ok((EXAM_DURATIONS_MINUTES as readonly number[]).includes((exam.endsAt.getTime() - exam.startsAt.getTime()) / 60_000));
  }
});

test("session dates avoid the January 1–10 and June 12–14 holiday periods", () => {
  assert.ok(DEMO_SESSION_EXAM_PLAN.every((row) => row.session === "winter-2027"
    ? row.date > "2027-01-10"
    : row.date > "2027-06-14"));
});

test("planned winter and summer exams do not overlap each other or spring classes", () => {
  const scheduled = [...buildDemoSessionExamCandidates(), ...buildDemoSpringLessonCandidates()];
  assert.equal(DEMO_SESSION_EXAM_PLAN.length, 21);
  assert.deepEqual(findScheduleConflicts(scheduled), []);
});
