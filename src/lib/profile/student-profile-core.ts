import { Role, type Role as RoleType } from "@/generated/prisma/enums";

export type SessionIdentity = { id: string; activeRole: RoleType };

/** The reader is always called with the authenticated session owner's ID. */
export async function readOwnStudentProfile<T>(
  identity: SessionIdentity,
  reader: (ownerId: string) => Promise<T>,
): Promise<T> {
  if (identity.activeRole !== Role.STUDENT) throw new Error("Student role required");
  return reader(identity.id);
}

export type StudentProfileRow = {
  login: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  studentNumber: string | null;
  admissionYear: number | null;
  academicStatus: string | null;
  groupCode: string | null;
  instituteName: string | null;
  facultyName: string | null;
  directionName: string | null;
  programName: string | null;
  studyMode: string | null;
};

export type StudentProfileView = Omit<StudentProfileRow, "email" | "displayName"> & {
  displayName: string;
  email: string | null;
  demoEmailHidden: boolean;
};

export function toStudentProfileView(row: StudentProfileRow): StudentProfileView {
  const clean = (value: string | null): string | null => value?.trim() || null;
  const normalizedEmail = clean(row.email);
  const demoEmailHidden = normalizedEmail?.toLowerCase().endsWith(".invalid") ?? false;
  return {
    ...row,
    displayName: row.displayName?.trim() || row.login,
    email: demoEmailHidden ? null : normalizedEmail,
    phone: clean(row.phone),
    studentNumber: clean(row.studentNumber),
    academicStatus: clean(row.academicStatus),
    groupCode: clean(row.groupCode),
    instituteName: clean(row.instituteName),
    facultyName: clean(row.facultyName),
    directionName: clean(row.directionName),
    programName: clean(row.programName),
    studyMode: clean(row.studyMode),
    demoEmailHidden,
  };
}
