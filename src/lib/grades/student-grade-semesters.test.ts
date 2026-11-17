import assert from "node:assert/strict";
import { test } from "node:test";
import { courseIdsForSemester, resolveStudentSemester, semestersForAdmissionYear } from "./student-grade-semesters";

test("2026 and 2025 cohorts receive their approved semester labels", () => {
  assert.deepEqual(semestersForAdmissionYear(2026).map(({ semesterNumber, label }) => [semesterNumber, label]), [
    [1, "1-й семестр 2026/2027"], [2, "2-й семестр 2026/2027"],
  ]);
  assert.deepEqual(semestersForAdmissionYear(2025).map(({ semesterNumber, label }) => [semesterNumber, label]), [
    [3, "3-й семестр 2026/2027"], [4, "4-й семестр 2026/2027"],
  ]);
  assert.deepEqual(semestersForAdmissionYear(null), []);
});

test("requested semester is honored only when it belongs to the student's cohort", () => {
  const firstYear = semestersForAdmissionYear(2026);
  assert.equal(resolveStudentSemester(firstYear, 2, new Date("2026-11-17T12:00:00Z"))?.semesterNumber, 2);
  assert.equal(resolveStudentSemester(firstYear, 4, new Date("2026-11-17T12:00:00Z"))?.semesterNumber, 1);
});

test("calendar chooses autumn before 8 February and spring from that Moscow date", () => {
  const secondYear = semestersForAdmissionYear(2025);
  assert.equal(resolveStudentSemester(secondYear, null, new Date("2027-02-07T20:59:59Z"))?.semesterNumber, 3);
  assert.equal(resolveStudentSemester(secondYear, null, new Date("2027-02-07T21:00:00Z"))?.semesterNumber, 4);
});

test("course IDs and grade scope do not mix semester assignments", () => {
  const rows = [
    { courseId: "fall-course", academicYear: "2026/2027", semesterNumber: 1 },
    { courseId: "spring-course", academicYear: "2026/2027", semesterNumber: 2 },
    { courseId: "other-year-course", academicYear: "2025/2026", semesterNumber: 2 },
  ];
  assert.deepEqual(courseIdsForSemester(rows, "2026/2027", 1), ["fall-course"]);
  assert.deepEqual(courseIdsForSemester(rows, "2026/2027", 2), ["spring-course"]);
  assert.deepEqual(courseIdsForSemester([], "2026/2027", 1), []);
});
