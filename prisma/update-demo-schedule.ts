import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { validateLocalDatabaseUrl } from "../src/lib/auth/demo-password-reset-core";
import { createPrismaPgConfig } from "../src/lib/prisma-pg-config";
import { findScheduleConflicts, lessonScheduleViolation } from "../src/lib/schedule/lesson-rules";
import { stableDemoSeedId } from "./demo-schedule-layout";
import {
  buildDemoClassTargets,
  calendarScheduleMutation,
  findTransientScheduleConflicts,
  isLoopbackAddress,
  isDemoScheduleUpdateApplied,
  lessonScheduleMutation,
  sortScheduleUpdatesForApply,
  sameInstant,
} from "./demo-schedule-update-core";

const APPLY_CONFIRMATION = "I_CONFIRM_DEMO_SCHEDULE_UPDATE";
const UPDATED_SNAPSHOT_MARKER = "demo-class-slots-2026-v1";
const INITIAL_FIXTURE_NOW = new Date("2026-11-08T06:00:00.000Z");

type ScheduleDb = Pick<
  PrismaClient,
  "productionCalendarYear" | "productionCalendarDay" | "lesson" | "academicCalendarEvent"
>;

type PlannedLesson = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  currentVersion: number;
  snapshot: Prisma.InputJsonValue;
};

function parseMode(args: string[]): "dry-run" | "apply" {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return "dry-run";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new Error("Use either --dry-run (default) or --apply.");
}

function asObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("A seed schedule version has an invalid snapshot shape.");
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
    && (snapshot.substituteId === lesson.substituteId
      || (snapshot.substituteId === undefined && lesson.substituteId === null))
    && snapshot.roomId === lesson.roomId
    && snapshot.title === lesson.title
    && snapshot.format === lesson.format
    && snapshot.kind === lesson.kind
    && snapshot.state === lesson.state
    && sameInstant(snapshot.startsAt, lesson.startsAt)
    && sameInstant(snapshot.endsAt, lesson.endsAt);
}

async function inspectSchedule(db: ScheduleDb) {
  const calendar = await db.productionCalendarYear.findUnique({
    where: { year: 2026 },
    select: { id: true },
  });
  if (!calendar) throw new Error("ProductionCalendarYear 2026 is missing; no update was made.");

  const calendarDays = await db.productionCalendarDay.findMany({
    where: { calendarId: calendar.id },
    select: { date: true, kind: true },
  });
  if (calendarDays.length !== 365) {
    throw new Error(`The 2026 production calendar contains ${calendarDays.length} days instead of 365; no update was made.`);
  }
  const workingDates = new Set(
    calendarDays.filter((day) => day.kind === "WORKING").map((day) => day.date.toISOString().slice(0, 10)),
  );
  const targets = buildDemoClassTargets(workingDates);
  if (targets.length !== 162) {
    throw new Error(`The calendar yields ${targets.length} expected demo classes instead of 162; no update was made.`);
  }

  const targetIds = targets.map((target) => target.id);
  const lessons = await db.lesson.findMany({
    where: { id: { in: targetIds } },
    include: {
      versions: { orderBy: { version: "asc" } },
      changeRequests: { where: { state: "PENDING" }, select: { id: true } },
    },
  });
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const missing = targetIds.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`Expected seeded lessons are missing (${missing.length}); no update was made.`);

  const eventRows = await db.academicCalendarEvent.findMany({
    where: { lessonId: { in: targetIds } },
    select: { lessonId: true, startsAt: true, endsAt: true },
  });
  const eventsByLesson = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    if (!event.lessonId) continue;
    eventsByLesson.set(event.lessonId, [...(eventsByLesson.get(event.lessonId) ?? []), event]);
  }

  const updates: PlannedLesson[] = [];
  let alreadyCanonical = 0;
  let alreadyUpdated = 0;
  for (const target of targets) {
    const lesson = byId.get(target.id);
    if (!lesson) throw new Error(`Missing lesson ${target.id}.`);
    const versionOne = lesson.versions.find((version) => version.version === 1);
    const versionTwo = lesson.versions.find((version) => version.version === 2);
    if (!versionOne || lesson.changeRequests.length > 0) {
      throw new Error(`Lesson ${lesson.id} has no original version or has a pending schedule request; no update was made.`);
    }

    const expectedCourseId = stableDemoSeedId(`course:${target.courseKey}`);
    const expectedGroupId = stableDemoSeedId(`group:${target.groupCode}`);
    const expectedTeacherId = stableDemoSeedId(`user:${target.teacherLogin}`);
    const expectedRoomId = stableDemoSeedId(`room:${target.roomCode}`);
    if (lesson.courseId !== expectedCourseId || lesson.groupId !== expectedGroupId
      || lesson.teacherId !== expectedTeacherId || lesson.examinerId !== null
      || lesson.substituteId !== null || lesson.roomId !== expectedRoomId || lesson.kind !== "CLASS") {
      throw new Error(`Lesson ${lesson.id} no longer matches its original seeded assignment; no update was made.`);
    }

    const eventTimesMatch = (startsAt: Date, endsAt: Date) => (eventsByLesson.get(lesson.id) ?? []).every(
      (event) => event.startsAt.getTime() === startsAt.getTime()
        && event.endsAt?.getTime() === endsAt.getTime(),
    );
    const isCanonicalNow = lesson.startsAt.getTime() === target.startsAt.getTime()
      && lesson.endsAt.getTime() === target.endsAt.getTime();

    if (lesson.version === 1 && lesson.versions.length === 1 && isCanonicalNow
      && snapshotMatchesLesson(versionOne.snapshot, lesson)
      && eventTimesMatch(target.startsAt, target.endsAt)) {
      alreadyCanonical += 1;
      continue;
    }

    if (versionTwo && snapshotMatchesLesson(versionTwo.snapshot, lesson)
      && isDemoScheduleUpdateApplied({
        lessonVersion: lesson.version,
        scheduleVersionCount: lesson.versions.length,
        correctionMarker: asObject(versionTwo.snapshot).scheduleCorrection,
        currentStartsAt: lesson.startsAt,
        currentEndsAt: lesson.endsAt,
        expectedStartsAt: target.startsAt,
        expectedEndsAt: target.endsAt,
        relatedEventsMatch: eventTimesMatch(target.startsAt, target.endsAt),
      })
      && asObject(versionOne.snapshot).startsAt === target.legacyStartsAt.toISOString()
      && asObject(versionOne.snapshot).endsAt === target.legacyEndsAt.toISOString()
    ) {
      alreadyUpdated += 1;
      continue;
    }

    const expectedSeedState = target.legacyStartsAt < INITIAL_FIXTURE_NOW ? "COMPLETED" : "SCHEDULED";
    if (lesson.version !== 1 || lesson.versions.length !== 1 || lesson.state !== expectedSeedState
      || !sameInstant(asObject(versionOne.snapshot).startsAt, target.legacyStartsAt)
      || !sameInstant(asObject(versionOne.snapshot).endsAt, target.legacyEndsAt)
      || !snapshotMatchesLesson(versionOne.snapshot, lesson)
      || !eventTimesMatch(target.legacyStartsAt, target.legacyEndsAt)) {
      throw new Error(`Lesson ${lesson.id} differs from its immutable seed baseline; no update was made.`);
    }

    const violation = lessonScheduleViolation("CLASS", target.startsAt, target.endsAt);
    if (violation) throw new Error(`New slot for lesson ${lesson.id} is invalid: ${violation}`);
    const baseSnapshot = asObject(versionOne.snapshot);
    updates.push({
      id: lesson.id,
      startsAt: target.startsAt,
      endsAt: target.endsAt,
      currentVersion: lesson.version,
      snapshot: {
        ...baseSnapshot,
        startsAt: target.startsAt.toISOString(),
        endsAt: target.endsAt.toISOString(),
        scheduleCorrection: UPDATED_SNAPSHOT_MARKER,
      } as Prisma.InputJsonValue,
    });
  }

  const orderedUpdates = sortScheduleUpdatesForApply(updates);
  const allLessons = await db.lesson.findMany({
    select: {
      id: true,
      kind: true,
      state: true,
      startsAt: true,
      endsAt: true,
      groupId: true,
      roomId: true,
      teacherId: true,
      substituteId: true,
      examinerId: true,
    },
  });
  const changesById = new Map(orderedUpdates.map((update) => [update.id, update]));
  const conflictRows = allLessons.map((lesson) => {
    const change = changesById.get(lesson.id);
    return {
      ...lesson,
      startsAt: change?.startsAt ?? lesson.startsAt,
      endsAt: change?.endsAt ?? lesson.endsAt,
    };
  });
  const conflicts = findScheduleConflicts(conflictRows);
  const transientConflicts = findTransientScheduleConflicts(
    allLessons,
    orderedUpdates.map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt })),
  );
  const invalidExams = allLessons
    .filter((lesson) => lesson.kind === "EXAM")
    .map((lesson) => ({ id: lesson.id, violation: lessonScheduleViolation("EXAM", lesson.startsAt, lesson.endsAt) }))
    .filter((exam): exam is { id: string; violation: string } => exam.violation !== null);

  return { targets, updates: orderedUpdates, alreadyCanonical, alreadyUpdated, conflicts: [...conflicts, ...transientConflicts], invalidExams };
}

function printPlan(report: Awaited<ReturnType<typeof inspectSchedule>>): void {
  console.log("Schedule update dry-run plan:");
  console.log(`  Demo class records checked: ${report.targets.length}`);
  console.log(`  Classes to update: ${report.updates.length}`);
  console.log(`  Already canonical: ${report.alreadyCanonical}`);
  console.log(`  Previously updated: ${report.alreadyUpdated}`);
  console.log(`  Invalid exam records: ${report.invalidExams.length}`);
  for (const exam of report.invalidExams) console.log(`  Exam ${exam.id}: ${exam.violation}`);
  console.log(`  Resource conflicts after planned updates: ${report.conflicts.length}`);
  for (const conflict of report.conflicts) {
    console.log(`  ${conflict.resource} ${conflict.resourceId}: ${conflict.lessonIds.join(" / ")}`);
  }
  console.log("  Related grades, homework, attendance and history rows are not included in the write plan.");
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  const target = validateLocalDatabaseUrl(connectionString);
  if (mode === "apply" && process.env.DIGITAL_CAMPUS_SCHEDULE_UPDATE_APPROVED !== APPLY_CONFIRMATION) {
    throw new Error(`Apply refused. Set DIGITAL_CAMPUS_SCHEDULE_UPDATE_APPROVED=${APPLY_CONFIRMATION} to confirm.`);
  }
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const prisma = new PrismaClient({ adapter: new PrismaPg(createPrismaPgConfig(connectionString)) });
  try {
    const endpoint = await prisma.$queryRaw<Array<{
      databaseName: string;
      serverAddress: string | null;
      serverPort: number | null;
      timezone: string;
    }>>`
      SELECT current_database() AS "databaseName",
             inet_server_addr()::text AS "serverAddress",
             inet_server_port() AS "serverPort",
             current_setting('TimeZone') AS "timezone"
    `;
    const server = endpoint[0];
    if (server?.databaseName !== "digital_campus" || target.database !== "digital_campus"
      || !server.serverAddress || !isLoopbackAddress(server.serverAddress)) {
      throw new Error("Refused: the live PostgreSQL connection is not the local digital_campus loopback database.");
    }
    if (server.timezone !== "UTC") throw new Error("Refused: PostgreSQL session timezone is not UTC.");

    if (mode === "dry-run") {
      printPlan(await inspectSchedule(prisma));
      console.log("No records were changed. Use --apply plus explicit confirmation only after reviewing this plan.");
      return;
    }

    const applied = await prisma.$transaction(async (tx) => {
      const report = await inspectSchedule(tx);
      printPlan(report);
      if (report.invalidExams.length > 0) {
        throw new Error("Apply refused: invalid exams require separate review and approval; this script never changes exams.");
      }
      if (report.conflicts.length > 0) throw new Error("Apply refused: planned schedule has resource conflicts.");
      for (const update of report.updates) {
        const result = await tx.lesson.updateMany({
          where: { id: update.id, version: update.currentVersion },
          data: lessonScheduleMutation(update.startsAt, update.endsAt),
        });
        if (result.count !== 1) throw new Error(`Lesson ${update.id} changed concurrently; the transaction was rolled back.`);
        await tx.lessonScheduleVersion.create({
          data: {
            id: stableDemoSeedId(`lesson-schedule-version:${update.id}:2`),
            lessonId: update.id,
            version: 2,
            snapshot: update.snapshot,
            changedAt: new Date(),
          },
        });
        await tx.academicCalendarEvent.updateMany({
          where: { lessonId: update.id },
          data: calendarScheduleMutation(update.startsAt, update.endsAt),
        });
      }
      return { changed: report.updates.length, alreadyCanonical: report.alreadyCanonical, alreadyUpdated: report.alreadyUpdated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 120_000 });
    console.log(`Schedule update applied atomically: ${applied.changed} lessons; ${applied.alreadyCanonical + applied.alreadyUpdated} required no write.`);
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
  console.error(`Schedule update stopped safely: ${message}`);
  process.exitCode = 1;
});
