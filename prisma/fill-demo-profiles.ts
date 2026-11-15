import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { validateLocalDatabaseUrl } from "../src/lib/auth/demo-password-reset-core";
import { createPrismaPgConfig } from "../src/lib/prisma-pg-config";
import { isLoopbackAddress } from "./demo-schedule-update-core";
import {
  buildDemoProfilePlan,
  DEMO_ACADEMIC_PROGRAM,
  DEMO_PROFILE_CREATED_AT,
  DEMO_PROFILE_GROUPS,
  type ExistingDemoProgram,
  type ExistingDemoStudentProfile,
  type DemoProfileStudent,
  type DemoProfileGroup,
} from "./demo-profile-fill-core";
import { stableDemoSeedId } from "./demo-schedule-layout";

const APPLY_CONFIRMATION = "I_CONFIRM_DEMO_PROFILE_FILL";

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

function parseMode(args: string[]): "dry-run" | "apply" {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return "dry-run";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new Error("Use either --dry-run (default) or --apply.");
}

async function readPlan(db: Db) {
  const studentGroupIds = DEMO_PROFILE_GROUPS.map((code) => stableDemoSeedId(`group:${code}`));
  const students = await db.$queryRaw<DemoProfileStudent[]>`SELECT
      student."id", student."login", studyGroup."id" AS "groupId", studyGroup."code" AS "groupCode"
    FROM "GroupMembership" AS membership
    JOIN "Group" AS studyGroup ON studyGroup."id" = membership."groupId"
    JOIN "User" AS student ON student."id" = membership."studentId"
    JOIN "UserRole" AS userRole ON userRole."userId" = student."id" AND userRole."role" = 'STUDENT' AND userRole."revokedAt" IS NULL
    WHERE studyGroup."id" IN (${Prisma.join(studentGroupIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND (membership."startsAt" IS NULL OR membership."startsAt" <= CURRENT_TIMESTAMP)
      AND (membership."endsAt" IS NULL OR membership."endsAt" > CURRENT_TIMESTAMP)`;
  const studentIds = students.map((student) => student.id);
  if (!studentIds.length) throw new Error("No approved demo student memberships were found.");
  const [programRows, groupRows, profileRows] = await Promise.all([
    db.$queryRaw<ExistingDemoProgram[]>`SELECT "id", "code", "name", "instituteName", "facultyName", "directionName", "studyMode"
      FROM "AcademicProgram" WHERE "id" = ${DEMO_ACADEMIC_PROGRAM.id}::uuid`,
    db.$queryRaw<DemoProfileGroup[]>`SELECT "id", "code", "academicProgramId" FROM "Group"
      WHERE "id" IN (${Prisma.join(studentGroupIds.map((id) => Prisma.sql`${id}::uuid`))})`,
    db.$queryRaw<ExistingDemoStudentProfile[]>`SELECT "id", "userId", "studentNumber", "admissionYear", "academicStatus"
      FROM "StudentAcademicProfile" WHERE "userId" IN (${Prisma.join(studentIds.map((id) => Prisma.sql`${id}::uuid`))})`,
  ]);
  return buildDemoProfilePlan({
    students,
    existingProfiles: profileRows,
    existingProgram: programRows[0] ?? null,
    groups: groupRows,
    at: DEMO_PROFILE_CREATED_AT,
  });
}

async function applyPlan(tx: Prisma.TransactionClient): Promise<void> {
  const plan = await readPlan(tx);
  if (plan.program === "create") {
    await tx.$executeRaw(Prisma.sql`INSERT INTO "AcademicProgram"
      ("id", "code", "name", "instituteName", "facultyName", "directionName", "studyMode")
      VALUES (${DEMO_ACADEMIC_PROGRAM.id}::uuid, ${DEMO_ACADEMIC_PROGRAM.code}, ${DEMO_ACADEMIC_PROGRAM.name}, ${DEMO_ACADEMIC_PROGRAM.instituteName}, ${DEMO_ACADEMIC_PROGRAM.facultyName}, ${DEMO_ACADEMIC_PROGRAM.directionName}, ${DEMO_ACADEMIC_PROGRAM.studyMode})
      ON CONFLICT DO NOTHING`);
  }
  if (plan.profilesToCreate.length) {
    await tx.$executeRaw(Prisma.sql`INSERT INTO "StudentAcademicProfile"
      ("id", "userId", "studentNumber", "admissionYear", "academicStatus", "createdAt", "updatedAt")
      VALUES ${Prisma.join(plan.profilesToCreate.map((profile) => Prisma.sql`(${profile.id}::uuid, ${profile.userId}::uuid, ${profile.studentNumber}, ${profile.admissionYear}, ${profile.academicStatus}, ${profile.createdAt}, ${profile.updatedAt})`))}
      ON CONFLICT DO NOTHING`);
  }
  for (const groupId of plan.groupsToLink) {
    await tx.$executeRaw`UPDATE "Group" SET "academicProgramId" = ${DEMO_ACADEMIC_PROGRAM.id}::uuid
      WHERE "id" = ${groupId}::uuid AND "academicProgramId" IS NULL`;
  }
  const verified = await readPlan(tx);
  if (verified.program !== "keep" || verified.groupsToLink.length || verified.profilesToCreate.length) {
    throw new Error("The profile transaction did not produce the expected data; all changes were rolled back.");
  }
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  const target = validateLocalDatabaseUrl(connectionString);
  if (target.database !== "digital_campus") throw new Error("Only the local digital_campus database is allowed.");
  if (mode === "apply" && process.env.DIGITAL_CAMPUS_PROFILE_FILL_APPROVED !== APPLY_CONFIRMATION) {
    throw new Error(`Apply refused. Set DIGITAL_CAMPUS_PROFILE_FILL_APPROVED=${APPLY_CONFIRMATION} to confirm.`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(createPrismaPgConfig(connectionString!)) });
  try {
    const endpoints = await prisma.$queryRaw<Array<{ databaseName: string; serverAddress: string | null }>>`
      SELECT current_database() AS "databaseName", inet_server_addr()::text AS "serverAddress"`;
    const endpoint = endpoints[0];
    if (endpoint?.databaseName !== "digital_campus" || !endpoint.serverAddress || !isLoopbackAddress(endpoint.serverAddress)) {
      throw new Error("Refused: live PostgreSQL connection is not the local digital_campus loopback database.");
    }

    if (mode === "dry-run") {
      const plan = await readPlan(prisma);
      console.log(`Profile fill plan: 66 students; ${plan.profilesToCreate.length} profiles to create; ${plan.groupsToLink.length} groups to link; academic program ${plan.program === "create" ? "to create" : "already matches"}.`);
      console.log("No database records were changed. Use --apply with explicit confirmation to apply this plan.");
      return;
    }

    await prisma.$transaction(applyPlan, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 30_000,
    });
    console.log("Demo profile data was applied and verified in one transaction.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown profile fill error.";
  const connectionString = process.env.DATABASE_URL;
  console.error(`Demo profile fill stopped safely: ${message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[database connection redacted]").replace(connectionString ?? "\u0000", "[database connection redacted]")}`);
  process.exitCode = 1;
});
