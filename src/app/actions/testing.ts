"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session-core";
import { createTeacherTest, publishTeacherTest, publishTeacherTestResult, recordTeacherTestResult, removeTeacherTest, TestingConflictError, TestingInputError, updateTeacherTest } from "@/lib/testing/testing-service";

async function sameOrigin(): Promise<boolean> {
  const requestHeaders = await headers();
  return isSameOriginRequest(requestHeaders.get("origin"), requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"), requestHeaders.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}

function errorMessage(error: unknown): string {
  if (error instanceof TestingInputError || error instanceof TestingConflictError) return error.message;
  if (error instanceof UnauthenticatedError) return "Сессия завершена. Войдите снова.";
  if (error instanceof ForbiddenRoleError) return "Действие доступно только преподавателю.";
  return "Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз.";
}

export async function createTeacherTestAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    await createTeacherTest({ assignmentId: formData.get("assignmentId"), componentId: formData.get("componentId"), title: formData.get("title"), externalUrl: formData.get("externalUrl"), opensAt: formData.get("opensAt"), closesAt: formData.get("closesAt"), attemptLimit: formData.get("attemptLimit") });
    revalidatePath("/teacher/testing");
    return { ok: true, error: null };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function publishTeacherTestAction(testId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    await publishTeacherTest(testId);
    revalidatePath("/teacher/testing"); revalidatePath("/testing"); revalidatePath("/tasks");
    return { ok: true, error: null };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function updateTeacherTestAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    await updateTeacherTest({ testId: formData.get("testId"), expectedVersion: Number(formData.get("version")), title: formData.get("title"), externalUrl: formData.get("externalUrl"), opensAt: formData.get("opensAt"), closesAt: formData.get("closesAt"), attemptLimit: formData.get("attemptLimit") });
    revalidatePath("/teacher/testing"); revalidatePath("/testing"); revalidatePath("/tasks"); revalidatePath("/grades");
    return { ok: true, error: null };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function removeTeacherTestAction(testId: string, version: number) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён.", disposition: null };
  try {
    const disposition = await removeTeacherTest(testId, version);
    revalidatePath("/teacher/testing"); revalidatePath("/testing"); revalidatePath("/tasks"); revalidatePath("/grades"); revalidatePath("/notifications");
    return { ok: true, error: null, disposition };
  } catch (error) { return { ok: false, error: errorMessage(error), disposition: null }; }
}

export async function recordTeacherTestResultAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    await recordTeacherTestResult({ testId: formData.get("testId"), studentId: formData.get("studentId"), score: formData.get("score") });
    revalidatePath("/teacher/testing");
    return { ok: true, error: null };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function publishTeacherTestResultAction(attemptId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    await publishTeacherTestResult(attemptId);
    revalidatePath("/teacher/testing"); revalidatePath("/testing"); revalidatePath("/grades"); revalidatePath("/notifications");
    return { ok: true, error: null };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}
