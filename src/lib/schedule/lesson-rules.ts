import { moscowDateKey, moscowTime } from "./moscow-time";

export type LessonScheduleKind = "CLASS" | "EXAM";
export type LessonScheduleStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export type LessonScheduleCandidate = {
  id: string;
  kind: LessonScheduleKind;
  state: LessonScheduleStatus;
  startsAt: Date;
  endsAt: Date;
  groupId: string;
  roomId: string | null;
  teacherId: string | null;
  substituteId: string | null;
  examinerId: string | null;
};

export type ScheduleConflict = {
  resource: "group" | "room" | "staff";
  resourceId: string;
  lessonIds: [string, string];
};

export type ScheduleProposalCandidate = Partial<Pick<LessonScheduleCandidate, "startsAt" | "endsAt" | "roomId" | "teacherId" | "substituteId" | "examinerId">> & {
  cancelled?: boolean | null;
};

export const WEEKDAY_CLASS_SLOTS = [
  { start: "19:00", end: "20:20" },
  { start: "20:30", end: "21:50" },
] as const;

export const SATURDAY_CLASS_SLOTS = [
  { start: "10:35", end: "11:55" },
  { start: "12:55", end: "14:15" },
  { start: "14:30", end: "15:50" },
] as const;

export const EXAM_DURATIONS_MINUTES = [80, 120, 180] as const;

function localWeekday(date: Date): number {
  return new Date(`${moscowDateKey(date)}T00:00:00.000Z`).getUTCDay();
}

function hasWholeMinutePrecision(date: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return parts.find((part) => part.type === "second")?.value === "00" && date.getUTCMilliseconds() === 0;
}

function matchesSlot(startsAt: Date, endsAt: Date, slot: { start: string; end: string }): boolean {
  return moscowTime(startsAt) === slot.start
    && moscowTime(endsAt) === slot.end
    && hasWholeMinutePrecision(startsAt)
    && hasWholeMinutePrecision(endsAt)
    && endsAt.getTime() - startsAt.getTime() === 80 * 60_000;
}

export function lessonScheduleViolation(kind: LessonScheduleKind, startsAt: Date, endsAt: Date): string | null {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return "Окончание занятия должно быть позже начала.";
  }
  if (moscowDateKey(startsAt) !== moscowDateKey(endsAt)) {
    return "Занятие или экзамен должен завершиться в тот же московский календарный день.";
  }

  const weekday = localWeekday(startsAt);
  if (weekday === 0) return "Воскресенье — день без занятий и экзаменов.";

  if (kind === "CLASS") {
    const slots = weekday === 6 ? SATURDAY_CLASS_SLOTS : WEEKDAY_CLASS_SLOTS;
    return slots.some((slot) => matchesSlot(startsAt, endsAt, slot))
      ? null
      : weekday === 6
        ? "Субботнее занятие должно соответствовать одному из утверждённых слотов 10:35–11:55, 12:55–14:15 или 14:30–15:50."
        : "Будничное занятие должно соответствовать слоту 19:00–20:20 или 20:30–21:50.";
  }

  const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (!(EXAM_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
    return "Продолжительность экзамена должна составлять 80, 120 или 180 минут.";
  }

  const startTime = moscowTime(startsAt);
  const endTime = moscowTime(endsAt);
  const withinBounds = weekday === 6
    ? startTime >= "10:35" && endTime <= "15:50"
    : startTime >= "19:00" && endTime <= "21:50";
  return withinBounds
    ? null
    : weekday === 6
      ? "Субботний экзамен должен полностью пройти в интервале 10:35–15:50."
      : "Экзамен в будни должен полностью пройти в интервале 19:00–21:50.";
}

export function assertLessonScheduleValid(kind: LessonScheduleKind, startsAt: Date, endsAt: Date): void {
  const violation = lessonScheduleViolation(kind, startsAt, endsAt);
  if (violation) throw new Error(violation);
}

export function isLessonScheduleValid(kind: LessonScheduleKind, startsAt: Date, endsAt: Date): boolean {
  return lessonScheduleViolation(kind, startsAt, endsAt) === null;
}

export function findScheduleConflicts(lessons: LessonScheduleCandidate[]): ScheduleConflict[] {
  const active = lessons.filter((lesson) => lesson.state === "SCHEDULED");
  const conflicts: ScheduleConflict[] = [];
  const checked = new Set<string>();
  const compare = (left: LessonScheduleCandidate, right: LessonScheduleCandidate, resource: ScheduleConflict["resource"], resourceId: string) => {
    if (left.startsAt >= right.endsAt || right.startsAt >= left.endsAt) return;
    const ids = [left.id, right.id].sort() as [string, string];
    const key = `${resource}:${resourceId}:${ids[0]}:${ids[1]}`;
    if (!checked.has(key)) {
      checked.add(key);
      conflicts.push({ resource, resourceId, lessonIds: ids });
    }
  };

  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    const left = active[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const right = active[rightIndex];
      if (!right) continue;
      if (left.groupId === right.groupId) compare(left, right, "group", left.groupId);
      if (left.roomId && left.roomId === right.roomId) compare(left, right, "room", left.roomId);
      const leftStaff = new Set([left.substituteId ?? left.teacherId, left.examinerId].filter((id): id is string => id !== null));
      const rightStaff = new Set([right.substituteId ?? right.teacherId, right.examinerId].filter((id): id is string => id !== null));
      for (const staffId of leftStaff) if (rightStaff.has(staffId)) compare(left, right, "staff", staffId);
    }
  }
  return conflicts;
}

export function validateScheduleProposal(
  current: LessonScheduleCandidate,
  proposal: ScheduleProposalCandidate,
  otherLessons: LessonScheduleCandidate[],
): { candidate: LessonScheduleCandidate | null; conflicts: ScheduleConflict[] } {
  if (proposal.cancelled === true) return { candidate: null, conflicts: [] };

  const candidate: LessonScheduleCandidate = {
    ...current,
    state: "SCHEDULED",
    startsAt: proposal.startsAt ?? current.startsAt,
    endsAt: proposal.endsAt ?? current.endsAt,
    roomId: proposal.roomId === undefined ? current.roomId : proposal.roomId,
    teacherId: proposal.teacherId === undefined ? current.teacherId : proposal.teacherId,
    substituteId: proposal.substituteId === undefined ? current.substituteId : proposal.substituteId,
    examinerId: proposal.examinerId === undefined ? current.examinerId : proposal.examinerId,
  };
  assertLessonScheduleValid(candidate.kind, candidate.startsAt, candidate.endsAt);
  const conflicts = findScheduleConflicts([...otherLessons.filter((lesson) => lesson.id !== current.id), candidate]);
  return { candidate, conflicts };
}
