import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_ACADEMIC_PROGRAM, LEGACY_DEMO_INSTITUTE_NAME } from "./demo-profile-fill-core";
import { planDemoInstituteCorrection } from "./update-demo-academic-program-core";

const currentProgram = (instituteName: string) => ({ ...DEMO_ACADEMIC_PROGRAM, instituteName });

test("plans only the approved institute-name correction", () => {
  assert.equal(planDemoInstituteCorrection(currentProgram(LEGACY_DEMO_INSTITUTE_NAME), []), "update");
});

test("treats an already corrected target as an idempotent no-op", () => {
  assert.equal(planDemoInstituteCorrection(currentProgram("ИМИП"), []), "already-correct");
});

test("refuses a target with any unrelated program-field change", () => {
  assert.throws(() => planDemoInstituteCorrection({ ...currentProgram(LEGACY_DEMO_INSTITUTE_NAME), studyMode: "Заочная" }, []), /unexpected values/);
});

test("refuses a competing program row", () => {
  assert.throws(
    () => planDemoInstituteCorrection(currentProgram(LEGACY_DEMO_INSTITUTE_NAME), [{ ...DEMO_ACADEMIC_PROGRAM, id: "other-id" }]),
    /conflicts with the target/,
  );
});

test("refuses an unapproved previous institute value", () => {
  assert.throws(() => planDemoInstituteCorrection(currentProgram("Other"), []), /neither the approved old nor new value/);
});
