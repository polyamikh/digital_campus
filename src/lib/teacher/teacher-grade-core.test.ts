import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTeacherGradeDrafts, validateAssessmentStructureInput } from "./teacher-grade-core";

const assessmentId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";

test("teacher grade drafts validate range, precision and duplicate rows", () => {
  assert.equal(parseTeacherGradeDrafts([{ assessmentId, studentId, score: "87.25", reason: "" }]).ok, true);
  assert.equal(parseTeacherGradeDrafts([{ assessmentId, studentId, score: "100.01", reason: "" }]).ok, false);
  assert.equal(parseTeacherGradeDrafts([{ assessmentId, studentId, score: "40.333", reason: "" }]).ok, false);
  assert.equal(parseTeacherGradeDrafts([{ assessmentId, studentId, score: 10, reason: "" }, { assessmentId, studentId, score: 11, reason: "" }]).ok, false);
});

test("teacher grade structure requires unique 3–5 components totaling 100", () => {
  assert.equal(validateAssessmentStructureInput("ДЗ | 30\nТесты | 30\nПроект | 40").ok, true);
  assert.equal(validateAssessmentStructureInput("ДЗ | 30\nТесты | 30\nПроект | 39").ok, false);
  assert.equal(validateAssessmentStructureInput("ДЗ | 50\nДЗ | 50\nИтог | 0").ok, false);
  assert.equal(validateAssessmentStructureInput("Единственный | 100").ok, false);
});
