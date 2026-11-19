"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session-core";
import { getMyServiceRequest, createMyServiceRequest } from "@/lib/requests/student-service-requests";
import { answerServiceClarification, assignServiceRequest, changeServiceRequestState, markRequestNotificationRead, requestServiceClarification, RequestWorkflowConflictError, RequestWorkflowInputError } from "@/lib/requests/request-workflow";
import { ServiceRequestState } from "@/generated/prisma/enums";
import { OfficialCalendarUnavailableError, ServiceRequestInputError } from "@/lib/requests/service-request-core";
import type { CreateServiceRequestState, RequestWorkflowActionState } from "@/lib/requests/request-action-state";

const ORIGIN_ERROR = "Запрос отклонён. Обновите страницу и попробуйте ещё раз.";

async function isSameOriginAction(): Promise<boolean> {
  const requestHeaders = await headers();
  return isSameOriginRequest(
    requestHeaders.get("origin"),
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
    process.env.NODE_ENV === "production",
  );
}

export async function createServiceRequestAction(
  _previousState: CreateServiceRequestState,
  formData: FormData,
): Promise<CreateServiceRequestState> {
  if (!(await isSameOriginAction())) return { error: ORIGIN_ERROR, successId: null };
  try {
    const request = await createMyServiceRequest({
      category: formData.get("category"),
      title: formData.get("title"),
      body: formData.get("body"),
    });
    revalidatePath("/requests");
    return { error: null, successId: request.id };
  } catch (error) {
    if (error instanceof ServiceRequestInputError || error instanceof OfficialCalendarUnavailableError) {
      return { error: error.message, successId: null };
    }
    if (error instanceof UnauthenticatedError) return { error: "Сессия завершена. Войдите в кабинет и повторите попытку.", successId: null };
    if (error instanceof ForbiddenRoleError) return { error: "Создавать заявки может только студент.", successId: null };
    return { error: "Не удалось отправить заявку. Попробуйте позже.", successId: null };
  }
}

export async function getServiceRequestDetailsAction(requestId: string) {
  if (!(await isSameOriginAction())) return { error: ORIGIN_ERROR, request: null };
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return { error: null, request: null };
  }
  try {
    const request = await getMyServiceRequest(requestId);
    if (!request) return { error: null, request: null };
    return {
      error: null,
      request: {
        ...request,
        submittedAt: request.submittedAt.toISOString(),
        deadlineAt: request.deadlineAt?.toISOString() ?? null,
        completedAt: request.completedAt?.toISOString() ?? null,
        resolution: [...request.history].reverse().find((entry) => entry.toState === ServiceRequestState.COMPLETED)?.reason ?? null,
        clarifications: request.clarifications.map((entry) => ({
          ...entry,
          requestedAt: entry.requestedAt.toISOString(),
          answeredAt: entry.answeredAt?.toISOString() ?? null,
        })),
        documents: request.documents.map((entry) => ({
          ...entry,
          byteSize: entry.byteSize.toString(),
          issuedAt: entry.issuedAt?.toISOString() ?? null,
        })),
        history: request.history.filter((entry) => entry.fromState !== entry.toState).map(({ actor, ...entry }) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
          actorName: actor.profile?.displayName ?? null,
        })),
      },
    };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return { error: "Сессия завершена. Войдите в кабинет снова.", request: null };
    if (error instanceof ForbiddenRoleError) return { error: "Подробности доступны только студенту.", request: null };
    return { error: "Не удалось загрузить сведения о заявке.", request: null };
  }
}

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestWorkflowAction(
  _previousState: RequestWorkflowActionState,
  formData: FormData,
): Promise<RequestWorkflowActionState> {
  if (!(await isSameOriginAction())) return { error: ORIGIN_ERROR, success: null, requestId: null };
  const requestId = formString(formData, "requestId");
  if (!requestId || !uuidPattern.test(requestId)) return { error: "Заявка не найдена.", success: null, requestId: null };
  const intent = formString(formData, "intent");
  const expectedVersion = formString(formData, "version");
  try {
    if (intent === "assign") {
      const assignedToId = formString(formData, "assignedToId");
      if (assignedToId && !uuidPattern.test(assignedToId)) throw new RequestWorkflowInputError("Некорректный ответственный сотрудник.");
      await assignServiceRequest(requestId, Number(expectedVersion), assignedToId || null);
      revalidatePath("/dean");
      revalidatePath("/dean/requests");
      return { error: null, success: "Ответственный сотрудник обновлён.", requestId };
    }
    if (intent === "clarification") {
      await requestServiceClarification(requestId, Number(expectedVersion), formString(formData, "question"));
      revalidatePath("/dean/requests");
      revalidatePath("/requests");
      return { error: null, success: "Запрос уточнения отправлен студенту.", requestId };
    }
    if (intent === "state") {
      const state = formString(formData, "nextState");
      if (!state || !Object.values(ServiceRequestState).includes(state as ServiceRequestState)) throw new RequestWorkflowInputError("Выберите допустимый статус.");
      await changeServiceRequestState(requestId, Number(expectedVersion), state as ServiceRequestState, formString(formData, "reason"));
      revalidatePath("/dean");
      revalidatePath("/dean/requests");
      revalidatePath("/requests");
      return { error: null, success: "Заявка обновлена.", requestId };
    }
    return { error: "Неизвестное действие.", success: null, requestId: null };
  } catch (error) {
    if (error instanceof RequestWorkflowInputError || error instanceof RequestWorkflowConflictError || error instanceof OfficialCalendarUnavailableError) {
      return { error: error.message, success: null, requestId };
    }
    if (error instanceof UnauthenticatedError) return { error: "Сессия завершена. Войдите снова.", success: null, requestId };
    if (error instanceof ForbiddenRoleError) return { error: "Действие недоступно для вашей роли.", success: null, requestId };
    return { error: "Не удалось выполнить действие. Обновите страницу и попробуйте снова.", success: null, requestId };
  }
}

export async function answerServiceClarificationAction(
  _previousState: RequestWorkflowActionState,
  formData: FormData,
): Promise<RequestWorkflowActionState> {
  if (!(await isSameOriginAction())) return { error: ORIGIN_ERROR, success: null, requestId: null };
  const requestId = formString(formData, "requestId");
  const clarificationId = formString(formData, "clarificationId");
  if (!requestId || !uuidPattern.test(requestId) || !clarificationId || !uuidPattern.test(clarificationId)) {
    return { error: "Запрос уточнения не найден.", success: null, requestId: null };
  }
  try {
    await answerServiceClarification(requestId, clarificationId, formString(formData, "answer"));
    revalidatePath("/requests");
    revalidatePath("/dean/requests");
    return { error: null, success: "Ответ отправлен в деканат.", requestId };
  } catch (error) {
    if (error instanceof RequestWorkflowInputError || error instanceof RequestWorkflowConflictError || error instanceof OfficialCalendarUnavailableError) {
      return { error: error.message, success: null, requestId };
    }
    if (error instanceof UnauthenticatedError) return { error: "Сессия завершена. Войдите снова.", success: null, requestId };
    if (error instanceof ForbiddenRoleError) return { error: "Ответ доступен только студенту — владельцу заявки.", success: null, requestId };
    return { error: "Не удалось отправить ответ. Попробуйте позже.", success: null, requestId };
  }
}

export async function markRequestNotificationReadAction(deliveryId: string) {
  if (!(await isSameOriginAction()) || !uuidPattern.test(deliveryId)) return false;
  try {
    const result = await markRequestNotificationRead(deliveryId);
    revalidatePath("/requests");
    revalidatePath("/dean/requests");
    return result.count === 1;
  } catch {
    return false;
  }
}
