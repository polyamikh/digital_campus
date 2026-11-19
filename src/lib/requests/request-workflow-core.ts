import { ServiceRequestCategory, ServiceRequestState } from "@/generated/prisma/enums";

export const MAX_CLARIFICATION_CHARS = 8_000;
export const MAX_RESOLUTION_CHARS = 8_000;

export class RequestWorkflowInputError extends Error {}
export class RequestWorkflowConflictError extends Error {}

export function parseRequestText(value: unknown, label: string, maximum = MAX_CLARIFICATION_CHARS): string {
  if (typeof value !== "string" || !value.trim()) throw new RequestWorkflowInputError(`${label}: заполните поле.`);
  const result = value.trim();
  if (result.length > maximum) throw new RequestWorkflowInputError(`${label}: максимум ${maximum} символов.`);
  return result;
}

export function isCertificateRequest(category: ServiceRequestCategory): boolean {
  return category === ServiceRequestCategory.STUDY_CERTIFICATE
    || category === ServiceRequestCategory.STUDY_PERIOD_CERTIFICATE
    || category === ServiceRequestCategory.GRADE_TRANSCRIPT;
}

export function isRequestTerminal(state: ServiceRequestState): boolean {
  return state === ServiceRequestState.COMPLETED
    || state === ServiceRequestState.REJECTED
    || state === ServiceRequestState.CANCELLED;
}

export function notificationEventKey(requestId: string, event: string): string {
  return `service-request:${requestId}:${event}`;
}

export function requestDocumentAllowedForRole(
  role: string,
  recipientUserId: string,
  requestStudentId: string,
  revokedAt: Date | null,
): boolean {
  if (revokedAt) return false;
  if (role === "DEAN") return true;
  return role === "STUDENT" && recipientUserId === requestStudentId;
}
