import assert from "node:assert/strict";
import test from "node:test";
import { calculateStudentGradeStructure, currentStudentGradeState, studentGradeQueryScope, type GradeStructureInput } from "./student-grades-core";

const publishedAt = new Date("2026-10-21T12:00:00.000Z");

function structure(overrides: Partial<GradeStructureInput> = {}): GradeStructureInput {
  return {
    id: "structure-v1",
    version: 1,
    publishedAt,
    components: [
      { id: "homework", name: "Домашние задания", maximumPoints: "25", position: 0 },
      { id: "tests", name: "Тесты", maximumPoints: "20", position: 1 },
      { id: "project", name: "Проект", maximumPoints: "35", position: 2 },
      { id: "activity", name: "Активность", maximumPoints: "20", position: 3 },
    ],
    works: [],
    worksWithoutPublishedResult: 0,
    ...overrides,
  };
}

function grade(score: string, retakeId: string | null = null, retakeAttemptNo: number | null = null) {
  return { score, publishedAt, retakeId, retakeAttemptNo };
}

test("applies component maximum points to the average of published 0–100 scores", () => {
  const result = calculateStudentGradeStructure(structure({
    works: [
      { id: "alice-homework", title: "Работа Алисы", componentId: "homework", currentPublishedGrade: grade("82") },
      { id: "alice-test", title: "Тест Алисы", componentId: "tests", currentPublishedGrade: grade("78") },
    ],
  }));

  assert.equal(result.accumulatedPoints, "36.1");
  assert.equal(result.availableMaximum, "45");
  assert.equal(result.preliminaryPercent, "80.222222222222222222");
  assert.equal(result.components[0]?.earnedPoints, "20.5");
  assert.equal(result.components[1]?.earnedPoints, "15.6");
  assert.equal(result.state, "COMPLETE");
});

test("averages multiple published works equally within one component", () => {
  const result = calculateStudentGradeStructure(structure({
    works: [
      { id: "hw-1", title: "Работа 1", componentId: "homework", currentPublishedGrade: grade("80") },
      { id: "hw-2", title: "Работа 2", componentId: "homework", currentPublishedGrade: grade("90") },
    ],
  }));

  assert.equal(result.components[0]?.averageScore, "85");
  assert.equal(result.components[0]?.earnedPoints, "21.25");
  assert.equal(result.availableMaximum, "25");
});

test("unpublished and superseded revisions are not counted as zero or extra attempts", () => {
  const supersededScore = "74";
  void supersededScore; // Historical revisions are intentionally not part of the read DTO.
  const result = calculateStudentGradeStructure(structure({
    works: [
      { id: "published", title: "Опубликованная работа", componentId: "homework", currentPublishedGrade: grade("80") },
      { id: "unpublished", title: "Ожидает публикации", componentId: "homework", currentPublishedGrade: null },
      { id: "corrected-entry", title: "Исправленная работа", componentId: "tests", currentPublishedGrade: grade("88") },
    ],
    worksWithoutPublishedResult: 1,
  }));

  assert.equal(result.components[0]?.averageScore, "80");
  assert.equal(result.components[0]?.publishedWorkCount, 1);
  assert.equal(result.components[1]?.averageScore, "88");
  assert.equal(result.accumulatedPoints, "37.6");
  assert.equal(result.availableMaximum, "45");
  assert.equal(result.state, "PARTIAL");
});

test("uses the current published retake result once and marks the work as a retake", () => {
  const result = calculateStudentGradeStructure(structure({
    works: [{
      id: "retaken-work",
      title: "Контрольная работа",
      componentId: "tests",
      // The caller supplies only GradebookEntry.currentRevision when it is published.
      currentPublishedGrade: grade("76", "retake-2", 2),
    }],
  }));

  assert.equal(result.components[1]?.publishedWorkCount, 1);
  assert.equal(result.components[1]?.averageScore, "76");
  assert.equal(result.components[1]?.works[0]?.isRetake, true);
  assert.equal(result.components[1]?.works[0]?.retakeAttemptNo, 2);
});

test("does not add an unassessed component to available maximum; represents no grades and awaiting publication", () => {
  const noGrades = calculateStudentGradeStructure(structure());
  assert.equal(noGrades.accumulatedPoints, "0");
  assert.equal(noGrades.availableMaximum, "0");
  assert.equal(noGrades.preliminaryPercent, null);
  assert.equal(noGrades.components.every((component) => component.availablePoints === "0"), true);
  assert.equal(noGrades.state, "NO_GRADES");

  const awaiting = calculateStudentGradeStructure(structure({ worksWithoutPublishedResult: 2 }));
  assert.equal(awaiting.state, "AWAITING_PUBLICATION");
  assert.equal(awaiting.worksWithoutPublishedResult, 2);
  assert.equal(currentStudentGradeState([]), "NO_PUBLISHED_STRUCTURE");
  assert.equal(currentStudentGradeState([awaiting]), "AWAITING_PUBLICATION");
});

test("grade database scopes isolate Alice and Sofia by authenticated user and active group", () => {
  const aliceScope = studentGradeQueryScope("alice-user-id", "group-26-1", ["dm-course"], ["dm-assessment"]);
  const sofiaScope = studentGradeQueryScope("sofia-user-id", "group-26-2", ["dm-course"], ["dm-assessment"]);

  assert.deepEqual(aliceScope.assessmentWhere, { groupId: "group-26-1", courseId: { in: ["dm-course"] } });
  assert.deepEqual(aliceScope.gradeEntryWhere, { studentId: "alice-user-id", assessmentId: { in: ["dm-assessment"] } });
  assert.deepEqual(sofiaScope.assessmentWhere, { groupId: "group-26-2", courseId: { in: ["dm-course"] } });
  assert.deepEqual(sofiaScope.gradeEntryWhere, { studentId: "sofia-user-id", assessmentId: { in: ["dm-assessment"] } });
});
