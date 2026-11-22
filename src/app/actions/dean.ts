"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { CareerEventState, CareerOpportunityState, NotificationCategory, NotificationChannel, PublicationState, Role } from "@/generated/prisma/enums";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parseMoscowDateTime } from "@/lib/tasks/tasks-core";

async function allowed() {
  const h = await headers();
  return isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}
const text = (value: FormDataEntryValue | null, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const uuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
function parseMoscowLocalDateTime(value: string) { const [day, time] = value.split("T"); if (!day || !time) throw new Error("Укажите дату и время."); return parseMoscowDateTime(day, time).value; }
const revalidateDean = (...paths: string[]) => { for (const path of paths) revalidatePath(path); };

export async function updateDeanProfileAction(form: FormData) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try {
    const dean = await requireRole(Role.DEAN); const displayName = text(form.get("displayName"), 200); const email = text(form.get("email"), 320); const phone = text(form.get("phone"), 40); const title = text(form.get("title"), 160); const department = text(form.get("department"), 160);
    if (!displayName || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, error: "Проверьте имя и email." };
    const current = await prisma.userProfile.findUnique({ where: { userId: dean.id }, select: { settings: true } });
    const settings = current?.settings && typeof current.settings === "object" && !Array.isArray(current.settings) ? current.settings as Record<string, unknown> : {};
    await prisma.userProfile.upsert({ where: { userId: dean.id }, create: { userId: dean.id, displayName, email: email || null, phone: phone || null, settings: { ...settings, jobTitle: title || null, department: department || null } }, update: { displayName, email: email || null, phone: phone || null, settings: { ...settings, jobTitle: title || null, department: department || null } } });
    revalidateDean("/dean/profile"); return { ok: true };
  } catch { return { ok: false, error: "Не удалось сохранить профиль." }; }
}

export async function createOfficialAnnouncementAction(form: FormData) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try {
    const dean = await requireRole(Role.DEAN); const title = text(form.get("title"), 240); const body = text(form.get("body"), 20000); const groups = form.getAll("groupIds").filter((v): v is string => typeof v === "string" && uuid(v)); const roles = form.getAll("roles").filter((v): v is string => v === "STUDENT" || v === "TEACHER");
    if (!title || !body || (!groups.length && !roles.length)) return { ok: false, error: "Укажите текст и хотя бы одну аудиторию." };
    const id = await prisma.$transaction(async (tx) => {
      const announcement = await tx.officialAnnouncement.create({ data: { authorId: dean.id, versions: { create: { number: 1, title, body, requiresAcknowledgement: form.get("requiresAcknowledgement") === "on" } }, groupAudiences: { create: [...new Set(groups)].map((groupId) => ({ groupId })) }, roleAudiences: { create: [...new Set(roles)].map((role) => ({ role: role as "STUDENT" | "TEACHER" })) } }, select: { id: true } });
      return announcement.id;
    });
    revalidateDean("/dean/announcements"); return { ok: true, id };
  } catch { return { ok: false, error: "Не удалось создать черновик объявления." }; }
}

export async function publishOfficialAnnouncementAction(idValue: string) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try {
    const dean = await requireRole(Role.DEAN); if (!uuid(idValue)) return { ok: false, error: "Некорректное объявление." };
    await prisma.$transaction(async (tx) => {
      const item = await tx.officialAnnouncement.findUnique({ where: { id: idValue }, include: { versions: { orderBy: { number: "desc" }, take: 1 }, groupAudiences: true, roleAudiences: true } });
      const version = item?.versions[0]; if (!item || !version || item.state === PublicationState.PUBLISHED || item.withdrawnAt) throw new Error("Объявление недоступно для публикации.");
      const targets: Array<{ role: Role; userId: string }> = [];
      if (item.roleAudiences.length) {
        const users = await tx.user.findMany({ where: { isActive: true, roles: { some: { role: { in: item.roleAudiences.map((a) => a.role) }, revokedAt: null } } }, select: { id: true, roles: { where: { role: { in: item.roleAudiences.map((a) => a.role) }, revokedAt: null }, select: { role: true } } } });
        users.forEach((user) => user.roles.forEach((role) => targets.push({ role: role.role, userId: user.id })));
      }
      if (item.groupAudiences.length) {
        const students = await tx.groupMembership.findMany({ where: { groupId: { in: item.groupAudiences.map((a) => a.groupId) }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { studentId: true } });
        students.forEach((student) => targets.push({ role: Role.STUDENT, userId: student.studentId }));
      }
      const now = new Date(); await tx.announcementVersion.update({ where: { id: version.id }, data: { publishedAt: now } });
      const changed = await tx.officialAnnouncement.updateMany({ where: { id: item.id, version: item.version, state: { not: PublicationState.PUBLISHED } }, data: { state: PublicationState.PUBLISHED, withdrawnAt: null, version: { increment: 1 } } });
      if (changed.count !== 1) throw new Error("Объявление уже изменено.");
      const uniqueTargets = [...new Set(targets.map((target) => target.userId))];
      if (uniqueTargets.length) {
        const notification = await tx.notification.upsert({ where: { eventKey: `official-announcement:${item.id}:v${version.number}` }, create: { eventKey: `official-announcement:${item.id}:v${version.number}`, category: NotificationCategory.OFFICIAL_ANNOUNCEMENT, sourceType: "OFFICIAL_ANNOUNCEMENT", sourceId: item.id, title: version.title, body: version.body }, update: {} });
        const muted = await tx.notificationPreference.findMany({ where: { userId: { in: uniqueTargets }, category: NotificationCategory.OFFICIAL_ANNOUNCEMENT, muted: true }, select: { userId: true } }); const mutedIds = new Set(muted.map((row) => row.userId));
        await tx.notificationDelivery.createMany({ data: uniqueTargets.map((recipientId) => ({ notificationId: notification.id, recipientId, channel: NotificationChannel.IN_APP, ...(mutedIds.has(recipientId) ? { mutedAt: now } : {}) })), skipDuplicates: true });
      }
      await tx.auditEvent.create({ data: { actorId: dean.id, action: "OFFICIAL_ANNOUNCEMENT_PUBLISHED", targetType: "OfficialAnnouncement", targetId: item.id, outcome: "SUCCEEDED", metadata: { version: version.number, recipientCount: uniqueTargets.length } } });
    }, { isolationLevel: "Serializable" });
    revalidateDean("/dean/announcements", "/notifications", "/teacher/notifications"); return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось опубликовать объявление." }; }
}

export async function reviseOfficialAnnouncementAction(form: FormData) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try {
    const dean = await requireRole(Role.DEAN); const id = text(form.get("id"), 36); const expectedVersion = Number(form.get("version")); const title = text(form.get("title"), 240); const body = text(form.get("body"), 20000); const groupIds = [...new Set(form.getAll("groupIds").filter((v): v is string => typeof v === "string" && uuid(v)))]; const roles = [...new Set(form.getAll("roles").filter((v): v is "STUDENT" | "TEACHER" => v === "STUDENT" || v === "TEACHER"))];
    if (!uuid(id) || !Number.isInteger(expectedVersion) || !title || !body || (!groupIds.length && !roles.length)) return { ok: false, error: "Проверьте текст, аудиторию и версию объявления." };
    await prisma.$transaction(async (tx) => {
      const current = await tx.officialAnnouncement.findUnique({ where: { id }, include: { versions: { orderBy: { number: "desc" } }, roleAudiences: true, groupAudiences: true } });
      const latest = current?.versions[0]; if (!current || !latest || current.version !== expectedVersion) throw new Error("Объявление уже изменилось.");
      if (!current.withdrawnAt && current.state !== PublicationState.DRAFT && latest.publishedAt === null) throw new Error("Нельзя редактировать эту версию.");
      const hasPublishedHistory = current.versions.some((version) => version.publishedAt !== null);
      if (hasPublishedHistory) {
        const oldGroups = current.groupAudiences.map((entry) => entry.groupId).sort(); const newGroups = [...groupIds].sort();
        const oldRoles = current.roleAudiences.map((entry) => entry.role).sort(); const newRoles = [...roles].sort();
        if (JSON.stringify(oldGroups) !== JSON.stringify(newGroups) || JSON.stringify(oldRoles) !== JSON.stringify(newRoles)) throw new Error("После первой публикации аудиторию объявления менять нельзя.");
      }
      const nextNumber = latest.publishedAt === null ? latest.number : latest.number + 1;
      if (latest.publishedAt === null) await tx.announcementVersion.update({ where: { id: latest.id }, data: { title, body, requiresAcknowledgement: form.get("requiresAcknowledgement") === "on" } });
      else await tx.announcementVersion.create({ data: { announcementId: current.id, number: nextNumber, title, body, requiresAcknowledgement: form.get("requiresAcknowledgement") === "on" } });
      if (!hasPublishedHistory) {
        await tx.groupAnnouncementAudience.deleteMany({ where: { announcementId: current.id } }); await tx.roleAnnouncementAudience.deleteMany({ where: { announcementId: current.id } });
        if (groupIds.length) await tx.groupAnnouncementAudience.createMany({ data: groupIds.map((groupId) => ({ announcementId: current.id, groupId })) });
        if (roles.length) await tx.roleAnnouncementAudience.createMany({ data: roles.map((role) => ({ announcementId: current.id, role })) });
      }
      const changed = await tx.officialAnnouncement.updateMany({ where: { id: current.id, version: current.version }, data: { state: PublicationState.DRAFT, withdrawnAt: null, version: { increment: 1 } } });
      if (!changed.count) throw new Error("Объявление уже изменилось.");
      await tx.auditEvent.create({ data: { actorId: dean.id, action: "OFFICIAL_ANNOUNCEMENT_REVISED", targetType: "OfficialAnnouncement", targetId: current.id, outcome: "SUCCEEDED", metadata: { version: nextNumber } } });
    }, { isolationLevel: "Serializable" });
    revalidateDean("/dean/announcements"); return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить новую версию." }; }
}

export async function withdrawOfficialAnnouncementAction(idValue: string) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try { const dean = await requireRole(Role.DEAN); if (!uuid(idValue)) return { ok: false, error: "Некорректное объявление." }; await prisma.$transaction(async (tx) => { const row = await tx.officialAnnouncement.findUnique({ where: { id: idValue }, select: { state: true, version: true } }); if (!row || row.state !== PublicationState.PUBLISHED) throw new Error("Можно снять с публикации только опубликованное объявление."); const updated = await tx.officialAnnouncement.updateMany({ where: { id: idValue, state: PublicationState.PUBLISHED, version: row.version }, data: { state: PublicationState.WITHDRAWN, withdrawnAt: new Date(), version: { increment: 1 } } }); if (!updated.count) throw new Error("Объявление уже изменено."); await tx.auditEvent.create({ data: { actorId: dean.id, action: "OFFICIAL_ANNOUNCEMENT_WITHDRAWN", targetType: "OfficialAnnouncement", targetId: idValue, outcome: "SUCCEEDED" } }); }); revalidateDean("/dean/announcements"); return { ok: true }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось снять объявление." }; }
}

export async function setDeanNotificationAction(categoryValue: string, enabled: boolean) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try { const dean = await requireRole(Role.DEAN); const category = Object.values(NotificationCategory).find((value) => value === categoryValue); if (!category || category === NotificationCategory.CRITICAL_OFFICIAL) return { ok: false, error: "Эта категория обязательна." }; await prisma.notificationPreference.upsert({ where: { userId_category: { userId: dean.id, category } }, create: { userId: dean.id, category, muted: !enabled }, update: { muted: !enabled } }); revalidateDean("/dean/notifications"); return { ok: true }; } catch { return { ok: false, error: "Не удалось сохранить настройку." }; }
}

export async function markDeanNotificationReadAction(deliveryId: string) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try { const dean = await requireRole(Role.DEAN); if (!uuid(deliveryId)) return { ok: false, error: "Уведомление недоступно." }; await prisma.notificationDelivery.updateMany({ where: { id: deliveryId, recipientId: dean.id, readAt: null }, data: { readAt: new Date() } }); revalidateDean("/dean/notifications"); return { ok: true }; } catch { return { ok: false, error: "Не удалось обновить уведомление." }; }
}

export async function markAllDeanNotificationsReadAction() {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try { const dean = await requireRole(Role.DEAN); await prisma.notificationDelivery.updateMany({ where: { recipientId: dean.id, readAt: null }, data: { readAt: new Date() } }); revalidateDean("/dean/notifications"); return { ok: true }; } catch { return { ok: false, error: "Не удалось отметить уведомления." }; }
}

export async function saveCareerOpportunityAction(form: FormData) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try {
    await requireRole(Role.DEAN); const id = text(form.get("id"), 36); const title = text(form.get("title"), 240); const organization = text(form.get("organization"), 240); const description = text(form.get("description"), 10000); const categoryId = text(form.get("categoryId"), 36); const url = text(form.get("externalUrl"), 2000); const location = text(form.get("location"), 200); const closesAtRaw = text(form.get("closesAt"), 40);
    if (!title || !organization || !description || !uuid(categoryId) || (url && !/^https:\/\//i.test(url))) return { ok: false, error: "Проверьте обязательные поля и HTTPS-ссылку." };
    let closesAt: Date | null = null; try { closesAt = closesAtRaw ? parseMoscowLocalDateTime(closesAtRaw) : null; } catch { return { ok: false, error: "Некорректный срок закрытия." }; }
    const data = { title, organization, description, categoryId, externalUrl: url || null, location: location || null, closesAt };
    if (id) { if (!uuid(id)) return { ok: false, error: "Некорректная запись." }; await prisma.careerOpportunity.update({ where: { id }, data }); }
    else await prisma.careerOpportunity.create({ data });
    revalidateDean("/dean/career", "/career"); return { ok: true };
  } catch { return { ok: false, error: "Не удалось сохранить возможность." }; }
}

export async function setCareerOpportunityStateAction(id: string, stateValue: string) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try { await requireRole(Role.DEAN); if (!uuid(id) || !Object.values(CareerOpportunityState).includes(stateValue as CareerOpportunityState)) return { ok: false, error: "Некорректный статус." }; await prisma.careerOpportunity.update({ where: { id }, data: { state: stateValue as CareerOpportunityState } }); revalidateDean("/dean/career", "/career"); return { ok: true }; } catch { return { ok: false, error: "Не удалось изменить публикацию." }; }
}

export async function saveCareerEventAction(form: FormData) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try { await requireRole(Role.DEAN); const id = text(form.get("id"), 36); const title = text(form.get("title"), 240); const description = text(form.get("description"), 10000); const startsRaw = text(form.get("startsAt"), 40); const endsRaw = text(form.get("endsAt"), 40); let startsAt: Date; let endsAt: Date | null; try { startsAt = parseMoscowLocalDateTime(startsRaw); endsAt = endsRaw ? parseMoscowLocalDateTime(endsRaw) : null; } catch { return { ok: false, error: "Проверьте московские дату и время." }; } const url = text(form.get("externalUrl"), 2000); const location = text(form.get("location"), 200); if (!title || !description || (endsAt && endsAt <= startsAt) || (url && !/^https:\/\//i.test(url))) return { ok: false, error: "Проверьте обязательные поля и временной интервал." }; const data = { title, description, startsAt, endsAt, externalUrl: url || null, location: location || null }; if (id) { if (!uuid(id)) return { ok: false, error: "Некорректное событие." }; await prisma.careerEvent.update({ where: { id }, data }); } else await prisma.careerEvent.create({ data }); revalidateDean("/dean/career", "/career", "/dean/calendar"); return { ok: true }; } catch { return { ok: false, error: "Не удалось сохранить мероприятие." }; }
}

export async function setCareerEventStateAction(id: string, stateValue: string) {
  if (!(await allowed())) return { ok: false, error: "Запрос отклонён." };
  try { await requireRole(Role.DEAN); if (!uuid(id) || !Object.values(CareerEventState).includes(stateValue as CareerEventState)) return { ok: false, error: "Некорректный статус." }; await prisma.careerEvent.update({ where: { id }, data: { state: stateValue as CareerEventState } }); revalidateDean("/dean/career", "/career", "/dean/calendar"); return { ok: true }; } catch { return { ok: false, error: "Не удалось изменить статус мероприятия." }; }
}
