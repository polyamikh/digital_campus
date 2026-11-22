import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { NotificationCategory, NotificationChannel, PassRequestKind, PassRequestState, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getMoscowDayBounds, moscowDateKey } from "@/lib/schedule/moscow-time";
import { passCanTransition } from "./campus-core";

function moscowDay(value: Date) {
  return new Date(`${moscowDateKey(value)}T00:00:00.000Z`);
}

function moscowDayStart(value: Date) {
  return getMoscowDayBounds(value).start;
}

async function notify(tx: Prisma.TransactionClient, userIds: string[], requestId: string, key: string, title: string, body: string) {
  const ids = [...new Set(userIds)]; if (!ids.length) return;
  const notification = await tx.notification.upsert({ where: { eventKey: key }, create: { category: NotificationCategory.REQUEST, sourceType: "PASS_REQUEST", sourceId: requestId, eventKey: key, title, body }, update: {} });
  const preferences = await tx.notificationPreference.findMany({ where: { userId: { in: ids }, category: NotificationCategory.REQUEST, muted: true }, select: { userId: true } });
  const muted = new Set(preferences.map((item) => item.userId));
  await tx.notificationDelivery.createMany({ data: ids.map((recipientId) => ({ notificationId: notification.id, recipientId, channel: NotificationChannel.IN_APP, mutedAt: muted.has(recipientId) ? new Date() : null })), skipDuplicates: true });
}

export async function requestStudentPass(kindValue: unknown) {
  const student = await requireRole(Role.STUDENT);
  const kind = kindValue === PassRequestKind.REPLACEMENT ? PassRequestKind.REPLACEMENT : kindValue === PassRequestKind.TEMPORARY_DEMO_QR ? PassRequestKind.TEMPORARY_DEMO_QR : null;
  if (!kind) throw new Error("Неизвестный тип обращения.");
  const now = new Date(); const day = moscowDayStart(now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pass:${student.id}:${moscowDateKey(now)}:${kind}`}, 0))`;
    const existing = kind === PassRequestKind.TEMPORARY_DEMO_QR
      ? await tx.passRequest.findFirst({ where: { studentId: student.id, kind, submittedAt: { gte: day, lt: getMoscowDayBounds(now).end } }, orderBy: { submittedAt: "desc" }, select: { id: true } })
      : null;
    if (existing) return { created: false, id: existing.id };
    const request = await tx.passRequest.create({ data: { studentId: student.id, kind }, select: { id: true } });
    await tx.passRequestHistory.create({ data: { requestId: request.id, actorId: student.id, toState: PassRequestState.SUBMITTED } });
    const deans = await tx.userRole.findMany({ where: { role: Role.DEAN, revokedAt: null, user: { isActive: true } }, select: { userId: true } });
    await notify(tx, deans.map((item) => item.userId), request.id, `pass:${request.id}:submitted`, "Новый запрос пропуска", "В деканате поступил запрос на обработку пропуска.");
    return { created: true, id: request.id };
  }, { isolationLevel: "Serializable" });
}

export async function getStudentPassWorkspace() {
  const student = await requireRole(Role.STUDENT);
  const [profile, requests] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: student.id }, select: { displayName: true } }),
    prisma.passRequest.findMany({
      where: { studentId: student.id }, orderBy: { submittedAt: "desc" }, take: 50,
      include: { temporaryPass: true, processedBy: { select: { login: true, profile: { select: { displayName: true } } } }, history: { orderBy: { createdAt: "asc" }, include: { actor: { select: { profile: { select: { displayName: true } } } } } } },
    }),
  ]);
  return { displayName: profile?.displayName ?? student.login, requests };
}

export async function getDeanPassWorkspace() {
  const dean = await requireRole(Role.DEAN);
  const [requests, notifications] = await Promise.all([
    prisma.passRequest.findMany({ orderBy: [{ submittedAt: "desc" }], take: 200, include: { student: { select: { id: true, login: true, profile: { select: { displayName: true } }, memberships: { orderBy: { startsAt: "desc" }, take: 1, include: { group: { select: { code: true } } } } } }, processedBy: { select: { login: true, profile: { select: { displayName: true } } } }, history: { orderBy: { createdAt: "asc" }, include: { actor: { select: { login: true, profile: { select: { displayName: true } } } } } }, temporaryPass: true } }),
    prisma.notificationDelivery.findMany({ where: { recipientId: dean.id, notification: { sourceType: "PASS_REQUEST" } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, readAt: true, createdAt: true, notification: { select: { title: true, body: true, sourceId: true } } } }),
  ]);
  return { requests, notifications };
}

export async function transitionDeanPassRequest(input: { requestId: string; expectedVersion: number; nextState: PassRequestState; note: string; expiresAt?: Date }) {
  const dean = await requireRole(Role.DEAN);
  const note = input.note.trim();
  if (note.length > 2000 || !Number.isInteger(input.expectedVersion)) throw new Error("Проверьте пояснение и версию заявки.");
  if (input.nextState === PassRequestState.REJECTED && !note) throw new Error("Для отклонения обязательно укажите причину.");
  return prisma.$transaction(async (tx) => {
    const request = await tx.passRequest.findUnique({ where: { id: input.requestId }, select: { id: true, studentId: true, kind: true, state: true, version: true } });
    if (!request || request.version !== input.expectedVersion || !passCanTransition(request.state, input.nextState)) throw new Error("Статус уже изменён или переход недоступен. Обновите страницу.");
    if (input.nextState === PassRequestState.ISSUED && request.kind === PassRequestKind.TEMPORARY_DEMO_QR && (!input.expiresAt || input.expiresAt <= new Date())) throw new Error("Для выдачи временного демо-пропуска укажите время окончания в будущем.");
    const changed = await tx.passRequest.updateMany({ where: { id: request.id, version: request.version, state: request.state }, data: { state: input.nextState, processedById: dean.id, decisionReason: note || null, issuedAt: input.nextState === PassRequestState.ISSUED ? new Date() : undefined, version: { increment: 1 } } });
    if (changed.count !== 1) throw new Error("Заявка уже обработана другим сотрудником.");
    await tx.passRequestHistory.create({ data: { requestId: request.id, actorId: dean.id, fromState: request.state, toState: input.nextState, note: note || null } });
    if (input.nextState === PassRequestState.ISSUED && request.kind === PassRequestKind.TEMPORARY_DEMO_QR) {
      const issuedAt = new Date(); const id = randomUUID(); const token = id;
      const validDate = moscowDay(issuedAt);
      if (await tx.temporaryDemoPass.findUnique({ where: { studentId_validDate: { studentId: request.studentId, validDate } }, select: { id: true } })) throw new Error("На эту московскую календарную дату пропуск уже выдавался.");
      await tx.temporaryDemoPass.create({ data: { id, requestId: request.id, studentId: request.studentId, validDate, tokenHash: createHash("sha256").update(token).digest("base64url"), issuedAt, expiresAt: input.expiresAt! } });
    }
    const label = input.nextState === PassRequestState.IN_REVIEW ? "принят в работу" : input.nextState === PassRequestState.APPROVED ? "одобрен" : input.nextState === PassRequestState.ISSUED ? "выдан" : "отклонён";
    await notify(tx, [request.studentId], request.id, `pass:${request.id}:state:${request.version + 1}`, "Обновлён статус запроса пропуска", `Ваш запрос ${label}.${note ? ` Причина/комментарий: ${note}` : ""}`);
    return true;
  }, { isolationLevel: "Serializable" });
}
