import { getMoscowDayBounds, moscowDateKey, moscowTime } from "@/lib/schedule/moscow-time";

export type TaskPriorityValue = "LOW" | "MEDIUM" | "HIGH";
export type TaskCategoryValue = "STUDY" | "WORK" | "PERSONAL";
export type TaskCalendarMode = "month" | "week" | "day" | "list";
export type TaskStatusFilter = "ALL" | "OPEN" | "COMPLETED";
export type TaskPriorityFilter = "ALL" | TaskPriorityValue;
export type TaskDeadlineFilter = "ALL" | "UPCOMING" | "OVERDUE";

export type TaskCalendarEvent = {
  id: string;
  sourceId: string;
  sourceType: "PERSONAL_TASK" | "ASSIGNED_TASK" | "LESSON" | "HOMEWORK" | "TEST";
  category: TaskCategoryValue;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  priority: TaskPriorityValue | null;
  state: string;
  sourceLabel: string;
  href: string | null;
  reminderAt: Date | null;
  version?: number;
};

export class TaskInputError extends Error {}

export function personalTaskOwnerWhere(ownerId: string, taskId?: string) {
  return { ownerId, ...(taskId ? { id: taskId } : {}) };
}

export function validTaskDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validTaskMonthKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  return parts[0] >= 2000 && parts[0] <= 2200 && parts[1] >= 1 && parts[1] <= 12;
}

export function currentMoscowMonth(now = new Date()): string {
  return moscowDateKey(now).slice(0, 7);
}

export function shiftTaskMonth(month: string, offset: -1 | 1): string {
  if (!validTaskMonthKey(month)) throw new TaskInputError("Некорректный месяц.");
  const parts = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(parts[0], parts[1] - 1 + offset, 1));
  return String(shifted.getUTCFullYear()) + "-" + String(shifted.getUTCMonth() + 1).padStart(2, "0");
}

export function taskMonthGrid(month: string): string[] {
  if (!validTaskMonthKey(month)) throw new TaskInputError("Некорректный месяц.");
  const parts = month.split("-").map(Number);
  const first = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
  const leadingDays = (first.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(parts[0], parts[1], 0));
  const totalCells = Math.ceil((leadingDays + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: totalCells }, (_, index) => {
    const day = new Date(Date.UTC(parts[0], parts[1] - 1, 1 - leadingDays + index));
    return String(day.getUTCFullYear()) + "-" + String(day.getUTCMonth() + 1).padStart(2, "0") + "-" + String(day.getUTCDate()).padStart(2, "0");
  });
}

export function shiftTaskDate(dateKey: string, days: number): string {
  if (!validTaskDateKey(dateKey) || !Number.isInteger(days)) throw new TaskInputError("Некорректная дата.");
  const date = new Date(dateKey + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function taskWeekGrid(dateKey: string): string[] {
  if (!validTaskDateKey(dateKey)) throw new TaskInputError("Некорректная дата.");
  const date = new Date(dateKey + "T12:00:00.000Z");
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const monday = shiftTaskDate(dateKey, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) => shiftTaskDate(monday, index));
}

export function taskViewDateKeys(mode: TaskCalendarMode, month: string, selectedDate: string): string[] {
  if (mode === "month") return taskMonthGrid(month);
  if (mode === "list") {
    if (!validTaskMonthKey(month)) throw new TaskInputError("Некорректный месяц.");
    const [year, monthNumber] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  }
  if (!validTaskDateKey(selectedDate)) throw new TaskInputError("Некорректная дата.");
  return mode === "week" ? taskWeekGrid(selectedDate) : [selectedDate];
}

export function taskMonthUtcBounds(month: string): { start: Date; end: Date } {
  if (!validTaskMonthKey(month)) throw new TaskInputError("Некорректный месяц.");
  const parts = month.split("-").map(Number);
  const first = String(parts[0]) + "-" + String(parts[1]).padStart(2, "0") + "-01";
  const next = new Date(Date.UTC(parts[0], parts[1], 1));
  const nextFirst = String(next.getUTCFullYear()) + "-" + String(next.getUTCMonth() + 1).padStart(2, "0") + "-01";
  return {
    start: getMoscowDayBounds(new Date(first + "T12:00:00.000Z")).start,
    end: getMoscowDayBounds(new Date(nextFirst + "T12:00:00.000Z")).start,
  };
}

export function parseMoscowDateTime(dateValue: unknown, timeValue?: unknown): { value: Date; hasTime: boolean } {
  if (!validTaskDateKey(dateValue)) throw new TaskInputError("Укажите корректную дату.");
  const hasTime = typeof timeValue === "string" && timeValue.length > 0;
  if (hasTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue as string)) throw new TaskInputError("Укажите корректное время.");
  const localTime = hasTime ? timeValue as string : "00:00";
  const dateParts = dateValue.split("-").map(Number);
  const timeParts = localTime.split(":").map(Number);
  const wallClockUtc = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1]);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(wallClockUtc));
  const value = (key: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === key)?.value);
  const representedAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return { value: new Date(wallClockUtc - (representedAsUtc - wallClockUtc)), hasTime };
}

export function parseTaskEventTimes(dateValue: unknown, startTimeValue: unknown, endTimeValue: unknown, allDayValue: unknown): { startsAt: Date; endsAt: Date | null; allDay: boolean } {
  const allDay = allDayValue === true || allDayValue === "true" || allDayValue === "on";
  if (allDay) {
    return { startsAt: parseMoscowDateTime(dateValue).value, endsAt: null, allDay: true };
  }
  if (typeof startTimeValue !== "string" || !startTimeValue || typeof endTimeValue !== "string" || !endTimeValue) {
    throw new TaskInputError("Укажите время начала и окончания или выберите «Весь день».");
  }
  const startsAt = parseMoscowDateTime(dateValue, startTimeValue).value;
  const endsAt = parseMoscowDateTime(dateValue, endTimeValue).value;
  if (endsAt <= startsAt) throw new TaskInputError("Время окончания должно быть позже времени начала в тот же день.");
  return { startsAt, endsAt, allDay: false };
}

export function toMoscowDateTimeLocal(value: Date): string {
  return moscowDateKey(value) + "T" + moscowTime(value);
}

export function filterTaskEvents(
  events: readonly TaskCalendarEvent[],
  filters: { status: TaskStatusFilter; priority: TaskPriorityFilter; deadline: TaskDeadlineFilter; categories?: readonly TaskCategoryValue[]; now: Date },
): TaskCalendarEvent[] {
  return events.filter((event) => {
    if (filters.categories && !filters.categories.includes(event.category)) return false;
    if (event.sourceType !== "PERSONAL_TASK") return true;
    if (filters.status !== "ALL" && event.state !== filters.status) return false;
    if (filters.priority !== "ALL" && event.priority !== filters.priority) return false;
    if (filters.deadline === "OVERDUE" && (event.state !== "OPEN" || event.startsAt >= filters.now)) return false;
    if (filters.deadline === "UPCOMING" && event.startsAt < filters.now) return false;
    return true;
  });
}

export type TimedEventPosition = { event: TaskCalendarEvent; topPx: number; heightPx: number; leftPercent: number; widthPercent: number };

function localMinutes(value: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Layout overlapping events into side-by-side lanes for the Outlook-like time grid. */
export function layoutTimedEvents(events: readonly TaskCalendarEvent[], startHour = 7, endHour = 24, pixelsPerHour = 56): TimedEventPosition[] {
  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const timed = events.filter((event) => !event.allDay && localMinutes(event.startsAt) < rangeEnd && (event.endsAt ? localMinutes(event.endsAt) : localMinutes(event.startsAt) + 1) > rangeStart)
    .map((event) => {
      const start = localMinutes(event.startsAt);
      const actualEnd = event.endsAt ? localMinutes(event.endsAt) : start + 1;
      return { event, start: Math.max(rangeStart, start), end: Math.min(rangeEnd, Math.max(start + 1, actualEnd)) };
    }).sort((a, b) => a.start - b.start || b.end - a.end || a.event.id.localeCompare(b.event.id));
  const result: TimedEventPosition[] = [];
  let cluster: typeof timed = [];
  let clusterEnd = -1;
  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const placed = cluster.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      return { ...item, lane };
    });
    const laneCount = laneEnds.length;
    for (const item of placed) result.push({
      event: item.event,
      topPx: ((item.start - rangeStart) / 60) * pixelsPerHour,
      heightPx: Math.max(18, ((item.end - item.start) / 60) * pixelsPerHour),
      leftPercent: (item.lane / laneCount) * 100,
      widthPercent: 100 / laneCount,
    });
    cluster = [];
    clusterEnd = -1;
  };
  for (const item of timed) {
    if (cluster.length && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

export function groupTaskEventsByDate(events: readonly TaskCalendarEvent[]): Array<{ date: string; events: TaskCalendarEvent[] }> {
  const groups = new Map<string, TaskCalendarEvent[]>();
  for (const event of [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))) {
    const date = moscowDateKey(event.startsAt);
    const group = groups.get(date) ?? [];
    group.push(event);
    groups.set(date, group);
  }
  return [...groups].map(([date, items]) => ({ date, events: items }));
}

export function buildTaskCalendarIcs(events: readonly TaskCalendarEvent[], exportedAt = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Digital Campus//Task Calendar//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", "UID:" + escapeIcs(event.id) + "@digital-campus.local", "DTSTAMP:" + toIcsUtc(exportedAt));
    if (event.allDay) {
      const date = moscowDateKey(event.startsAt);
      const next = new Date(date + "T12:00:00.000Z");
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push("DTSTART;VALUE=DATE:" + date.replaceAll("-", ""), "DTEND;VALUE=DATE:" + moscowDateKey(next).replaceAll("-", ""));
    } else {
      lines.push("DTSTART:" + toIcsUtc(event.startsAt));
      if (event.endsAt && event.endsAt > event.startsAt) lines.push("DTEND:" + toIcsUtc(event.endsAt));
    }
    lines.push("SUMMARY:" + escapeIcs(event.title));
    if (event.description) lines.push("DESCRIPTION:" + escapeIcs(event.description));
    lines.push("CATEGORIES:" + escapeIcs(event.category));
    if (event.href) lines.push("URL:" + escapeIcs(event.href));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function toIcsUtc(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 75) {
      parts.push(current);
      current = " " + character;
      bytes = 1 + length;
    } else {
      current += character;
      bytes += length;
    }
  }
  parts.push(current);
  return parts.join("\r\n");
}
