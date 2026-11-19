"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session-core";
import { deleteCurrentStudentPersonalTask, saveCurrentStudentPersonalTask, setCurrentStudentPersonalTaskState, TaskConflictError } from "@/lib/tasks/student-tasks";
import { TaskInputError } from "@/lib/tasks/tasks-core";
import type { TaskActionState } from "@/lib/tasks/task-action-state";

async function isSameOriginAction(): Promise<boolean> {
  const requestHeaders = await headers();
  return isSameOriginRequest(
    requestHeaders.get("origin"),
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
    process.env.NODE_ENV === "production",
  );
}

function stringField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

export async function savePersonalTaskAction(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  if (!(await isSameOriginAction())) return { error: "Запрос отклонён. Обновите страницу и попробуйте ещё раз.", successId: null };
  const rawId = stringField(formData, "taskId");
  const rawVersion = stringField(formData, "version");
  try {
    const task = await saveCurrentStudentPersonalTask({
      taskId: rawId || null,
      expectedVersion: rawVersion ? Number(rawVersion) : null,
      titleValue: formData.get("title"),
      detailsValue: formData.get("details"),
      dateValue: formData.get("dueDate"),
      startTimeValue: formData.get("startTime"),
      endTimeValue: formData.get("endTime"),
      allDayValue: formData.get("allDay"),
      categoryValue: formData.get("category"),
      priorityValue: formData.get("priority"),
      reminderValue: formData.get("remindAt"),
    });
    revalidatePath("/tasks");
    return { error: null, successId: task.id };
  } catch (error) {
    if (error instanceof TaskInputError || error instanceof TaskConflictError) return { error: error.message, successId: null };
    if (error instanceof UnauthenticatedError) return { error: "Сессия завершена. Войдите снова.", successId: null };
    if (error instanceof ForbiddenRoleError) return { error: "Личные задачи доступны только студенту.", successId: null };
    return { error: "Не удалось сохранить задачу. Попробуйте позже.", successId: null };
  }
}

export async function setPersonalTaskCompletionAction(formData: FormData): Promise<{ ok: boolean; error: string | null }> {
  if (!(await isSameOriginAction())) return { ok: false, error: "Запрос отклонён." };
  const taskId = stringField(formData, "taskId");
  const version = Number(stringField(formData, "version"));
  const completedValue = stringField(formData, "completed");
  if (!taskId || !Number.isInteger(version) || !["true", "false"].includes(completedValue ?? "")) {
    return { ok: false, error: "Некорректные данные задачи." };
  }
  try {
    await setCurrentStudentPersonalTaskState(taskId, version, completedValue === "true");
    revalidatePath("/tasks");
    revalidatePath("/");
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof TaskInputError || error instanceof TaskConflictError) return { ok: false, error: error.message };
    return { ok: false, error: "Не удалось изменить статус задачи." };
  }
}

export async function deletePersonalTaskAction(formData: FormData): Promise<{ ok: boolean; error: string | null }> {
  if (!(await isSameOriginAction())) return { ok: false, error: "Запрос отклонён." };
  const taskId = stringField(formData, "taskId");
  const version = Number(stringField(formData, "version"));
  if (!taskId || !Number.isInteger(version)) return { ok: false, error: "Некорректные данные задачи." };
  try {
    await deleteCurrentStudentPersonalTask(taskId, version);
    revalidatePath("/tasks");
    revalidatePath("/");
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof TaskInputError || error instanceof TaskConflictError) return { ok: false, error: error.message };
    return { ok: false, error: "Не удалось удалить задачу." };
  }
}
