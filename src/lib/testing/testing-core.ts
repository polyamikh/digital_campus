export type TestingStatus = "AVAILABLE" | "UPCOMING" | "COMPLETED" | "OVERDUE" | "ATTEMPTS_EXHAUSTED" | "DRAFT";

export type TestStatusInput = {
  state: "DRAFT" | "PUBLISHED" | "WITHDRAWN";
  opensAt: Date | null;
  closesAt: Date | null;
  attemptLimit: number | null;
  attemptsUsed: number;
  hasCompletedAttempt: boolean;
};

export function getStudentTestStatus(input: TestStatusInput, now: Date): TestingStatus {
  if (input.state !== "PUBLISHED") return "DRAFT";
  if (input.hasCompletedAttempt) return "COMPLETED";
  if (input.closesAt && input.closesAt.getTime() <= now.getTime()) return "OVERDUE";
  if (input.opensAt && input.opensAt.getTime() > now.getTime()) return "UPCOMING";
  if (input.attemptLimit !== null && input.attemptsUsed >= input.attemptLimit) return "ATTEMPTS_EXHAUSTED";
  return "AVAILABLE";
}

export function safeExternalTestUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validAttemptLimit(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

export function testDeletionDisposition(input: {
  attempts: number; gradeEntries: number; gradeRevisions: number; publishedResults: number;
  sentReminders: number; notifications: number; linkedHomework: boolean;
}): "DELETE" | "WITHDRAW" {
  return input.attempts === 0 && input.gradeEntries === 0 && input.gradeRevisions === 0 && input.publishedResults === 0 && input.sentReminders === 0 && input.notifications === 0 && !input.linkedHomework
    ? "DELETE"
    : "WITHDRAW";
}

export function canLowerAttemptLimit(newLimit: number | null, attemptsUsed: number): boolean {
  return newLimit === null || newLimit >= attemptsUsed;
}

export function shiftReminder(oldDueAt: Date, newDueAt: Date, scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() + newDueAt.getTime() - oldDueAt.getTime());
}

export function isCompletedAttemptState(state: string): boolean {
  return state === "SUBMITTED" || state === "REVIEWED" || state === "PUBLISHED";
}

export function publishedTestResult(revision: { score: { toString(): string }; state: string; publishedAt: Date | null } | null | undefined): string | null {
  return revision?.state === "PUBLISHED" && revision.publishedAt ? revision.score.toString() : null;
}

export function studentTestScope(groupId: string) {
  return {
    state: "PUBLISHED" as const,
    publishedAt: { not: null },
    assessment: { is: { groupId } },
    course: { groups: { some: { groupId } } },
  };
}

export function studentAttemptScope(studentId: string) {
  return { studentId };
}

export function activeStudentMembershipScope(now: Date) {
  return {
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
    student: { isActive: true, roles: { some: { role: "STUDENT" as const, revokedAt: null } } },
  };
}

export function teacherAssignmentScope(teacherId: string, assignmentId?: string) {
  return {
    teacherId,
    ...(assignmentId ? { id: assignmentId } : {}),
  };
}

export function testingTabForStatus(status: TestingStatus): "available" | "completed" | "overdue" {
  if (status === "COMPLETED") return "completed";
  if (status === "OVERDUE") return "overdue";
  return "available";
}
