import { stableDemoSeedId } from "./demo-schedule-layout";

export const DEMO_PROFILE_GROUPS = ["ЦМ-26-1", "ЦМ-26-2", "ЦМ-25-2"] as const;
export const DEMO_PROFILE_CREATED_AT = new Date("2026-08-31T21:00:00.000Z");
export const DEMO_ACADEMIC_PROGRAM = {
  id: stableDemoSeedId("academic-program:demo-digital-marketing-2026"),
  code: "DEMO-CM-2026",
  name: "Цифровой маркетинг",
  instituteName: "ИМИП",
  facultyName: "Цифровой маркетинг",
  directionName: "Торговое дело",
  studyMode: "Очная",
} as const;
export const LEGACY_DEMO_INSTITUTE_NAME = "ИМЭ";

export type DemoProfileStudent = { id: string; login: string; groupId: string; groupCode: string };
export type ExistingDemoStudentProfile = {
  id: string;
  userId: string;
  studentNumber: string | null;
  admissionYear: number | null;
  academicStatus: string | null;
};
export type ExistingDemoProgram = {
  id: string;
  code: string | null;
  name: string | null;
  instituteName: string | null;
  facultyName: string | null;
  directionName: string | null;
  studyMode: string | null;
};
export type DemoProfileGroup = { id: string; code: string; academicProgramId: string | null };

export type DemoProfilePlan = {
  program: "create" | "keep";
  groupsToLink: string[];
  profilesToCreate: Array<ExistingDemoStudentProfile & { createdAt: Date; updatedAt: Date }>;
  profileCount: number;
};

function expectedProfile(student: DemoProfileStudent, at: Date) {
  return {
    id: stableDemoSeedId(`student-academic-profile:${student.login}`),
    userId: student.id,
    studentNumber: `DEMO-${stableDemoSeedId(`student-number:${student.login}`).replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    admissionYear: 2026,
    academicStatus: "Обучается",
    createdAt: at,
    updatedAt: at,
  };
}

export function buildDemoProfilePlan(input: {
  students: DemoProfileStudent[];
  existingProfiles: ExistingDemoStudentProfile[];
  existingProgram: ExistingDemoProgram | null;
  groups: DemoProfileGroup[];
  at: Date;
}): DemoProfilePlan {
  const { students, existingProfiles, existingProgram, groups, at } = input;
  if (students.length !== 66 || new Set(students.map((student) => student.id)).size !== 66) {
    throw new Error("Expected exactly 66 distinct seeded demo students.");
  }
  for (const code of DEMO_PROFILE_GROUPS) {
    const members = students.filter((student) => student.groupCode === code);
    if (members.length !== 22 || members.some((student) => student.groupId !== stableDemoSeedId(`group:${code}`))) {
      throw new Error(`Expected 22 demo students in ${code}.`);
    }
  }
  if (students.some((student) => !student.login.endsWith("_student") || student.id !== stableDemoSeedId(`user:${student.login}`))) {
    throw new Error("A student row does not match the deterministic demo seed identity.");
  }
  if (!students.some((student) => student.login === "sokolova.a_student" && student.groupCode === "ЦМ-26-1")
    || !students.some((student) => student.login === "belova.s_student" && student.groupCode === "ЦМ-26-2")) {
    throw new Error("The approved Alice and Sofia demo group assignments are missing.");
  }

  if (existingProgram && Object.entries(DEMO_ACADEMIC_PROGRAM).some(([key, value]) => existingProgram[key as keyof ExistingDemoProgram] !== value)) {
    throw new Error("The existing academic program conflicts with approved demo values; no data was changed.");
  }

  const groupsByCode = new Map(groups.map((group) => [group.code, group]));
  const groupsToLink: string[] = [];
  for (const code of DEMO_PROFILE_GROUPS) {
    const group = groupsByCode.get(code);
    if (!group || group.id !== stableDemoSeedId(`group:${code}`)) throw new Error(`Expected seeded group ${code} is missing or has an unexpected ID.`);
    if (group.academicProgramId === null) groupsToLink.push(group.id);
    else if (group.academicProgramId !== DEMO_ACADEMIC_PROGRAM.id) throw new Error(`Group ${code} already links to another academic program; no data was changed.`);
  }

  const existingByUser = new Map(existingProfiles.map((profile) => [profile.userId, profile]));
  const profilesToCreate: DemoProfilePlan["profilesToCreate"] = [];
  for (const student of students) {
    const expected = expectedProfile(student, at);
    const existing = existingByUser.get(student.id);
    if (!existing) {
      profilesToCreate.push(expected);
      continue;
    }
    if (existing.id !== expected.id || existing.studentNumber !== expected.studentNumber
      || existing.admissionYear !== expected.admissionYear || existing.academicStatus !== expected.academicStatus) {
      throw new Error("An existing student academic profile conflicts with approved demo values; no data was changed.");
    }
  }

  return {
    program: existingProgram ? "keep" : "create",
    groupsToLink,
    profilesToCreate,
    profileCount: students.length,
  };
}
