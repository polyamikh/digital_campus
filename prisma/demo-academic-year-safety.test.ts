import assert from "node:assert/strict";
import test from "node:test";
import { ACADEMIC_YEAR_APPLY_CONFIRMATION, assertAcademicYearApplyConfirmed, isAssignableTeacher, resolveAcademicYearMode } from "./demo-academic-year-safety";

test("script defaults to read-only dry-run and rejects unknown arguments", () => {
  assert.equal(resolveAcademicYearMode([]), "dry-run");
  assert.equal(resolveAcademicYearMode(["--dry-run"]), "dry-run");
  assert.throws(() => resolveAcademicYearMode(["--apply", "--dry-run"]));
});

test("apply requires the exact separate confirmation value", () => {
  assertAcademicYearApplyConfirmed("dry-run", {});
  assert.throws(() => assertAcademicYearApplyConfirmed("apply", {}));
  assert.throws(() => assertAcademicYearApplyConfirmed("apply", { DIGITAL_CAMPUS_ACADEMIC_YEAR_APPROVED: "yes" }));
  assert.doesNotThrow(() => assertAcademicYearApplyConfirmed("apply", { DIGITAL_CAMPUS_ACADEMIC_YEAR_APPROVED: ACADEMIC_YEAR_APPLY_CONFIRMATION }));
});

test("an unactivated account is assignable when active and holding an unrevoked TEACHER role", () => {
  const unactivatedTeacher = {
    isActive: true,
    activatedAt: null,
    passwordHash: null,
    roles: [{ role: "TEACHER", revokedAt: null }],
  };
  assert.equal(isAssignableTeacher(unactivatedTeacher), true);
  assert.equal(isAssignableTeacher({ ...unactivatedTeacher, isActive: false }), false);
  assert.equal(isAssignableTeacher({ ...unactivatedTeacher, roles: [] }), false);
  assert.equal(isAssignableTeacher({ ...unactivatedTeacher, roles: [{ role: "STUDENT", revokedAt: null }] }), false);
  assert.equal(isAssignableTeacher({ ...unactivatedTeacher, roles: [{ role: "TEACHER", revokedAt: new Date() }] }), false);
  assert.equal(isAssignableTeacher(null), false);
});
