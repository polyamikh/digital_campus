import assert from "node:assert/strict";
import test from "node:test";
import { formatGradePercent, formatGradePoints, gradeStateLabel, selectedGradeCourse, type GradeCourseForView } from "./grades-view-core";

const course = (id: string): GradeCourseForView => ({
  id,
  name: `Курс ${id}`,
  structures: [],
  currentStructureVersion: null,
  state: "NO_PUBLISHED_STRUCTURE",
  finalGradeClosure: null,
  confirmedAcademicDebts: [],
});

test("course selection uses requested discipline and safely falls back when it disappears", () => {
  const courses = [course("dm"), course("analytics")];
  assert.equal(selectedGradeCourse(courses, "analytics")?.id, "analytics");
  assert.equal(selectedGradeCourse(courses, "removed")?.id, "dm");
  assert.equal(selectedGradeCourse([], null), null);
});

test("formats points with Russian decimal punctuation and percentage to two display decimals", () => {
  assert.equal(formatGradePoints("36.1"), "36,1");
  assert.equal(formatGradePoints("45"), "45");
  assert.equal(formatGradePercent("80.222222222222222222"), "80,22%");
  assert.equal(formatGradePercent(null), null);
});

test("exposes distinct course states in student-facing labels", () => {
  assert.equal(gradeStateLabel("NO_PUBLISHED_STRUCTURE"), "Нет опубликованной структуры");
  assert.equal(gradeStateLabel("NO_GRADES"), "Нет опубликованных оценок");
  assert.equal(gradeStateLabel("AWAITING_PUBLICATION"), "Ожидается публикация оценок");
  assert.equal(gradeStateLabel("PARTIAL"), "Опубликованы не все результаты");
});
