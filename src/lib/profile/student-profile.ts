import "server-only";

import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getProfilePhotoMetadata } from "./profile-photo-store";
import { readOwnStudentProfile, toStudentProfileView, type StudentProfileRow, type StudentProfileView } from "./student-profile-core";

type DatabaseStudentProfileRow = StudentProfileRow;

export type CurrentStudentProfileResult =
  | { state: "unauthenticated" }
  | { state: "forbidden"; redirectTo: string }
  | { state: "missing" }
  | { state: "ambiguous-membership" }
  | { state: "ready"; profile: StudentProfileView; photoVersion: number | null };

export async function getCurrentStudentProfile(): Promise<CurrentStudentProfileResult> {
  const identity = await currentUser();
  if (!identity) return { state: "unauthenticated" };
  if (identity.activeRole !== Role.STUDENT) {
    return { state: "forbidden", redirectTo: homePathForRole(identity.activeRole as RoleType) };
  }

  const records = await readOwnStudentProfile(identity, async (ownerId) => {
    const now = new Date();
    return prisma.$queryRaw<DatabaseStudentProfileRow[]>`
      SELECT
        u."login",
        profile."displayName",
        profile."email",
        profile."phone",
        academic."studentNumber",
        academic."admissionYear",
        academic."academicStatus",
        studyGroup."code" AS "groupCode",
        program."instituteName",
        program."facultyName",
        program."directionName",
        program."name" AS "programName",
        program."studyMode"
      FROM "User" AS u
      LEFT JOIN "UserProfile" AS profile ON profile."userId" = u."id"
      LEFT JOIN "StudentAcademicProfile" AS academic ON academic."userId" = u."id"
      LEFT JOIN "GroupMembership" AS membership
        ON membership."studentId" = u."id"
       AND (membership."startsAt" IS NULL OR membership."startsAt" <= ${now})
       AND (membership."endsAt" IS NULL OR membership."endsAt" > ${now})
      LEFT JOIN "Group" AS studyGroup ON studyGroup."id" = membership."groupId"
      LEFT JOIN "AcademicProgram" AS program ON program."id" = studyGroup."academicProgramId"
      WHERE u."id" = ${ownerId}::uuid
      ORDER BY membership."startsAt" DESC NULLS LAST
      LIMIT 2`;
  });

  if (records.length === 0) return { state: "missing" };
  if (records.length > 1) return { state: "ambiguous-membership" };
  const [profilePhoto, profile] = await Promise.all([
    getProfilePhotoMetadata(identity.id),
    Promise.resolve(toStudentProfileView(records[0]!)),
  ]);
  return { state: "ready", profile, photoVersion: profilePhoto?.version ?? null };
}
