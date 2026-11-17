import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { validateLocalDatabaseUrl } from "../src/lib/auth/demo-password-reset-core";
import { createPrismaPgConfig } from "../src/lib/prisma-pg-config";
import { isLoopbackAddress } from "./demo-schedule-update-core";
import {
  DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS,
  planCourseGroupSemesterBackfill,
  type ExistingCourseGroupSemester,
} from "./course-group-semester-backfill-core";

const APPLY_CONFIRMATION = "I_CONFIRM_COURSE_GROUP_SEMESTER_BACKFILL";

function parseMode(args: string[]): "dry-run" | "apply" {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return "dry-run";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new Error("Use either --dry-run (default) or --apply.");
}

async function readRows(db: PrismaClient | Prisma.TransactionClient): Promise<ExistingCourseGroupSemester[]> {
  const groupIds = [...new Set(DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS.map((row) => row.groupId))];
  return db.$queryRaw<ExistingCourseGroupSemester[]>(Prisma.sql`
    SELECT "id", "courseId", "groupId", "academicYear", "semesterNumber"
    FROM "CourseGroup"
    WHERE "groupId" IN (${Prisma.join(groupIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "groupId", "courseId"
  `);
}

function assertSafePlan(plan: ReturnType<typeof planCourseGroupSemesterBackfill>): void {
  if (plan.conflicts.length || plan.unknown.length || plan.missing.length || !plan.canApply) {
    throw new Error(
      `Backfill refused: ${plan.conflicts.length} conflicting, ${plan.unknown.length} unknown, and ${plan.missing.length} missing CourseGroup links. No values were changed.`,
    );
  }
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  const target = validateLocalDatabaseUrl(connectionString);
  if (target.database !== "digital_campus") throw new Error("Only local digital_campus is allowed.");
  if (mode === "apply" && process.env.DIGITAL_CAMPUS_COURSE_GROUP_SEMESTERS_APPROVED !== APPLY_CONFIRMATION) {
    throw new Error(`Apply refused. Set DIGITAL_CAMPUS_COURSE_GROUP_SEMESTERS_APPROVED=${APPLY_CONFIRMATION} to confirm.`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(createPrismaPgConfig(connectionString!)) });
  try {
    const endpoints = await prisma.$queryRaw<Array<{ databaseName: string; serverAddress: string | null }>>`
      SELECT current_database() AS "databaseName", inet_server_addr()::text AS "serverAddress"`;
    const endpoint = endpoints[0];
    if (endpoint?.databaseName !== "digital_campus" || !endpoint.serverAddress || !isLoopbackAddress(endpoint.serverAddress)) {
      throw new Error("Refused: connection is not the local digital_campus loopback database.");
    }

    const plan = planCourseGroupSemesterBackfill(await readRows(prisma));
    console.log(`CourseGroup semester backfill: ${DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS.length} approved links; ${plan.updates.length} to fill; ${plan.alreadyCorrect.length} already correct; ${plan.conflicts.length} conflicts; ${plan.unknown.length} unknown; ${plan.missing.length} missing.`);
    if (mode === "dry-run") {
      console.log("Dry-run only: no database records were changed.");
      if (!plan.canApply) console.log("Apply is blocked until missing or unexpected links and conflicting values are resolved.");
      else console.log("Review this plan before a separately confirmed --apply run.");
      return;
    }

    assertSafePlan(plan);
    await prisma.$transaction(async (tx) => {
      const currentPlan = planCourseGroupSemesterBackfill(await readRows(tx));
      assertSafePlan(currentPlan);
      for (const assignment of currentPlan.updates) {
        const changed = await tx.$executeRaw`UPDATE "CourseGroup"
          SET "academicYear" = ${assignment.academicYear}, "semesterNumber" = ${assignment.semesterNumber}
          WHERE "id" = ${assignment.id}::uuid
            AND "courseId" = ${assignment.courseId}::uuid
            AND "groupId" = ${assignment.groupId}::uuid
            AND "academicYear" IS NULL AND "semesterNumber" IS NULL`;
        if (changed !== 1) throw new Error("A CourseGroup link changed during backfill; transaction rolled back.");
      }
      const verified = planCourseGroupSemesterBackfill(await readRows(tx));
      if (verified.updates.length || verified.alreadyCorrect.length !== DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS.length || !verified.canApply) {
        throw new Error("Post-update verification failed; transaction rolled back.");
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 30_000 });
    console.log("CourseGroup semester backfill applied and verified transactionally.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown course-group semester backfill error.";
  const connectionString = process.env.DATABASE_URL;
  const redacted = message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[database connection redacted]").replace(connectionString ?? "\u0000", "[database connection redacted]");
  console.error(`CourseGroup semester backfill stopped safely: ${redacted}`);
  process.exitCode = 1;
});
