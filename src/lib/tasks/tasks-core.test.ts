import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskCalendarIcs, currentMoscowMonth, filterTaskEvents, groupTaskEventsByDate, layoutTimedEvents, parseMoscowDateTime, parseTaskEventTimes, personalTaskOwnerWhere, shiftTaskDate, shiftTaskMonth, taskMonthGrid, taskViewDateKeys, taskWeekGrid, validTaskMonthKey, type TaskCalendarEvent } from "./tasks-core";

test("month navigation and grid handle calendar boundaries", () => {
  assert.equal(shiftTaskMonth("2027-01", -1), "2026-12");
  assert.equal(shiftTaskMonth("2026-12", 1), "2027-01");
  assert.equal(validTaskMonthKey("2026-13"), false);
  const grid = taskMonthGrid("2026-11");
  assert.equal(grid[0], "2026-10-26");
  assert.equal(grid.at(-1), "2026-12-06");
  assert.equal(currentMoscowMonth(new Date("2026-11-30T21:30:00.000Z")), "2026-12");
});

test("month, week, day and list resolve distinct date ranges across year boundaries", () => {
  assert.equal(taskViewDateKeys("month", "2027-01", "2027-01-13").length, 35);
  assert.deepEqual(taskWeekGrid("2027-01-01"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.deepEqual(taskViewDateKeys("day", "2027-01", "2027-01-01"), ["2027-01-01"]);
  assert.equal(taskViewDateKeys("list", "2027-01", "2027-01-01").length, 31);
  assert.equal(shiftTaskDate("2026-12-31", 1), "2027-01-01");
});

test("date and optional time input are interpreted in Moscow timezone", () => {
  const timed = parseMoscowDateTime("2026-11-09", "19:00");
  assert.equal(timed.value.toISOString(), "2026-11-09T16:00:00.000Z");
  assert.equal(timed.hasTime, true);
  const allDay = parseMoscowDateTime("2026-11-09");
  assert.equal(allDay.value.toISOString(), "2026-11-08T21:00:00.000Z");
  assert.equal(allDay.hasTime, false);
  assert.throws(() => parseMoscowDateTime("2026-02-30", "19:00"));
  assert.throws(() => parseMoscowDateTime("2026-11-09", "24:00"));
});

test("event time input supports all-day events and validates a positive same-day duration", () => {
  const allDay = parseTaskEventTimes("2026-11-09", "", "", "true");
  assert.equal(allDay.startsAt.toISOString(), "2026-11-08T21:00:00.000Z");
  assert.equal(allDay.endsAt, null);
  assert.equal(allDay.allDay, true);
  const timed = parseTaskEventTimes("2026-11-09", "19:00", "20:20", false);
  assert.equal(timed.startsAt.toISOString(), "2026-11-09T16:00:00.000Z");
  assert.equal(timed.endsAt?.toISOString(), "2026-11-09T17:20:00.000Z");
  assert.throws(() => parseTaskEventTimes("2026-11-09", "20:00", "19:00", false));
  assert.throws(() => parseTaskEventTimes("2026-11-09", "19:00", "", false));
});

test("filters and groups only personal tasks while retaining read-only academic events", () => {
  const events: TaskCalendarEvent[] = [
    { id: "open", sourceId: "1", sourceType: "PERSONAL_TASK", category: "PERSONAL", title: "Task", description: null, startsAt: new Date("2026-11-09T16:00:00Z"), endsAt: null, allDay: false, priority: "HIGH", state: "OPEN", sourceLabel: "Личная задача", href: null, reminderAt: null },
    { id: "class", sourceId: "2", sourceType: "LESSON", category: "STUDY", title: "Class", description: null, startsAt: new Date("2026-11-09T17:00:00Z"), endsAt: new Date("2026-11-09T18:20:00Z"), allDay: false, priority: null, state: "SCHEDULED", sourceLabel: "Занятие", href: "/schedule", reminderAt: null },
  ];
  assert.equal(filterTaskEvents(events, { status: "COMPLETED", priority: "ALL", deadline: "ALL", now: new Date("2026-11-01T00:00:00Z") }).length, 1);
  assert.equal(groupTaskEventsByDate(events).length, 1);
});

test("deadline filters keep academic events read-only and owner scoping is explicit", () => {
  const events: TaskCalendarEvent[] = [
    { id: "overdue", sourceId: "1", sourceType: "PERSONAL_TASK", category: "PERSONAL", title: "Task", description: null, startsAt: new Date("2026-11-08T16:00:00Z"), endsAt: null, allDay: false, priority: "HIGH", state: "OPEN", sourceLabel: "Личная задача", href: null, reminderAt: null },
    { id: "class", sourceId: "2", sourceType: "LESSON", category: "STUDY", title: "Class", description: null, startsAt: new Date("2026-11-09T16:00:00Z"), endsAt: null, allDay: false, priority: null, state: "SCHEDULED", sourceLabel: "Занятие", href: null, reminderAt: null },
  ];
  const overdue = filterTaskEvents(events, { status: "OPEN", priority: "HIGH", deadline: "OVERDUE", now: new Date("2026-11-09T10:00:00Z") });
  assert.deepEqual(overdue.map(({ id }) => id), ["overdue", "class"]);
  assert.deepEqual(personalTaskOwnerWhere("owner-a", "task-a"), { ownerId: "owner-a", id: "task-a" });
  assert.deepEqual(personalTaskOwnerWhere("owner-a"), { ownerId: "owner-a" });
});

test("category filters allow multiple event classes and hide only unchecked categories", () => {
  const events: TaskCalendarEvent[] = [
    { id: "s", sourceId: "1", sourceType: "LESSON", category: "STUDY", title: "Study", description: null, startsAt: new Date("2026-11-09T16:00:00Z"), endsAt: new Date("2026-11-09T17:20:00Z"), allDay: false, priority: null, state: "SCHEDULED", sourceLabel: "Занятие", href: "/schedule", reminderAt: null },
    { id: "w", sourceId: "2", sourceType: "ASSIGNED_TASK", category: "WORK", title: "Work", description: null, startsAt: new Date("2026-11-09T17:00:00Z"), endsAt: null, allDay: false, priority: null, state: "TO_DO", sourceLabel: "Работа", href: null, reminderAt: null },
    { id: "p", sourceId: "3", sourceType: "PERSONAL_TASK", category: "PERSONAL", title: "Personal", description: null, startsAt: new Date("2026-11-09T18:00:00Z"), endsAt: new Date("2026-11-09T19:00:00Z"), allDay: false, priority: "LOW", state: "OPEN", sourceLabel: "Личное", href: null, reminderAt: null },
  ];
  assert.deepEqual(filterTaskEvents(events, { status: "ALL", priority: "ALL", deadline: "ALL", categories: ["STUDY", "PERSONAL"], now: new Date() }).map(({ id }) => id), ["s", "p"]);
});

test("time grid positions event duration and separates overlapping events into lanes", () => {
  const makeEvent = (id: string, start: string, end: string): TaskCalendarEvent => ({ id, sourceId: id, sourceType: "PERSONAL_TASK", category: "PERSONAL", title: id, description: null, startsAt: new Date(start), endsAt: new Date(end), allDay: false, priority: "MEDIUM", state: "OPEN", sourceLabel: "Личное", href: null, reminderAt: null });
  const positions = layoutTimedEvents([
    makeEvent("a", "2026-11-09T16:00:00Z", "2026-11-09T17:20:00Z"),
    makeEvent("b", "2026-11-09T16:30:00Z", "2026-11-09T17:30:00Z"),
    makeEvent("c", "2026-11-09T17:20:00Z", "2026-11-09T18:00:00Z"),
  ], 0, 24, 48);
  const byId = new Map(positions.map((position) => [position.event.id, position]));
  assert.equal(byId.get("a")?.heightPx, 64);
  assert.equal(byId.get("a")?.widthPercent, 50);
  assert.equal(byId.get("b")?.leftPercent, 50);
  assert.equal(byId.get("c")?.leftPercent, 0);
});

test("ICS export includes Moscow-derived date/time and escaped text", () => {
  const event: TaskCalendarEvent = {
    id: "task-1", sourceId: "task-1", sourceType: "PERSONAL_TASK", category: "PERSONAL", title: "План, этап; 1", description: "Строка 1\nСтрока 2", startsAt: new Date("2026-11-09T16:00:00Z"), endsAt: new Date("2026-11-09T17:30:00Z"), allDay: false, priority: "MEDIUM", state: "OPEN", sourceLabel: "Личная задача", href: null, reminderAt: null,
  };
  const ics = buildTaskCalendarIcs([event], new Date("2026-11-01T00:00:00Z"));
  assert.match(ics, /DTSTART:20261109T160000Z/);
  assert.match(ics, /DTEND:20261109T173000Z/);
  assert.match(ics, /CATEGORIES:PERSONAL/);
  assert.match(ics, /SUMMARY:План\\, этап\\; 1/);
  assert.match(ics, /DESCRIPTION:Строка 1\\nСтрока 2/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
});
