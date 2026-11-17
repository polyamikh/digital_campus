function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function validScheduleDateKey(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? (parseDateKey(value) ? value : null) : null;
}

export function getWeekDateKeys(weekContainingDate: string): string[] {
  const date = parseDateKey(weekContainingDate);
  if (!date) throw new Error("Invalid schedule date");
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return dateKey(day);
  });
}

export function shiftScheduleWeek(dateKeyValue: string, weekOffset: -1 | 1): string {
  const date = parseDateKey(dateKeyValue);
  if (!date) throw new Error("Invalid schedule date");
  date.setUTCDate(date.getUTCDate() + weekOffset * 7);
  return dateKey(date);
}

export function selectedScheduleDay(day: string | string[] | undefined, weekDays: string[], today: string): string {
  const validDay = validScheduleDateKey(day);
  if (validDay && weekDays.includes(validDay)) return validDay;
  return weekDays.includes(today) ? today : weekDays[0] ?? today;
}

export function scheduleDayVisualState(day: string, today: string, selected: string): {
  isToday: boolean;
  isSelected: boolean;
  selectedNonToday: boolean;
} {
  const isToday = day === today;
  const isSelected = day === selected;
  return { isToday, isSelected, selectedNonToday: isSelected && !isToday };
}
