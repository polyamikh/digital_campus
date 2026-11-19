import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { NotificationCategory, NotificationChannel, Role, ServiceRequestState } from "@/generated/prisma/enums";
import { ForbiddenRoleError, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { moscowDateKey } from "@/lib/schedule/moscow-time";
import { REQUEST_STATE_LABELS } from "./requests-view-core";
import {
  calculateResumedServiceRequestDeadline,
  canTransitionServiceRequest,
  type OfficialCalendarYear,
} from "./service-request-core";
import {
  isCertificateRequest,
  requestDocumentAllowedForRole,
  MAX_RESOLUTION_CHARS,
  notificationEventKey,
  parseRequestText,
  RequestWorkflowConflictError,
  RequestWorkflowInputError,
} from "./request-workflow-core";

export { RequestWorkflowConflictError, RequestWorkflowInputError };

const fullRequestSelect = {
  id: true,
  studentId: true,
  assignedToId: true,
  category: true,
  state: true,
  title: true,
  body: true,
  submittedAt: true,
  deadlineAt: true,
  completedAt: true,
  rejectionReason: true,
  version: true,
  student: {
    select: {
      login: true,
      profile: { select: { displayName: true } },
      memberships: { select: { startsAt: true, endsAt: true, group: { select: { code: true } } } },
    },
  },
  assignedTo: { select: { login: true, profile: { select: { displayName: true } } } },
  history: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      fromState: true,
      toState: true,
      reason: true,
      createdAt: true,
      actor: { select: { profile: { select: { displayName: true } }, login: true } },
    },
  },
  clarifications: {
    orderBy: [{ requestedAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      question: true,
      answer: true,
      requestedAt: true,
      answeredAt: true,
      requestedBy: { select: { profile: { select: { displayName: true } }, login: true } },
    },
  },
  documents: {
    where: { revokedAt: null },
    orderBy: [{ issuedAt: "desc" as const }, { id: "desc" as const }],
    select: { id: true, fileName: true, mimeType: true, byteSize: true, issuedAt: true, revokedAt: true },
  },
} satisfies Prisma.ServiceRequestSelect;

export type FullServiceRequestRecord = Prisma.ServiceRequestGetPayload<{ select: typeof fullRequestSelect }>;
export type RequestNotificationRecord = {
  deliveryId: string;
  notificationId: string;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  sourceId: string;
};

type CalendarRow = Omit<OfficialCalendarYear, "days"> & { days: Array<{ date: Date; kind: OfficialCalendarYear["days"][number]["kind"] }> };

function asOfficialCalendar(rows: CalendarRow[]): OfficialCalendarYear[] {
  return rows.map((row) => ({
    ...row,
    days: row.days.map((day) => ({ date: day.date.toISOString().slice(0, 10), kind: day.kind })),
  }));
}

async function calendarsForSla(tx: Prisma.TransactionClient): Promise<OfficialCalendarYear[]> {
  const rows = await tx.productionCalendarYear.findMany({
    select: { id: true, year: true, sourceName: true, sourceUrl: true, verifiedAt: true, days: { select: { date: true, kind: true } } },
    orderBy: { year: "asc" },
  });
  return asOfficialCalendar(rows);
}

async function notifyRecipients(
  tx: Prisma.TransactionClient,
  eventKey: string,
  requestId: string,
  title: string,
  body: string,
  recipientIds: readonly string[],
): Promise<void> {
  if (!recipientIds.length) return;
  const notification = await tx.notification.upsert({
    where: { eventKey },
    create: {
      eventKey,
      category: NotificationCategory.REQUEST,
      sourceType: "SERVICE_REQUEST",
      sourceId: requestId,
      title,
      body,
    },
    update: {},
    select: { id: true },
  });
  const preferences = await tx.notificationPreference.findMany({
    where: { userId: { in: [...recipientIds] }, category: NotificationCategory.REQUEST, muted: true },
    select: { userId: true },
  });
  const mutedRecipients = new Set(preferences.map(({ userId }) => userId));
  const mutedAt = new Date();
  await tx.notificationDelivery.createMany({
    data: recipientIds.map((recipientId) => ({ notificationId: notification.id, recipientId, channel: NotificationChannel.IN_APP, mutedAt: mutedRecipients.has(recipientId) ? mutedAt : null })),
    skipDuplicates: true,
  });
}

async function notifyStudent(tx: Prisma.TransactionClient, requestId: string, studentId: string, event: string, title: string, body: string) {
  await notifyRecipients(tx, notificationEventKey(requestId, event), requestId, title, body, [studentId]);
}

async function activeDeanIds(tx: Prisma.TransactionClient): Promise<string[]> {
  const roles = await tx.userRole.findMany({
    where: { role: Role.DEAN, revokedAt: null, user: { isActive: true } },
    select: { userId: true },
  });
  return [...new Set(roles.map(({ userId }) => userId))];
}

function ensureVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new RequestWorkflowConflictError("Заявка уже изменилась. Обновите страницу и повторите действие.");
}

async function updateByVersion(
  tx: Prisma.TransactionClient,
  requestId: string,
  version: number,
  state: ServiceRequestState,
  data: Prisma.ServiceRequestUncheckedUpdateManyInput,
): Promise<void> {
  const result = await tx.serviceRequest.updateMany({ where: { id: requestId, version, state }, data });
  if (result.count !== 1) throw new RequestWorkflowConflictError("Заявка уже изменилась. Обновите страницу и повторите действие.");
}

async function history(
  tx: Prisma.TransactionClient,
  requestId: string,
  actorId: string,
  fromState: ServiceRequestState,
  toState: ServiceRequestState,
  reason: string | null,
  createdAt: Date,
) {
  await tx.requestStatusHistory.create({ data: { requestId, actorId, fromState, toState, reason, createdAt } });
}

export async function listDeanRequestWorkspace() {
  const dean = await requireRole(Role.DEAN);
  const [requests, assignments, notifications] = await Promise.all([
    prisma.serviceRequest.findMany({ select: fullRequestSelect, orderBy: [{ submittedAt: "asc" }, { id: "asc" }] }),
    prisma.userRole.findMany({
      where: { role: Role.DEAN, revokedAt: null, user: { isActive: true } },
      select: { userId: true, user: { select: { login: true, profile: { select: { displayName: true } } } } },
      orderBy: { user: { login: "asc" } },
    }),
    listRequestNotificationsForUser(dean.id),
  ]);
  return { requests, assignments, notifications };
}

export async function getDeanRequest(requestId: string) {
  await requireRole(Role.DEAN);
  return prisma.serviceRequest.findUnique({ where: { id: requestId }, select: fullRequestSelect });
}

export async function getMyRequestWorkspace(studentId: string) {
  const student = await requireRole(Role.STUDENT);
  if (student.id !== studentId) throw new ForbiddenRoleError();
  const [requests, notifications] = await Promise.all([
    prisma.serviceRequest.findMany({ where: { studentId }, select: fullRequestSelect, orderBy: [{ submittedAt: "desc" }, { id: "desc" }] }),
    listRequestNotificationsForUser(studentId),
  ]);
  return { requests, notifications };
}

export async function listRequestNotificationsForUser(userId: string): Promise<RequestNotificationRecord[]> {
  return prisma.notificationDelivery.findMany({
    where: { recipientId: userId, notification: { category: NotificationCategory.REQUEST } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      id: true,
      createdAt: true,
      readAt: true,
      notification: { select: { id: true, title: true, body: true, sourceId: true } },
    },
  }).then((rows) => rows.map((row) => ({
    deliveryId: row.id,
    notificationId: row.notification.id,
    title: row.notification.title,
    body: row.notification.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
    sourceId: row.notification.sourceId,
  })));
}

export async function markRequestNotificationRead(deliveryId: string) {
  const user = await requireRole(Role.STUDENT, Role.DEAN);
  return prisma.notificationDelivery.updateMany({
    where: { id: deliveryId, recipientId: user.id, readAt: null, notification: { category: NotificationCategory.REQUEST } },
    data: { readAt: new Date() },
  });
}

export async function assignServiceRequest(requestId: string, expectedVersion: number, assignedToId: string | null) {
  const dean = await requireRole(Role.DEAN);
  return prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true, title: true, state: true, version: true, studentId: true, assignedToId: true } });
    if (!request) throw new RequestWorkflowConflictError("Заявка не найдена.");
    ensureVersion(request.version, expectedVersion);
    if (request.assignedToId === assignedToId) return;
    if (assignedToId) {
      const activeDean = await tx.userRole.findFirst({ where: { userId: assignedToId, role: Role.DEAN, revokedAt: null, user: { isActive: true } }, select: { id: true } });
      if (!activeDean) throw new RequestWorkflowInputError("Выберите сотрудника деканата с действующей ролью.");
    }
    await updateByVersion(tx, requestId, request.version, request.state, { assignedToId, version: request.version + 1 });
    const assignmentLabel = assignedToId ? "Ответственный сотрудник назначен." : "Ответственный сотрудник снят.";
    await history(tx, requestId, dean.id, request.state, request.state, assignmentLabel, new Date());
    if (assignedToId) {
      await notifyRecipients(tx, notificationEventKey(requestId, `assigned-v${request.version + 1}`), requestId, "Вам назначена заявка", `«${request.title}»`, [assignedToId]);
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function changeServiceRequestState(
  requestId: string,
  expectedVersion: number,
  nextState: ServiceRequestState,
  reasonInput: unknown,
) {
  const dean = await requireRole(Role.DEAN);
  const reason = nextState === ServiceRequestState.REJECTED
    ? parseRequestText(reasonInput, "Причина отклонения", MAX_RESOLUTION_CHARS)
    : nextState === ServiceRequestState.COMPLETED
      ? parseRequestText(reasonInput, "Результат рассмотрения", MAX_RESOLUTION_CHARS)
      : typeof reasonInput === "string" && reasonInput.trim() ? reasonInput.trim().slice(0, MAX_RESOLUTION_CHARS) : null;

  return prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true, state: true, version: true, studentId: true, category: true } });
    if (!request) throw new RequestWorkflowConflictError("Заявка не найдена.");
    ensureVersion(request.version, expectedVersion);
    if (!canTransitionServiceRequest(request.state, nextState)) throw new RequestWorkflowConflictError("Этот переход статуса сейчас недоступен.");
    if (nextState === ServiceRequestState.READY_FOR_ISSUE && !isCertificateRequest(request.category)) {
      throw new RequestWorkflowInputError("Статус «Готова к выдаче» используется для заявок на документы.");
    }
    const now = new Date();
    const nextVersion = request.version + 1;
    await updateByVersion(tx, requestId, request.version, request.state, {
      state: nextState,
      version: nextVersion,
      ...(nextState === ServiceRequestState.REJECTED ? { rejectionReason: reason, completedAt: null } : {}),
      ...(nextState === ServiceRequestState.COMPLETED ? { completedAt: now, rejectionReason: null } : {}),
    });
    await history(tx, requestId, dean.id, request.state, nextState, reason, now);
    await notifyStudent(tx, requestId, request.studentId, `state-v${nextVersion}`, `Статус заявки: ${REQUEST_STATE_LABELS[nextState]}`, reason ?? "Статус заявки обновлён.");
    return { version: nextVersion };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function requestServiceClarification(requestId: string, expectedVersion: number, questionInput: unknown) {
  const dean = await requireRole(Role.DEAN);
  const question = parseRequestText(questionInput, "Вопрос студенту");
  return prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true, state: true, version: true, studentId: true } });
    if (!request) throw new RequestWorkflowConflictError("Заявка не найдена.");
    ensureVersion(request.version, expectedVersion);
    const clarificationStates: readonly ServiceRequestState[] = [ServiceRequestState.SUBMITTED, ServiceRequestState.IN_REVIEW];
    if (!clarificationStates.includes(request.state)) throw new RequestWorkflowConflictError("Сейчас нельзя запросить уточнение по этой заявке.");
    const open = await tx.requestClarification.findFirst({ where: { requestId, answeredAt: null }, select: { id: true } });
    if (open) throw new RequestWorkflowConflictError("По заявке уже ожидается ответ студента.");
    const now = new Date();
    const nextVersion = request.version + 1;
    await updateByVersion(tx, requestId, request.version, request.state, { state: ServiceRequestState.CLARIFICATION_REQUESTED, version: nextVersion });
    await tx.requestClarification.create({ data: { requestId, requestedById: dean.id, question, requestedAt: now } });
    await history(tx, requestId, dean.id, request.state, ServiceRequestState.CLARIFICATION_REQUESTED, "Деканат запросил уточнение.", now);
    await notifyStudent(tx, requestId, request.studentId, `clarification-v${nextVersion}`, "Нужно уточнение по заявке", question);
    return { version: nextVersion };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function answerServiceClarification(requestId: string, clarificationId: string, answerInput: unknown) {
  const student = await requireRole(Role.STUDENT);
  const answer = parseRequestText(answerInput, "Ответ на уточнение");
  return prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findFirst({
      where: { id: requestId, studentId: student.id },
      select: { id: true, state: true, version: true, studentId: true, submittedAt: true, category: true, deadlineAt: true, assignedToId: true },
    });
    if (!request) throw new RequestWorkflowConflictError("Заявка не найдена или недоступна.");
    if (request.state !== ServiceRequestState.CLARIFICATION_REQUESTED) throw new RequestWorkflowConflictError("По заявке сейчас не ожидается ответ.");
    const clarification = await tx.requestClarification.findFirst({
      where: { id: clarificationId, requestId, answeredAt: null },
      select: { id: true, requestedAt: true },
    });
    if (!clarification) throw new RequestWorkflowConflictError("Запрос уточнения уже закрыт или недоступен.");
    const now = new Date();
    const calendars = await calendarsForSla(tx);
    const previousClarifications = await tx.requestClarification.findMany({
      where: { requestId, answeredAt: { not: null }, requestedAt: { lt: clarification.requestedAt } },
      select: { requestedAt: true, answeredAt: true },
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    });
    const previousPauses = previousClarifications.flatMap((entry) => entry.answeredAt ? [{ requestedAt: entry.requestedAt, answeredAt: entry.answeredAt }] : []);
    const deadlineAt = calculateResumedServiceRequestDeadline(request.submittedAt, clarification.requestedAt, now, request.category, request.deadlineAt, calendars, previousPauses);
    if (deadlineAt) {
      const startYear = Number(moscowDateKey(request.submittedAt).slice(0, 4));
      const endYear = Number(moscowDateKey(deadlineAt).slice(0, 4));
      await tx.serviceRequestCalendar.createMany({
        data: calendars.filter((calendar) => calendar.year >= startYear && calendar.year <= endYear).map((calendar) => ({ requestId, calendarId: calendar.id })),
        skipDuplicates: true,
      });
    }
    const nextVersion = request.version + 1;
    const changed = await tx.serviceRequest.updateMany({
      where: { id: requestId, studentId: student.id, version: request.version, state: ServiceRequestState.CLARIFICATION_REQUESTED },
      data: { state: ServiceRequestState.IN_REVIEW, version: nextVersion, deadlineAt },
    });
    if (changed.count !== 1) throw new RequestWorkflowConflictError("Заявка уже изменилась. Обновите страницу и повторите действие.");
    const answered = await tx.requestClarification.updateMany({ where: { id: clarificationId, requestId, answeredAt: null }, data: { answer, answeredAt: now } });
    if (answered.count !== 1) throw new RequestWorkflowConflictError("Ответ уже принят. Обновите страницу заявки.");
    await history(tx, requestId, student.id, ServiceRequestState.CLARIFICATION_REQUESTED, ServiceRequestState.IN_REVIEW, "Студент ответил на запрос уточнения.", now);
    const recipients = request.assignedToId ? [request.assignedToId] : await activeDeanIds(tx);
    await notifyRecipients(tx, notificationEventKey(requestId, `clarification-${clarificationId}-answered`), requestId, "Студент ответил на уточнение", `Получен ответ по заявке «${requestId}».`, recipients);
    return { version: nextVersion, deadlineAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 30_000 });
}

export async function completeServiceRequestWithDocument(requestId: string, objectKey: string, fileName: string, byteSize: number) {
  const dean = await requireRole(Role.DEAN);
  return prisma.$transaction(async (tx) => {
    const request = await tx.serviceRequest.findUnique({ where: { id: requestId }, select: { id: true, state: true, version: true, studentId: true, category: true } });
    if (!request) throw new RequestWorkflowConflictError("Заявка не найдена.");
    if (isCertificateRequest(request.category)) {
      const now = new Date();
      const documentStates: readonly ServiceRequestState[] = [ServiceRequestState.IN_REVIEW, ServiceRequestState.READY_FOR_ISSUE];
      if (!documentStates.includes(request.state)) throw new RequestWorkflowConflictError("Сначала возьмите заявку в обработку.");
      const nextVersion = request.version + 1;
      await updateByVersion(tx, requestId, request.version, request.state, { state: ServiceRequestState.COMPLETED, completedAt: now, rejectionReason: null, version: nextVersion });
      await tx.documentArtifact.create({ data: { requestId, objectKey, fileName, mimeType: "application/pdf", byteSize: BigInt(byteSize), issuedAt: now } });
      await history(tx, requestId, dean.id, request.state, ServiceRequestState.COMPLETED, "Готовый документ приложен к заявке.", now);
      await notifyStudent(tx, requestId, request.studentId, `document-v${nextVersion}`, "Документ по заявке готов", "Откройте заявку, чтобы скачать документ.");
      return;
    }
    throw new RequestWorkflowInputError("К этой категории нельзя прикрепить справку.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function requestDocumentForCurrentUser(documentId: string) {
  const user = await requireRole(Role.STUDENT, Role.DEAN);
  const document = await prisma.documentArtifact.findUnique({
    where: { id: documentId },
    select: { id: true, objectKey: true, fileName: true, mimeType: true, byteSize: true, revokedAt: true, request: { select: { studentId: true } } },
  });
  if (!document || !requestDocumentAllowedForRole(user.activeRole, user.id, document.request.studentId, document.revokedAt)) return null;
  return document;
}

export async function listVisibleNotifications() {
  const user = await requireRole(Role.STUDENT, Role.DEAN);
  return listRequestNotificationsForUser(user.id);
}
