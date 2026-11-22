import "server-only";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { prisma } from "@/lib/prisma";

export async function getCurrentOfficialAnnouncement(idValue: unknown) {
  const user = await requireRole(Role.STUDENT, Role.TEACHER);
  const id = String(idValue ?? ""); if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const now = new Date();
  const item = await prisma.officialAnnouncement.findFirst({ where: { id, state: "PUBLISHED", withdrawnAt: null, versions: { some: { publishedAt: { not: null } } } }, include: { versions: { where: { publishedAt: { not: null } }, orderBy: { number: "desc" }, take: 1 }, roleAudiences: true, groupAudiences: { select: { groupId: true } }, acknowledgements: { where: { userId: user.id }, select: { versionId: true, acknowledgedAt: true } } } });
  const version = item?.versions[0]; if (!item || !version) return null;
  let audienceMatch = item.roleAudiences.some((entry) => entry.role === user.activeRole);
  if (user.activeRole === Role.STUDENT) {
    const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(user.id, now), select: { groupId: true }, take: 10 });
    audienceMatch ||= item.groupAudiences.some((entry) => memberships.some((membership) => membership.groupId === entry.groupId));
  }
  if (!audienceMatch) return null;
  return { announcementId: item.id, title: version.title, body: version.body, versionId: version.id, versionNumber: version.number, publishedAt: version.publishedAt, requiresAcknowledgement: version.requiresAcknowledgement, acknowledgedAt: item.acknowledgements.find((entry) => entry.versionId === version.id)?.acknowledgedAt ?? null };
}

export async function acknowledgeOfficialAnnouncement(idValue: unknown, versionValue: unknown) {
  const user = await requireRole(Role.STUDENT, Role.TEACHER);
  const id = String(idValue ?? ""); const versionId = String(versionValue ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(versionId)) throw new Error("Объявление недоступно.");
  const visible = await getCurrentOfficialAnnouncement(id);
  if (!visible || visible.versionId !== versionId || !visible.requiresAcknowledgement) throw new Error("Подтверждение для этой версии недоступно.");
  await prisma.acknowledgement.upsert({ where: { versionId_userId: { versionId, userId: user.id } }, create: { announcementId: id, versionId, userId: user.id }, update: {} });
  return true;
}
