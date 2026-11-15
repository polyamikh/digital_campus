export const MOSCOW_TIME_ZONE = "Europe/Moscow";

type MoscowDateParts = { year: number; month: number; day: number };

function datePartsInMoscow(date: Date): MoscowDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}
export function moscowDateKey(date: Date): string {
  const { year, month, day } = datePartsInMoscow(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function moscowDateAtMidnightUtc(date: MoscowDateParts): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const localParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(localParts.find((part) => part.type === type)?.value);
  const representedAsUtc = Date.UTC(
    value("year"), value("month") - 1, value("day"),
    value("hour"), value("minute"), value("second"),
  );
  const offset = representedAsUtc - guess;
  return new Date(Date.UTC(date.year, date.month - 1, date.day) - offset);
}

function shiftCalendarDate(date: MoscowDateParts, days: number): MoscowDateParts {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function getMoscowDayBounds(date: Date): { start: Date; end: Date } {
  const localDate = datePartsInMoscow(date);
  return {
    start: moscowDateAtMidnightUtc(localDate),
    end: moscowDateAtMidnightUtc(shiftCalendarDate(localDate, 1)),
  };
}

export function getMoscowWeekBounds(date: Date): { start: Date; end: Date } {
  const localDate = datePartsInMoscow(date);
  const weekday = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const monday = shiftCalendarDate(localDate, -mondayOffset);
  return {
    start: moscowDateAtMidnightUtc(monday),
    end: moscowDateAtMidnightUtc(shiftCalendarDate(monday, 7)),
  };
}

export function moscowTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}
