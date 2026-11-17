"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session-core";
import { getMyServiceRequest, createMyServiceRequest } from "@/lib/requests/student-service-requests";
import { OfficialCalendarUnavailableError, ServiceRequestInputError } from "@/lib/requests/service-request-core";

export type CreateServiceRequestState = {
  error: string | null;
  successId: string | null;
};

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
        history: request.history.map(({ actor, ...entry }) => ({
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
