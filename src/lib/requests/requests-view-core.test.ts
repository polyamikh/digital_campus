import assert from "node:assert/strict";
import { test } from "node:test";
import { filterStudentRequests, requestCategoryLabel, requestCategoryRequiresDetails, requestStateLabel, requestSummary, type StudentRequestView } from "./requests-view-core";

const requests: StudentRequestView[] = [
  { id: "1", category: "STUDY_CERTIFICATE", state: "IN_REVIEW", title: "Справка", submittedAt: "2026-11-01T00:00:00.000Z", deadlineAt: "2026-11-04T20:59:59.999Z", completedAt: null },
  { id: "2", category: "ACADEMIC_QUESTION", state: "COMPLETED", title: "Вопрос", submittedAt: "2026-11-02T00:00:00.000Z", deadlineAt: null, completedAt: "2026-11-04T00:00:00.000Z" },
  { id: "3", category: "GRADE_TRANSCRIPT", state: "REJECTED", title: "Выписка", submittedAt: "2026-11-03T00:00:00.000Z", deadlineAt: null, completedAt: null },
  { id: "4", category: "PERSONAL_DATA_CORRECTION", state: "CANCELLED", title: "Исправление", submittedAt: "2026-11-04T00:00:00.000Z", deadlineAt: null, completedAt: null },
];

test("request summary separates active, completed and rejected while excluding cancelled", () => {
  assert.deepEqual(requestSummary(requests), { active: 1, completed: 1, rejected: 1 });
});

test("category and status filters combine without changing source request data", () => {
  assert.deepEqual(filterStudentRequests(requests, { category: "STUDY_CERTIFICATE", state: "ALL" }).map(({ id }) => id), ["1"]);
  assert.deepEqual(filterStudentRequests(requests, { category: "ALL", state: "COMPLETED" }).map(({ id }) => id), ["2"]);
  assert.deepEqual(filterStudentRequests(requests, { category: "STUDY_CERTIFICATE", state: "COMPLETED" }), []);
});

test("labels cover approved categories and request states", () => {
  assert.equal(requestCategoryLabel("STUDY_PERIOD_CERTIFICATE"), "Справка о периоде обучения");
  assert.equal(requestCategoryLabel("OTHER"), "Другое");
  assert.equal(requestCategoryRequiresDetails("OTHER"), true);
  assert.equal(requestCategoryRequiresDetails("ACADEMIC_QUESTION"), false);
  assert.equal(requestStateLabel("CLARIFICATION_REQUESTED"), "Нужно уточнение");
  assert.equal(requestStateLabel("READY_FOR_ISSUE"), "Готова к выдаче");
});
