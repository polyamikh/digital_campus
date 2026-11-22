import "server-only";

import { NotificationCategory, Role } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { activeMembershipWhere, studentLessonWhere } from "@/lib/schedule/schedule-query";
import { getMoscowDayBounds, moscowDateKey } from "@/lib/schedule/moscow-time";
import { TaskInputError, parseTaskEventTimes, parseMoscowDateTime, personalTaskOwnerWhere, shiftTaskDate, taskMonthGrid, taskViewDateKeys, validTaskDateKey, validTaskMonthKey, type TaskCalendarEvent, type TaskCalendarMode, type TaskCategoryValue, type TaskPriorityValue } from "./tasks-core";
import { studentTestScope } from "@/lib/testing/testing-core";

export class TaskConflictError extends Error {}

export type PersonalTaskRecord = {
  id: string;
  title: string;
  details: string | null;
  priority: TaskPriorityValue;
  category: TaskCategoryValue;
  state: "OPEN" | "COMPLETED";
  version: number;
  dueAt: Date | null;
  endsAt: Date | null;
  hasDueTime: boolean;
  reminderAt: Date | null;
};

export type TaskCalendarData = {
  month: string;
  today: string;
  groupCode: string | null;
  selectedRangeStart: string;
  selectedRangeEnd: string;
  membershipProblem: "MISSING" | "AMBIGUOUS" | null;
  notificationPreferenceEnabled: boolean;
  events: TaskCalendarEvent[];
  tasksWithoutDate: PersonalTaskRecord[];
};

function scheduleHref(date: string): string {
  return "/schedule?week=" + encodeURIComponent(date) + "&day=" + encodeURIComponent(date);
}

function asPersonalTaskRecord(task: {
  id: string; title: string; details: string | null; priority: TaskPriorityValue; category: TaskCategoryValue; state: "OPEN" | "COMPLETED"; version: number;
  dueAt: Date | null; endsAt: Date | null; hasDueTime: boolean; reminders: Array<{ scheduledAt: Date }>;
}): PersonalTaskRecord {
  return {
    id: task.id, title: task.title, details: task.details, priority: task.priority, category: task.category, state: task.state, version: task.version,
    dueAt: task.dueAt, endsAt: task.endsAt, hasDueTime: task.hasDueTime, reminderAt: task.reminders[0]?.scheduledAt ?? null,
  };
}

export async function getCurrentStudentTaskCalendar(month: string, now = new Date(), mode: TaskCalendarMode = "month", selectedDate?: string): Promise<TaskCalendarData> {
  if (!validTaskMonthKey(month)) throw new TaskInputError("Некорректный месяц.");
  if (mode !== "month" && mode !== "week" && mode !== "day" && mode !== "list") throw new TaskInputError("Некорректный режим календаря.");
  const defaultDay = taskMonthGrid(month).includes(moscowDateKey(now)) ? moscowDateKey(now) : month + "-01";
  const visibleDay = validTaskDateKey(selectedDate) ? selectedDate : defaultDay;
  const visibleDates = taskViewDateKeys(mode, month, visibleDay);
  const student = await requireRole(Role.STUDENT);
  const gridFirst = visibleDates[0] ?? month + "-01";
  const gridLast = visibleDates.at(-1) ?? gridFirst;
  const queryStart = getMoscowDayBounds(new Date(gridFirst + "T12:00:00.000Z")).start;
  const queryEnd = getMoscowDayBounds(new Date(shiftTaskDate(gridLast, 1) + "T12:00:00.000Z")).start;

  const [memberships, preference, personalRows] = await Promise.all([
    prisma.groupMembership.findMany({
      where: activeMembershipWhere(student.id, now),
      select: { groupId: true, group: { select: { code: true } } },
      take: 2,
    }),
    prisma.notificationPreference.findUnique({
      where: { userId_category: { userId: student.id, category: NotificationCategory.TASK } },
      select: { muted: true },
    }),
    prisma.personalTask.findMany({
      where: {
        ...personalTaskOwnerWhere(student.id),
        state: { in: ["OPEN", "COMPLETED"] },
        OR: [{ dueAt: null }, { dueAt: { gte: queryStart, lt: queryEnd } }],
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true, title: true, details: true, priority: true, category: true, state: true, version: true, dueAt: true, endsAt: true, hasDueTime: true,
      },
    }),
  ]);

  const taskIds = personalRows.map(({ id }) => id);
  const pendingReminders = taskIds.length ? await prisma.reminder.findMany({
    where: { personalTaskId: { in: taskIds }, sentAt: null },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    select: { personalTaskId: true, scheduledAt: true },
  }) : [];
  const reminderByTask = new Map<string, Date>();
  for (const reminder of pendingReminders) if (reminder.personalTaskId && !reminderByTask.has(reminder.personalTaskId)) reminderByTask.set(reminder.personalTaskId, reminder.scheduledAt);
  const personalTasks: PersonalTaskRecord[] = personalRows.map((task) => asPersonalTaskRecord({
    ...task,
    state: task.state as "OPEN" | "COMPLETED",
    reminders: reminderByTask.has(task.id) ? [{ scheduledAt: reminderByTask.get(task.id)! }] : [],
  }));

  const events: TaskCalendarEvent[] = personalTasks.flatMap((task) => {
    if (!task.dueAt) return [];
    return [{
      id: "personal:" + task.id,
      sourceId: task.id,
      sourceType: "PERSONAL_TASK" as const,
      category: task.category,
      title: task.title,
      description: task.details,
      startsAt: task.dueAt,
      endsAt: task.endsAt,
      allDay: !task.hasDueTime,
      priority: task.priority,
      state: task.state,
      sourceLabel: "Личная задача",
      href: null,
      reminderAt: task.reminderAt,
      version: task.version,
    }];
  });
  const tasksWithoutDate = personalTasks.filter((task) => task.dueAt === null);

  const assignedRows = await prisma.assignedTask.findMany({
    where: { assigneeId: student.id, state: { not: "CANCELLED" }, dueAt: { gte: queryStart, lt: queryEnd } },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true, details: true, dueAt: true, state: true },
  });
  for (const task of assignedRows) {
    if (!task.dueAt) continue;
    events.push({
      id: "assigned:" + task.id, sourceId: task.id, sourceType: "ASSIGNED_TASK", category: "WORK", title: task.title, description: task.details,
      startsAt: task.dueAt, endsAt: null, allDay: false, priority: null, state: task.state,
      sourceLabel: "Назначенная задача", href: "/tasks?month=" + encodeURIComponent(month) + "&day=" + encodeURIComponent(moscowDateKey(task.dueAt)), reminderAt: null,
    });
  }

  const membershipProblem: TaskCalendarData["membershipProblem"] = memberships.length === 0 ? "MISSING" : memberships.length > 1 ? "AMBIGUOUS" : null;
  if (memberships.length === 1) {
    const groupId = memberships[0]!.groupId;
    const [lessons, homeworks, tests] = await Promise.all([
      prisma.lesson.findMany({
        where: studentLessonWhere(groupId, queryStart, queryEnd),
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          id: true, title: true, startsAt: true, endsAt: true, kind: true, state: true, format: true,
          course: { select: { subject: { select: { name: true } } } },
        },
      }),
      prisma.homework.findMany({
        where: {
          course: { groups: { some: { groupId } } },
          OR: [{ groupId }, { groupId: null }],
          state: "PUBLISHED", publishedAt: { not: null }, deadline: { gte: queryStart, lt: queryEnd },
        },
        orderBy: [{ deadline: "asc" }, { id: "asc" }],
        select: { id: true, title: true, deadline: true, instructions: true },
      }),
      prisma.test.findMany({
        where: {
          ...studentTestScope(groupId),
          closesAt: { gte: queryStart, lt: queryEnd },
        },
        orderBy: [{ closesAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, closesAt: true },
      }),
    ]);
    for (const lesson of lessons) {
      const date = moscowDateKey(lesson.startsAt);
      const exam = lesson.kind === "EXAM";
      events.push({
        id: "lesson:" + lesson.id, sourceId: lesson.id, sourceType: "LESSON", category: "STUDY",
        title: lesson.course.subject.name || lesson.title,
        description: exam ? "Экзамен" : lesson.format || "Занятие",
        startsAt: lesson.startsAt, endsAt: lesson.endsAt, allDay: false, priority: null, state: lesson.state,
        sourceLabel: exam ? "Экзамен" : "Занятие", href: scheduleHref(date), reminderAt: null,
      });
    }
    for (const homework of homeworks) {
      if (!homework.deadline) continue;
      events.push({
        id: "homework:" + homework.id, sourceId: homework.id, sourceType: "HOMEWORK", category: "STUDY", title: homework.title,
        description: "Учебный дедлайн · домашнее задание", startsAt: homework.deadline, endsAt: null, allDay: false,
        priority: null, state: "PUBLISHED", sourceLabel: "Домашнее задание", href: `/homework/${encodeURIComponent(homework.id)}`, reminderAt: null,
      });
    }
    for (const test of tests) {
      if (!test.closesAt) continue;
      events.push({
        id: "test:" + test.id, sourceId: test.id, sourceType: "TEST", category: "STUDY", title: test.title,
        description: "Срок прохождения теста", startsAt: test.closesAt, endsAt: null, allDay: false,
        priority: null, state: "PUBLISHED", sourceLabel: "Тестирование", href: null, reminderAt: null,
      });
    }
  }

  events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
  return {
    month, today: moscowDateKey(now), groupCode: memberships.length === 1 ? memberships[0]!.group.code : null, selectedRangeStart: gridFirst, selectedRangeEnd: gridLast,
    membershipProblem, notificationPreferenceEnabled: preference?.muted !== true, events, tasksWithoutDate,
  };
}

export type SavePersonalTaskInput = {
  taskId: string | null;
  expectedVersion: number | null;
  titleValue: unknown;
  detailsValue: unknown;
  dateValue: unknown;
  startTimeValue: unknown;
  endTimeValue: unknown;
  allDayValue: unknown;
  categoryValue: unknown;
  priorityValue: unknown;
  reminderValue: unknown;
};

function parseUuid(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function saveCurrentStudentPersonalTask(input: SavePersonalTaskInput): Promise<{ id: string }> {
  const student = await requireRole(Role.STUDENT);
  const title = typeof input.titleValue === "string" ? input.titleValue.trim() : "";
  const details = typeof input.detailsValue === "string" ? input.detailsValue.trim() : "";
  if (!title || title.length > 240) throw new TaskInputError("Название обязательно и должно содержать не более 240 символов.");
  if (details.length > 5000) throw new TaskInputError("Описание должно содержать не более 5000 символов.");
  if (!["LOW", "MEDIUM", "HIGH"].includes(String(input.priorityValue))) throw new TaskInputError("Выберите допустимый приоритет.");
  if (!["STUDY", "WORK", "PERSONAL"].includes(String(input.categoryValue))) throw new TaskInputError("Выберите категорию события.");
  const due = parseTaskEventTimes(input.dateValue, input.startTimeValue, input.endTimeValue, input.allDayValue);
  let reminderAt: Date | null = null;
  if (typeof input.reminderValue === "string" && input.reminderValue.length > 0) {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(input.reminderValue);
    if (!match) throw new TaskInputError("Укажите корректное время напоминания.");
    reminderAt = parseMoscowDateTime(match[1], match[2]).value;
    if (reminderAt <= new Date()) throw new TaskInputError("Время напоминания должно быть в будущем.");
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId_category: { userId: student.id, category: NotificationCategory.TASK } },
      select: { muted: true },
    });
    if (preference?.muted) throw new TaskInputError("В настройках отключены уведомления категории «Задачи». Включите их, чтобы сохранить напоминание.");
  }

  if (input.taskId && (!parseUuid(input.taskId) || !Number.isInteger(input.expectedVersion) || (input.expectedVersion ?? 0) < 1)) {
    throw new TaskInputError("Некорректная версия личной задачи.");
  }
  return prisma.$transaction(async (tx) => {
    let taskId: string;
    if (input.taskId) {
      const existing = await tx.personalTask.findFirst({ where: personalTaskOwnerWhere(student.id, input.taskId), select: { id: true, version: true, state: true } });
      if (!existing || existing.state === "CANCELLED") throw new TaskConflictError("Личная задача не найдена.");
      if (existing.version !== input.expectedVersion) throw new TaskConflictError("Задача уже изменилась. Обновите страницу и повторите действие.");
      const result = await tx.personalTask.updateMany({
        where: { ...personalTaskOwnerWhere(student.id, existing.id), version: existing.version },
        data: { title, details: details || null, dueAt: due.startsAt, endsAt: due.endsAt, hasDueTime: !due.allDay, category: input.categoryValue as TaskCategoryValue, priority: input.priorityValue as TaskPriorityValue, updatedAt: new Date(), version: { increment: 1 } },
      });
      if (result.count !== 1) throw new TaskConflictError("Задача уже изменилась. Обновите страницу и повторите действие.");
      taskId = existing.id;
    } else {
      const created = await tx.personalTask.create({
        data: { ownerId: student.id, title, details: details || null, dueAt: due.startsAt, endsAt: due.endsAt, hasDueTime: !due.allDay, category: input.categoryValue as TaskCategoryValue, priority: input.priorityValue as TaskPriorityValue },
        select: { id: true },
      });
      taskId = created.id;
    }

    await tx.reminder.deleteMany({ where: { personalTaskId: taskId, sentAt: null, sourceType: "PERSONAL_TASK" } });
    if (reminderAt) {
      const existingReminder = await tx.reminder.findUnique({
        where: { sourceType_sourceId_scheduledAt: { sourceType: "PERSONAL_TASK", sourceId: taskId, scheduledAt: reminderAt } },
        select: { id: true },
      });
      if (!existingReminder) {
        await tx.reminder.create({
          data: {
            kind: "PERSONAL_TASK", sourceType: "PERSONAL_TASK", sourceId: taskId,
            dueAt: due.startsAt, scheduledAt: reminderAt, personalTaskId: taskId,
          },
        });
      }
    }
    return { id: taskId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function setCurrentStudentPersonalTaskState(taskId: string, expectedVersion: number, completed: boolean): Promise<void> {
  const student = await requireRole(Role.STUDENT);
  if (!parseUuid(taskId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TaskInputError("Некорректная задача.");
  const nextState = completed ? "COMPLETED" : "OPEN";
  await prisma.$transaction(async (tx) => {
    const result = await tx.personalTask.updateMany({
      where: { ...personalTaskOwnerWhere(student.id, taskId), version: expectedVersion, state: { in: ["OPEN", "COMPLETED"] } },
      data: { state: nextState, version: { increment: 1 }, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new TaskConflictError("Задача изменилась или недоступна. Обновите страницу.");
    if (completed) await tx.reminder.deleteMany({ where: { personalTaskId: taskId, sentAt: null, sourceType: "PERSONAL_TASK" } });
  });
}

export async function deleteCurrentStudentPersonalTask(taskId: string, expectedVersion: number): Promise<void> {
  const student = await requireRole(Role.STUDENT);
  if (!parseUuid(taskId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TaskInputError("Некорректная задача.");
  const result = await prisma.personalTask.deleteMany({ where: { ...personalTaskOwnerWhere(student.id, taskId), version: expectedVersion } });
  if (result.count !== 1) throw new TaskConflictError("Задача изменилась или недоступна. Обновите страницу.");
}
