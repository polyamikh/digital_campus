import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDemoProfilePlan,
  DEMO_ACADEMIC_PROGRAM,
  DEMO_PROFILE_GROUPS,
  type DemoProfileStudent,
  type ExistingDemoStudentProfile,
} from "./demo-profile-fill-core";
import { stableDemoSeedId } from "./demo-schedule-layout";

function fixture() {
  const students: DemoProfileStudent[] = [];
  for (const [groupIndex, groupCode] of DEMO_PROFILE_GROUPS.entries()) {
    for (let index = 0; index < 22; index += 1) {
      const login = groupIndex === 0 && index === 0 ? "sokolova.a_student"
        : groupIndex === 1 && index === 0 ? "belova.s_student"
          : `demo${groupIndex}${index}.x_student`;
      students.push({ id: stableDemoSeedId(`user:${login}`), login, groupId: stableDemoSeedId(`group:${groupCode}`), groupCode });
    }
  }
  const groups = DEMO_PROFILE_GROUPS.map((code) => ({ id: stableDemoSeedId(`group:${code}`), code, academicProgramId: null }));
  return { students, groups, existingProfiles: [] as ExistingDemoStudentProfile[], existingProgram: null };
}

test("new profile fill plan creates one program, links three groups and creates 66 profiles", () => {
  const plan = buildDemoProfilePlan({ ...fixture(), at: new Date("2026-09-01T00:00:00.000Z") });
  assert.equal(plan.program, "create");
  assert.equal(plan.groupsToLink.length, 3);
  assert.equal(plan.profilesToCreate.length, 66);
  assert.ok(plan.profilesToCreate.every((profile) => profile.admissionYear === 2026 && profile.academicStatus === "Обучается"));
  assert.equal(new Set(plan.profilesToCreate.map((profile) => profile.studentNumber)).size, 66);
  assert.ok(plan.profilesToCreate.every((profile) => profile.createdAt.getTime() === profile.updatedAt.getTime()));
  assert.deepEqual(
    [DEMO_ACADEMIC_PROGRAM.instituteName, DEMO_ACADEMIC_PROGRAM.facultyName, DEMO_ACADEMIC_PROGRAM.directionName, DEMO_ACADEMIC_PROGRAM.name, DEMO_ACADEMIC_PROGRAM.studyMode],
    ["ИМИП", "Цифровой маркетинг", "Торговое дело", "Цифровой маркетинг", "Очная"],
  );
});

function withoutTimestamps(rows: Array<ExistingDemoStudentProfile & { createdAt?: Date; updatedAt?: Date }>): ExistingDemoStudentProfile[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    studentNumber: row.studentNumber,
    admissionYear: row.admissionYear,
    academicStatus: row.academicStatus,
  }));
}

test("repeated profile fill plan is create-free when the existing data matches", () => {
  const base = fixture();
  const at = new Date("2026-09-01T00:00:00.000Z");
  const first = buildDemoProfilePlan({ ...base, at });
  const second = buildDemoProfilePlan({
    students: base.students,
    groups: base.groups.map((group) => ({ ...group, academicProgramId: DEMO_ACADEMIC_PROGRAM.id })),
    existingProgram: DEMO_ACADEMIC_PROGRAM,
    existingProfiles: withoutTimestamps(first.profilesToCreate),
    at: new Date("2026-11-15T12:00:00.000Z"),
  });
  assert.equal(second.program, "keep");
  assert.equal(second.groupsToLink.length, 0);
  assert.equal(second.profilesToCreate.length, 0);
});

test("profile fill refuses conflicting profile values instead of overwriting them", () => {
  const base = fixture();
  const first = buildDemoProfilePlan({ ...base, at: new Date("2026-09-01T00:00:00.000Z") });
  const existingProfiles = withoutTimestamps(first.profilesToCreate);
  existingProfiles[0]!.admissionYear = 2025;
  assert.throws(() => buildDemoProfilePlan({ ...base, existingProfiles, at: new Date() }), /conflicts with approved demo values/);
});

test("profile fill refuses a group already linked to a different program", () => {
  const base = fixture();
  const groups = base.groups.map((group, index) => index === 0 ? { ...group, academicProgramId: stableDemoSeedId("other-program") } : group);
  assert.throws(() => buildDemoProfilePlan({ ...base, groups, at: new Date() }), /already links to another academic program/);
});
