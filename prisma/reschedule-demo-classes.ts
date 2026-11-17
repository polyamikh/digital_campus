import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { validateLocalDatabaseUrl } from "../src/lib/auth/demo-password-reset-core";
import { createPrismaPgConfig } from "../src/lib/prisma-pg-config";
import { findScheduleConflicts, lessonScheduleViolation } from "../src/lib/schedule/lesson-rules";
import { stableDemoSeedId } from "./demo-schedule-layout";
import {
  buildDemoRealisticClassTargets,
  DEMO_CLASS_DISTRIBUTION_MARKER,
  isDemoClassDistributionApplied,
} from "./demo-realistic-schedule-core";
import { isLoopbackAddress, sameInstant } from "./demo-schedule-update-core";

const APPLY_CONFIRMATION = "I_CONFIRM_DEMO_CLASS_DISTRIBUTION";
type ScheduleDb = Pick<PrismaClient, "productionCalendarYear" | "productionCalendarDay" | "lesson" | "academicCalendarEvent">;

type PlannedUpdate = {
  id: string;
  currentVersion: number;
  startsAt: Date;
  endsAt: Date;
  snapshot: Prisma.InputJsonValue;
  eventCount: number;
};

function modeFromArgs(args: string[]): "dry-run" | "apply" {
  if (args.length === 0 || args.length === 1 && args[0] === "--dry-run") return "dry-run";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new Error("Use either --dry-run (default) or --apply.");
}

function asObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("A LessonScheduleVersion snapshot has an invalid shape.");
  }
  return value as Record<string, Prisma.JsonValue>;
}

function snapshotMatchesLesson(snapshotValue: Prisma.JsonValue, lesson: {
  courseId: string;
  groupId: string;
  teacherId: string | null;
  examinerId: string | null;
  substituteId: string | null;
  roomId: string | null;
  title: string;
  format: string | null;
  kind: string;
  state: string;
  startsAt: Date;
  endsAt: Date;
}): boolean {
  const snapshot = asObject(snapshotValue);
  return snapshot.courseId === lesson.courseId
    && snapshot.groupId === lesson.groupId
    && snapshot.teacherId === lesson.teacherId
    && snapshot.examinerId === lesson.examinerId
    && (snapshot.substituteId === lesson.substituteId || snapshot.substituteId === undefined && lesson.substituteId === null)
    && snapshot.roomId === lesson.roomId
    && snapshot.title === lesson.title
    && snapshot.format === lesson.format
    && snapshot.kind === lesson.kind
    && snapshot.state === lesson.state
    && sameInstant(snapshot.startsAt, lesson.startsAt)
    && sameInstant(snapshot.endsAt, lesson.endsAt);
}

function expectedStaffIds(lesson: { teacherId: string | null; examinerId: string | null; substituteId: string | null }): string[] {
  return [...new Set([lesson.substituteId ?? lesson.teacherId, lesson.examinerId].filter((id): id is string => id !== null))].sort();
}

function reservationRowsMatch(lesson: {
  id: string;
  state: string;
  startsAt: Date;
  endsAt: Date;
  teacherId: string | null;
  examinerId: string | null;
  substituteId: string | null;
  staffReservations: Array<{ staffId: string; startsAt: Date; endsAt: Date; isActive: boolean }>;
}): boolean {
  const actual = lesson.staffReservations.filter((reservation) => reservation.isActive)
    .map((reservation) => reservation.staffId).sort();
  const expected = lesson.state === "SCHEDULED" ? expectedStaffIds(lesson) : [];
  return JSON.stringify(actual) === JSON.stringify(expected)
    && lesson.staffReservations.filter((reservation) => reservation.isActive)
      .every((reservation) => reservation.startsAt.getTime() === lesson.startsAt.getTime()
        && reservation.endsAt.getTime() === lesson.endsAt.getTime());
}

async function inspect(db: ScheduleDb, now: Date) {
  const calendar = await db.productionCalendarYear.findUnique({ where: { year: 2026 }, select: { id: true } });
  if (!calendar) throw new Error("ProductionCalendarYear 2026 is missing; no updates were made.");
  const calendarDays = await db.productionCalendarDay.findMany({ where: { calendarId: calendar.id }, select: { date: true, kind: true } });
  if (calendarDays.length !== 365) throw new Error(`The 2026 production calendar has ${calendarDays.length} dates; expected 365.`);
  const workingDates = new Set(calendarDays.filter((day) => day.kind === "WORKING").map((day) => day.date.toISOString().slice(0, 10)));
  const targets = buildDemoRealisticClassTargets(workingDates);
  if (targets.length !== 162) throw new Error(`The existing demo fixture has ${targets.length} expected classes; expected 162.`);

  const ids = targets.map((target) => target.id);
  const lessons = await db.lesson.findMany({
    where: { id: { in: ids } },
    include: {
      versions: { orderBy: { version: "asc" } },
      changeRequests: { select: { id: true } },
      attendanceRecords: { select: { id: true } },
      staffReservations: { select: { staffId: true, startsAt: true, endsAt: true, isActive: true } },
    },
  });
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`Expected seeded Lesson rows are missing (${missing.length}).`);

  const eventRows = await db.academicCalendarEvent.findMany({
    where: { lessonId: { in: ids } },
    select: { lessonId: true, startsAt: true, endsAt: true },
  });
  const eventsByLesson = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    if (event.lessonId) eventsByLesson.set(event.lessonId, [...(eventsByLesson.get(event.lessonId) ?? []), event]);
  }

  const updates: PlannedUpdate[] = [];
  let alreadyApplied = 0;
  let unchanged = 0;
  let historicalSkipped = 0;

  for (const target of targets) {
    const lesson = byId.get(target.id);
    if (!lesson) throw new Error(`Missing Lesson ${target.id}.`);
    if (lesson.courseId !== stableDemoSeedId(`course:${target.courseKey}`)
      || lesson.groupId !== stableDemoSeedId(`group:${target.groupCode}`)
      || lesson.teacherId !== stableDemoSeedId(`user:${target.teacherLogin}`)
      || lesson.examinerId !== null || lesson.substituteId !== null
      || lesson.roomId !== stableDemoSeedId(`room:${target.roomCode}`) || lesson.kind !== "CLASS") {
      throw new Error(`Lesson ${lesson.id} no longer matches its seeded course/group/staff/room; no updates were made.`);
    }
    if (lesson.version !== lesson.versions.length || lesson.versions.some((version, index) => version.version !== index + 1)) {
      throw new Error(`Lesson ${lesson.id} has an inconsistent schedule-version history.`);
    }
    const latest = lesson.versions.at(-1);
    if (!latest || !snapshotMatchesLesson(latest.snapshot, lesson)) {
      throw new Error(`Lesson ${lesson.id} does not match its latest schedule snapshot.`);
    }
    if (!reservationRowsMatch(lesson)) throw new Error(`Lesson ${lesson.id} has inconsistent staff reservations.`);
    if (lesson.changeRequests.length > 0) throw new Error(`Lesson ${lesson.id} already has schedule-change history; manual review is required.`);

    const relatedEvents = eventsByLesson.get(lesson.id) ?? [];
    const relatedEventsMatch = relatedEvents.length > 0 && relatedEvents.every((event) =>
      event.startsAt.getTime() === lesson.startsAt.getTime() && event.endsAt?.getTime() === lesson.endsAt.getTime());
    const alreadyCorrected = latest && isDemoClassDistributionApplied({
      lessonVersion: lesson.version,
      scheduleVersionCount: lesson.versions.length,
      correctionMarker: asObject(latest.snapshot).scheduleCorrection,
      currentStartsAt: lesson.startsAt,
      currentEndsAt: lesson.endsAt,
      expectedStartsAt: target.targetStartsAt,
      expectedEndsAt: target.targetEndsAt,
      relatedEventsMatch,
    });
    if (alreadyCorrected) {
      alreadyApplied += 1;
      continue;
    }

    const sourceMatches = lesson.startsAt.getTime() === target.startsAt.getTime()
      && lesson.endsAt.getTime() === target.endsAt.getTime();
    if (!sourceMatches) throw new Error(`Lesson ${lesson.id} has unexpected dates; no updates were made.`);
    if (lesson.startsAt.getTime() === target.targetStartsAt.getTime()
      && lesson.endsAt.getTime() === target.targetEndsAt.getTime()) {
      unchanged += 1;
      continue;
    }

    if (lesson.state !== "SCHEDULED" || lesson.startsAt < now) {
      historicalSkipped += 1;
      continue;
    }
    if (lesson.attendanceRecords.length > 0) throw new Error(`Future Lesson ${lesson.id} already has attendance records; no updates were made.`);
    if (!relatedEventsMatch) throw new Error(`Lesson ${lesson.id} has missing or stale calendar projections; no updates were made.`);
    const snapshot = {
      ...asObject(latest.snapshot),
      startsAt: target.targetStartsAt.toISOString(),
      endsAt: target.targetEndsAt.toISOString(),
      scheduleCorrection: DEMO_CLASS_DISTRIBUTION_MARKER,
    } as Prisma.InputJsonValue;
    updates.push({
      id: lesson.id,
      currentVersion: lesson.version,
      startsAt: target.targetStartsAt,
      endsAt: target.targetEndsAt,
      snapshot,
      eventCount: relatedEvents.length,
    });
  }

  const allLessons = await db.lesson.findMany({
    select: { id: true, kind: true, state: true, startsAt: true, endsAt: true, groupId: true, roomId: true, teacherId: true, substituteId: true, examinerId: true },
  });
  const updateById = new Map(updates.map((update) => [update.id, update]));
  const finalLessons = allLessons.map((lesson) => {
    const update = updateById.get(lesson.id);
    return update ? { ...lesson, startsAt: update.startsAt, endsAt: update.endsAt } : lesson;
  });
  const conflicts = findScheduleConflicts(finalLessons);
  const invalidExams = allLessons.filter((lesson) => lesson.kind === "EXAM")
    .map((lesson) => ({ id: lesson.id, violation: lessonScheduleViolation("EXAM", lesson.startsAt, lesson.endsAt) }))
    .filter((row): row is { id: string; violation: string } => row.violation !== null);
  const invalidClasses = finalLessons.filter((lesson) => lesson.kind === "CLASS")
    .map((lesson) => ({ id: lesson.id, violation: lessonScheduleViolation("CLASS", lesson.startsAt, lesson.endsAt) }))
    .filter((row): row is { id: string; violation: string } => row.violation !== null);

  return { targets, updates, alreadyApplied, unchanged, historicalSkipped, conflicts, invalidExams, invalidClasses };
}

function printPlan(report: Awaited<ReturnType<typeof inspect>>): void {
  console.log("Demo class distribution plan (future scheduled Lesson only):");
  console.log(`  Existing seeded classes checked: ${report.targets.length}`);
  console.log(`  Future class records to move: ${report.updates.length}`);
  console.log(`  Already updated (idempotent no-op): ${report.alreadyApplied}`);
  console.log(`  Already on proposed slot: ${report.unchanged}`);
  console.log(`  Past/completed rows left unchanged: ${report.historicalSkipped}`);
  console.log(`  Resource conflicts after plan: ${report.conflicts.length}`);
  for (const conflict of report.conflicts) console.log(`  ${conflict.resource} ${conflict.resourceId}: ${conflict.lessonIds.join(" / ")}`);
  console.log(`  Invalid class slots: ${report.invalidClasses.length}; invalid exams: ${report.invalidExams.length}`);
  for (const row of [...report.invalidClasses, ...report.invalidExams]) console.log(`  Lesson ${row.id}: ${row.violation}`);
  for (const update of report.updates) {
    const source = report.targets.find((target) => target.id === update.id);
    console.log(`  ${source?.groupCode ?? "group"} ${source?.courseKey ?? "course"}: ${source?.date} ${source?.startsAt.toISOString()} -> ${update.startsAt.toISOString()}`);
  }
  console.log("  The write set updates only Lesson times/version, appends LessonScheduleVersion, and refreshes existing AcademicCalendarEvent times.");
  console.log("  Attendance, grades, homework, passwords, exam records and other academic data are not written.");
}

async function main(): Promise<void> {
  const mode = modeFromArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  const target = validateLocalDatabaseUrl(connectionString);
  if (mode === "apply" && process.env.DIGITAL_CAMPUS_CLASS_DISTRIBUTION_APPROVED !== APPLY_CONFIRMATION) {
    throw new Error(`Apply refused. Set DIGITAL_CAMPUS_CLASS_DISTRIBUTION_APPROVED=${APPLY_CONFIRMATION} to confirm.`);
  }
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const prisma = new PrismaClient({ adapter: new PrismaPg(createPrismaPgConfig(connectionString)) });
  try {
    const endpoint = await prisma.$queryRaw<Array<{ databaseName: string; serverAddress: string | null; sessionTimezone: string }>>`
      SELECT current_database() AS "databaseName",
             inet_server_addr()::text AS "serverAddress",
             current_setting('TimeZone') AS "sessionTimezone"
    `;
    const server = endpoint[0];
    if (target.database !== "digital_campus" || server?.databaseName !== "digital_campus"
      || !server.serverAddress || !isLoopbackAddress(server.serverAddress) || server.sessionTimezone !== "UTC") {
      throw new Error("Refused: connection must be the local digital_campus database with UTC session timezone.");
    }

    if (mode === "dry-run") {
      printPlan(await inspect(prisma, new Date()));
      console.log("Dry-run only: no rows were changed.");
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const report = await inspect(tx, new Date());
      printPlan(report);
      if (report.conflicts.length || report.invalidClasses.length || report.invalidExams.length) {
        throw new Error("Apply refused: resolve schedule conflicts or invalid existing time slots first.");
      }
      const ids = report.updates.map((update) => update.id);
      if (ids.length === 0) return { changed: 0, alreadyApplied: report.alreadyApplied };

      // The transaction makes the temporary cancellation invisible to readers.
      // It releases the non-deferrable PostgreSQL exclusion constraints while
      // moved rows are repositioned; their final states are restored below.
      const released = await tx.lesson.updateMany({
        where: { id: { in: ids }, state: "SCHEDULED" },
        data: { state: "CANCELLED" },
      });
      if (released.count !== ids.length) throw new Error("Some Lesson rows changed concurrently; transaction rolled back.");

      for (const update of report.updates) {
        const result = await tx.lesson.updateMany({
          where: { id: update.id, state: "CANCELLED", version: update.currentVersion },
          data: { startsAt: update.startsAt, endsAt: update.endsAt, state: "SCHEDULED", version: { increment: 1 } },
        });
        if (result.count !== 1) throw new Error(`Lesson ${update.id} changed concurrently; transaction rolled back.`);
        await tx.lessonScheduleVersion.create({
          data: {
            id: stableDemoSeedId(`lesson-schedule-version:${update.id}:distribution-v1`),
            lessonId: update.id,
            version: update.currentVersion + 1,
            snapshot: update.snapshot,
            changedAt: new Date(),
          },
        });
        const eventResult = await tx.academicCalendarEvent.updateMany({
          where: { lessonId: update.id },
          data: { startsAt: update.startsAt, endsAt: update.endsAt },
        });
        if (eventResult.count !== update.eventCount) throw new Error(`Calendar projections for Lesson ${update.id} changed concurrently.`);
      }

      const reservations = await tx.scheduleStaffReservation.findMany({
        where: { lessonId: { in: ids }, isActive: true },
        select: { lessonId: true, staffId: true, startsAt: true, endsAt: true },
      });
      for (const update of report.updates) {
        const lesson = await tx.lesson.findUnique({ where: { id: update.id }, select: { teacherId: true, examinerId: true, substituteId: true } });
        if (!lesson) throw new Error(`Lesson ${update.id} disappeared during update.`);
        const rows = reservations.filter((reservation) => reservation.lessonId === update.id);
        const staffIds = rows.map((row) => row.staffId).sort();
        if (JSON.stringify(staffIds) !== JSON.stringify(expectedStaffIds(lesson))
          || rows.some((row) => row.startsAt.getTime() !== update.startsAt.getTime() || row.endsAt.getTime() !== update.endsAt.getTime())) {
          throw new Error(`Staff reservation sync failed for Lesson ${update.id}; transaction rolled back.`);
        }
      }
      return { changed: report.updates.length, alreadyApplied: report.alreadyApplied };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 120_000 });
    console.log(`Class schedule update applied: ${result.changed} Lesson rows; ${result.alreadyApplied} already applied.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : "Unknown schedule update error.";
  const connectionString = process.env.DATABASE_URL;
  const message = rawMessage
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[database connection redacted]")
    .replace(connectionString ?? "\u0000", "[database connection redacted]");
  console.error(`Demo class rescheduling stopped safely: ${message}`);
  process.exitCode = 1;
});
