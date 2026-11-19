import assert from "node:assert/strict";
import test from "node:test";
import { activeStudentMembershipScope, canLowerAttemptLimit, getStudentTestStatus, isCompletedAttemptState, publishedTestResult, safeExternalTestUrl, shiftReminder, studentAttemptScope, studentTestScope, teacherAssignmentScope, testingTabForStatus, testDeletionDisposition, validAttemptLimit } from "./testing-core";

const now = new Date("2026-11-19T12:00:00.000Z");

test("test status respects opening and closing instants, attempts and submitted completion", () => {
  const base = { state: "PUBLISHED" as const, opensAt: null, closesAt: null, attemptLimit: 2, attemptsUsed: 0, hasCompletedAttempt: false };
  assert.equal(getStudentTestStatus({ ...base, opensAt: new Date("2026-11-20T00:00:00Z") }, now), "UPCOMING");
  assert.equal(getStudentTestStatus(base, now), "AVAILABLE");
  assert.equal(getStudentTestStatus({ ...base, attemptsUsed: 2 }, now), "ATTEMPTS_EXHAUSTED");
  assert.equal(getStudentTestStatus({ ...base, closesAt: new Date("2026-11-19T11:59:59Z") }, now), "OVERDUE");
  assert.equal(getStudentTestStatus({ ...base, closesAt: new Date("2026-11-18T00:00:00Z"), hasCompletedAttempt: true }, now), "COMPLETED");
  assert.equal(getStudentTestStatus({ ...base, state: "DRAFT" }, now), "DRAFT");
});

test("only valid HTTPS external-platform URLs are returned", () => {
  assert.equal(safeExternalTestUrl("https://tests.example.org/exam/1"), "https://tests.example.org/exam/1");
  for (const value of ["http://tests.example.org", "javascript:alert(1)", "data:text/html,hi", "https://user:pass@example.org", "", null]) {
    assert.equal(safeExternalTestUrl(value), null);
  }
});

test("attempt limits accept positive integers or no limit, never zero or fractions", () => {
  assert.equal(validAttemptLimit(null), true);
  assert.equal(validAttemptLimit(1), true);
  assert.equal(validAttemptLimit(0), false);
  assert.equal(validAttemptLimit(1.5), false);
});

test("student queries are scoped by authenticated student and exactly one current group", () => {
  assert.deepEqual(studentTestScope("group-a"), {
    state: "PUBLISHED", publishedAt: { not: null }, assessment: { is: { groupId: "group-a" } }, course: { groups: { some: { groupId: "group-a" } } },
  });
  assert.notDeepEqual(studentAttemptScope("alice"), studentAttemptScope("sofia"));
  assert.deepEqual(teacherAssignmentScope("teacher-1", "assignment-a"), { teacherId: "teacher-1", id: "assignment-a" });
  assert.deepEqual(activeStudentMembershipScope(now), { AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], student: { isActive: true, roles: { some: { role: "STUDENT", revokedAt: null } } } });
});

test("student tab mapping separates completed, overdue and remaining states", () => {
  assert.equal(testingTabForStatus("COMPLETED"), "completed");
  assert.equal(testingTabForStatus("OVERDUE"), "overdue");
  assert.equal(testingTabForStatus("ATTEMPTS_EXHAUSTED"), "available");
});

test("only a published current grade revision is visible as a test result", () => {
  assert.equal(publishedTestResult({ score: { toString: () => "87.50" }, state: "DRAFT", publishedAt: null }), null);
  assert.equal(publishedTestResult({ score: { toString: () => "87.50" }, state: "SUPERSEDED", publishedAt: new Date() }), null);
  assert.equal(publishedTestResult({ score: { toString: () => "87.50" }, state: "PUBLISHED", publishedAt: now }), "87.50");
  assert.equal(isCompletedAttemptState("IN_PROGRESS"), false);
  assert.equal(isCompletedAttemptState("SUBMITTED"), true);
});

test("hard delete is limited to tests without attempts, grades, sent reminders, notifications or linked work", () => {
  const empty = { attempts: 0, gradeEntries: 0, gradeRevisions: 0, publishedResults: 0, sentReminders: 0, notifications: 0, linkedHomework: false };
  assert.equal(testDeletionDisposition(empty), "DELETE");
  for (const key of ["attempts", "gradeEntries", "gradeRevisions", "publishedResults", "sentReminders", "notifications"] as const) {
    assert.equal(testDeletionDisposition({ ...empty, [key]: 1 }), "WITHDRAW");
  }
  assert.equal(testDeletionDisposition({ ...empty, linkedHomework: true }), "WITHDRAW");
});

test("attempt limits cannot be lowered below already recorded attempts and reminder times shift with deadlines", () => {
  assert.equal(canLowerAttemptLimit(1, 2), false);
  assert.equal(canLowerAttemptLimit(2, 2), true);
  assert.equal(canLowerAttemptLimit(null, 20), true);
  assert.equal(shiftReminder(new Date("2026-11-20T12:00:00Z"), new Date("2026-11-22T12:00:00Z"), new Date("2026-11-19T12:00:00Z")).toISOString(), "2026-11-21T12:00:00.000Z");
});
