import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const CONFIRMATION = "I_CONFIRM_EMPTY_NEON_DEMO_DATABASE";
const MIN_PASSWORD_LENGTH = 14;

const accounts = [
  {
    login: "sokolova.a_student",
    displayName: "Алиса Соколова",
    role: "STUDENT" as const,
    passwordVariable: "DEMO_PASSWORD_SOKOLOVA_A",
  },
  {
    login: "volkova.m_teacher",
    displayName: "Мария Волкова",
    role: "TEACHER" as const,
    passwordVariable: "DEMO_PASSWORD_VOLKOVA_M",
  },
  {
    login: "orlova.e_dean",
    displayName: "Екатерина Орлова",
    role: "DEAN" as const,
    passwordVariable: "DEMO_PASSWORD_ORLOVA_E",
  },
] as const;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable ${name} is missing.`);
  return value;
}

function validateTarget(): { connectionString: string; host: string; database: string } {
  const connectionString = requiredEnvironment("DATABASE_URL");
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Only PostgreSQL DATABASE_URL targets are supported.");
  }
  if (parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
    throw new Error("DATABASE_URL host override parameters are not allowed.");
  }

  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!host.endsWith(".neon.tech")) throw new Error("The production demo seed only permits a Neon hostname.");
  if (host !== requiredEnvironment("DEMO_SEED_EXPECTED_NEON_HOST").toLowerCase()) {
    throw new Error("DATABASE_URL host does not match DEMO_SEED_EXPECTED_NEON_HOST.");
  }
  if (database !== requiredEnvironment("DEMO_SEED_EXPECTED_DATABASE")) {
    throw new Error("DATABASE_URL database does not match DEMO_SEED_EXPECTED_DATABASE.");
  }
  if (process.env.DIGITAL_CAMPUS_PRODUCTION_DEMO_SEED_APPROVED !== CONFIRMATION) {
    throw new Error("Explicit DIGITAL_CAMPUS_PRODUCTION_DEMO_SEED_APPROVED confirmation is required.");
  }

  return { connectionString, host, database };
}

function collectPasswords(): Map<string, string> {
  const passwords = new Map<string, string>();
  for (const account of accounts) {
    const password = requiredEnvironment(account.passwordVariable);
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`${account.passwordVariable} must contain at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    passwords.set(account.login, password);
  }
  return passwords;
}

async function assertNoApplicationRows(tx: Prisma.TransactionClient): Promise<void> {
  const tables = await tx.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name <> '_prisma_migrations'
     ORDER BY table_name
  `;

  for (const { table_name: tableName } of tables) {
    // Names come from information_schema and are quoted as PostgreSQL identifiers.
    const quotedName = tableName.replaceAll('"', '""');
    const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "public"."${quotedName}"`,
    );
    if (rows[0]?.count !== undefined && rows[0].count.toString() !== "0") {
      throw new Error("Seed refused: the database is not empty. No records were changed.");
    }
  }
}

async function main(): Promise<void> {
  const target = validateTarget();
  const passwords = collectPasswords();
  const passwordHashes = new Map<string, string>();
  for (const account of accounts) {
    const password = passwords.get(account.login);
    if (!password) throw new Error("A demo account password is missing.");
    passwordHashes.set(account.login, await hashPassword(password));
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.connectionString }) });
  try {
    const connection = await prisma.$queryRaw<Array<{ database_name: string }>>`
      SELECT current_database() AS database_name
    `;
    if (connection[0]?.database_name !== target.database) {
      throw new Error("Connected database did not match the explicitly configured target.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('digital-campus-production-demo-seed-v1')) IS NULL AS acquired`;
      await assertNoApplicationRows(tx);

      const now = new Date();
      const users = new Map<string, string>();
      for (const account of accounts) {
        const user = await tx.user.create({
          data: {
            login: account.login,
            passwordHash: passwordHashes.get(account.login),
            activatedAt: now,
            isActive: true,
            profile: { create: { displayName: account.displayName, email: `${account.login}@demo.invalid` } },
            roles: { create: { role: account.role } },
          },
          select: { id: true },
        });
        users.set(account.login, user.id);
      }

      const studentId = users.get("sokolova.a_student");
      const teacherId = users.get("volkova.m_teacher");
      if (!studentId || !teacherId) throw new Error("Required demo account creation failed.");

      await tx.studentAcademicProfile.create({
        data: { userId: studentId, studentNumber: "DEMO-2026-001", admissionYear: 2026, academicStatus: "Демонстрационный" },
      });

      const program = await tx.academicProgram.create({
        data: {
          code: "DEMO-DM",
          name: "Цифровой маркетинг (демо)",
          instituteName: "Демонстрационный институт",
          facultyName: "Факультет цифровых коммуникаций",
          directionName: "Цифровой маркетинг",
          studyMode: "Очная",
        },
        select: { id: true },
      });
      const group = await tx.group.create({
        data: { code: "DEMO-DM-1", name: "Цифровой маркетинг — демо-группа", academicProgramId: program.id },
        select: { id: true },
      });
      const subject = await tx.subject.create({ data: { code: "DEMO-DM", name: "Введение в цифровой маркетинг" }, select: { id: true } });
      const course = await tx.course.create({
        data: { code: "DEMO-101", name: "Введение в цифровой маркетинг", subjectId: subject.id, ownerId: teacherId },
        select: { id: true },
      });

      await tx.groupMembership.create({ data: { groupId: group.id, studentId, startsAt: now } });
      await tx.courseGroup.create({ data: { courseId: course.id, groupId: group.id, academicYear: "2026/2027", semesterNumber: 1 } });
      await tx.teacherAssignment.create({ data: { teacherId, courseId: course.id, groupId: group.id, startsAt: now } });
    }, { isolationLevel: "Serializable", maxWait: 15_000, timeout: 60_000 });

    console.log("Production demo seed completed. Created 1 student, 1 teacher, 1 dean, and their minimal group/course records.");
    console.log("Passwords, DATABASE_URL, and other secret values were not printed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed failure";
  console.error(`Production demo seed failed: ${message}`);
  process.exitCode = 1;
});
