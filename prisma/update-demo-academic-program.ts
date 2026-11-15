import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { validateLocalDatabaseUrl } from "../src/lib/auth/demo-password-reset-core";
import { createPrismaPgConfig } from "../src/lib/prisma-pg-config";
import { isLoopbackAddress } from "./demo-schedule-update-core";
import { DEMO_ACADEMIC_PROGRAM, LEGACY_DEMO_INSTITUTE_NAME, type ExistingDemoProgram } from "./demo-profile-fill-core";
import { planDemoInstituteCorrection } from "./update-demo-academic-program-core";

const APPLY_CONFIRMATION = "I_CONFIRM_DEMO_INSTITUTE_NAME_UPDATE";
type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

function parseMode(args: string[]): "dry-run" | "apply" {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return "dry-run";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new Error("Use either --dry-run (default) or --apply.");
}

async function inspect(db: Db): Promise<{ target: ExistingDemoProgram | null; conflicts: ExistingDemoProgram[]; action: "update" | "already-correct" }> {
  const [targets, conflicts] = await Promise.all([
    db.$queryRaw<ExistingDemoProgram[]>`SELECT "id", "code", "name", "instituteName", "facultyName", "directionName", "studyMode"
      FROM "AcademicProgram" WHERE "id" = ${DEMO_ACADEMIC_PROGRAM.id}::uuid`,
    db.$queryRaw<ExistingDemoProgram[]>`SELECT "id", "code", "name", "instituteName", "facultyName", "directionName", "studyMode"
      FROM "AcademicProgram"
      WHERE "code" = ${DEMO_ACADEMIC_PROGRAM.code}
         OR ("name" = ${DEMO_ACADEMIC_PROGRAM.name}
          AND "facultyName" = ${DEMO_ACADEMIC_PROGRAM.facultyName}
          AND "directionName" = ${DEMO_ACADEMIC_PROGRAM.directionName}
          AND "studyMode" = ${DEMO_ACADEMIC_PROGRAM.studyMode})`,
  ]);
  const target = targets[0] ?? null;
  const action = planDemoInstituteCorrection(target, conflicts);
  return { target, conflicts, action };
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  const target = validateLocalDatabaseUrl(connectionString);
  if (target.database !== "digital_campus") throw new Error("Only the local digital_campus database is allowed.");
  if (mode === "apply" && process.env.DIGITAL_CAMPUS_INSTITUTE_UPDATE_APPROVED !== APPLY_CONFIRMATION) {
    throw new Error(`Apply refused. Set DIGITAL_CAMPUS_INSTITUTE_UPDATE_APPROVED=${APPLY_CONFIRMATION} to confirm.`);
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
      const report = await inspect(prisma);
      console.log(`Institute correction: ${report.action === "update" ? "one field will change from ИМЭ to ИМИП" : "already applied; no change needed"}.`);
      console.log("Target program identity and competing program rows were checked. No database records were changed.");
      return;
    }

    const action = await prisma.$transaction(async (tx) => {
      const report = await inspect(tx);
      if (report.action === "already-correct") return report.action;
      const updated = await tx.$executeRaw`UPDATE "AcademicProgram"
        SET "instituteName" = ${DEMO_ACADEMIC_PROGRAM.instituteName}
        WHERE "id" = ${DEMO_ACADEMIC_PROGRAM.id}::uuid
          AND "code" = ${DEMO_ACADEMIC_PROGRAM.code}
          AND "instituteName" = ${LEGACY_DEMO_INSTITUTE_NAME}
          AND "name" = ${DEMO_ACADEMIC_PROGRAM.name}
          AND "facultyName" = ${DEMO_ACADEMIC_PROGRAM.facultyName}
          AND "directionName" = ${DEMO_ACADEMIC_PROGRAM.directionName}
          AND "studyMode" = ${DEMO_ACADEMIC_PROGRAM.studyMode}`;
      if (updated !== 1) throw new Error("The target program changed during the operation; transaction rolled back.");
      if ((await inspect(tx)).action !== "already-correct") throw new Error("The targeted institute update could not be verified; transaction rolled back.");
      return "updated" as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 30_000 });
    console.log(action === "updated" ? "Only AcademicProgram.instituteName was updated to ИМИП." : "The institute correction was already applied; no change was needed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown academic program update error.";
  const connectionString = process.env.DATABASE_URL;
  console.error(`Academic program update stopped safely: ${message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[database connection redacted]").replace(connectionString ?? "\u0000", "[database connection redacted]")}`);
  process.exitCode = 1;
});
