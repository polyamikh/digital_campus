import "server-only";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { prisma } from "@/lib/prisma";

export async function getCurrentStudentGroupAnnouncement(idValue: unknown) {
  const student = await requireRole(Role.STUDENT); const id = String(idValue ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(student.id, new Date()), select: { groupId: true }, take: 3 });
  const groupIds = memberships.map((item) => item.groupId);
  if (!groupIds.length) return null;
  return prisma.courseAnnouncement.findFirst({ where: { id, groupId: { in: groupIds }, publishedAt: { lte: new Date() } }, select: { id: true, title: true, body: true, publishedAt: true, course: { select: { subject: { select: { name: true } } } }, group: { select: { code: true } } } });
}
