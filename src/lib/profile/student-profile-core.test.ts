import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@/generated/prisma/enums";
import { readOwnStudentProfile, toStudentProfileView, type StudentProfileRow } from "./student-profile-core";

test("profile lookup is scoped to the authenticated student's ID", async () => {
  const records = new Map([
    ["alice-id", "Alice private profile"],
    ["sofia-id", "Sofia private profile"],
  ]);
  const lookupIds: string[] = [];
  const profile = await readOwnStudentProfile(
    { id: "alice-id", activeRole: Role.STUDENT },
    async (ownerId) => {
      lookupIds.push(ownerId);
      return records.get(ownerId) ?? null;
    },
  );

  assert.equal(profile, "Alice private profile");
  assert.deepEqual(lookupIds, ["alice-id"]);
  assert.notEqual(profile, records.get("sofia-id"));
});

test("profile lookup rejects a session with a non-student active role", async () => {
  let called = false;
  await assert.rejects(
    readOwnStudentProfile({ id: "teacher-id", activeRole: Role.TEACHER }, async () => {
      called = true;
      return null;
    }),
    /Student role required/,
  );
  assert.equal(called, false);
});

test("profile view hides synthetic email and handles missing optional values", () => {
  const row: StudentProfileRow = {
    login: "sokolova.a_student",
    displayName: "Алиса Соколова",
    email: "sokolova.a_student@demo.invalid",
    phone: null,
    studentNumber: null,
    admissionYear: null,
    academicStatus: null,
    groupCode: null,
    instituteName: null,
    facultyName: null,
    directionName: null,
    programName: null,
    studyMode: null,
  };

  const profile = toStudentProfileView(row);
  assert.equal(profile.displayName, "Алиса Соколова");
  assert.equal(profile.email, null);
  assert.equal(profile.demoEmailHidden, true);
  assert.equal(profile.phone, null);
  assert.equal(profile.groupCode, null);
  assert.equal(profile.admissionYear, null);
  assert.equal(profile.academicStatus, null);
});

test("profile view retains a non-demo email and falls back to login for missing name", () => {
  const profile = toStudentProfileView({
    login: "student.login",
    displayName: null,
    email: "student@example.test",
    phone: "",
    studentNumber: "DEMO-123",
    admissionYear: 2026,
    academicStatus: "Обучается",
    groupCode: "ЦМ-26-1",
    instituteName: "Институт",
    facultyName: "Факультет",
    directionName: "Направление",
    programName: "Программа",
    studyMode: "Очная",
  });
  assert.equal(profile.displayName, "student.login");
  assert.equal(profile.email, "student@example.test");
  assert.equal(profile.demoEmailHidden, false);
  assert.equal(profile.phone, null);
});
