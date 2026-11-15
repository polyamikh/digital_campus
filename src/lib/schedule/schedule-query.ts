export function activeMembershipWhere(studentId: string, now: Date) {
  return {
    studentId,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

export function studentLessonWhere(groupId: string, start: Date, end: Date) {
  return {
    groupId,
    startsAt: { gte: start, lt: end },
    state: { in: ["SCHEDULED", "COMPLETED"] as ("SCHEDULED" | "COMPLETED")[] },
  };
}
