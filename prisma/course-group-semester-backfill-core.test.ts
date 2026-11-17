import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COURSE_GROUP_SEMESTER_ACADEMIC_YEAR,
  DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS,
  DEMO_COURSE_GROUP_COUNT,
  planCourseGroupSemesterBackfill,
  type ExistingCourseGroupSemester,
} from "./course-group-semester-backfill-core";

function emptyRows(): ExistingCourseGroupSemester[] {
  return DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS.map((row) => ({
    id: row.id, courseId: row.courseId, groupId: row.groupId, academicYear: null, semesterNumber: null,
  }));
}

test("approved autumn and spring links map groups to exact academic semesters", () => {
  assert.equal(DEMO_COURSE_GROUP_COUNT, 23);
  for (const assignment of DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS) {
    assert.equal(assignment.academicYear, COURSE_GROUP_SEMESTER_ACADEMIC_YEAR);
    assert.equal(assignment.semesterNumber, assignment.groupCode === "ЦМ-25-2"
      ? assignment.season === "autumn" ? 3 : 4
      : assignment.season === "autumn" ? 1 : 2);
  }
});

test("empty semester values produce a complete backfill plan", () => {
  const plan = planCourseGroupSemesterBackfill(emptyRows());
  assert.equal(plan.canApply, true);
  assert.equal(plan.updates.length, 23);
  assert.equal(plan.alreadyCorrect.length, 0);
});

test("partially populated or conflicting values are never overwritten", () => {
  const rows = emptyRows();
  rows[0] = { ...rows[0]!, academicYear: "2026/2027" };
  const plan = planCourseGroupSemesterBackfill(rows);
  assert.equal(plan.canApply, false);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.updates.length, 22);
});

test("unknown and missing links block apply", () => {
  const rows = emptyRows().slice(1);
  rows.push({ id: "unexpected", courseId: "unexpected-course", groupId: "unexpected-group", academicYear: null, semesterNumber: null });
  const plan = planCourseGroupSemesterBackfill(rows);
  assert.equal(plan.canApply, false);
  assert.equal(plan.missing.length, 1);
  assert.equal(plan.unknown.length, 1);
});

test("a second run is a no-op when every link already has its approved semester", () => {
  const correctRows = DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS.map(({ id, courseId, groupId, academicYear, semesterNumber }) => ({ id, courseId, groupId, academicYear, semesterNumber }));
  const plan = planCourseGroupSemesterBackfill(correctRows);
  assert.equal(plan.canApply, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.alreadyCorrect.length, 23);
});
