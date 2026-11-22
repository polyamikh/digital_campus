import "server-only";
import { ChatKind, NotificationCategory, NotificationChannel, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { teacherChatVisible } from "./teacher-chat-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeAssignment = (now: Date) => ({ AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] });

async function teacherScope(teacherId: string) {
  const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId, ...activeAssignment(new Date()) }, select: { courseId: true, groupId: true } });
  return [...new Map(assignments.map((item) => [item.groupId, item])).values()];
}

async function allowedChat(teacherId: string, chatId: string) {
  if (!UUID.test(chatId)) return false;
  const scope = await teacherScope(teacherId);
  if (!scope.length) return false;
  const groupIds = [...new Set(scope.map((item) => item.groupId))];
  const membership = await prisma.chatMember.findFirst({ where: { userId: teacherId, chatId, leftAt: null }, select: { chat: { select: { id: true, kind: true, groupId: true, courseId: true, members: { where: { leftAt: null, userId: { not: teacherId } }, select: { userId: true } } } } } });
  const chat = membership?.chat;
  if (!chat) return false;
  if (chat.kind === ChatKind.GROUP) return Boolean(chat.groupId && groupIds.includes(chat.groupId));
  if (chat.kind !== ChatKind.DIRECT || chat.members.length !== 1) return false;
  const peerId = chat.members[0]!.userId;
  const now = new Date();
  return Boolean(await prisma.groupMembership.findFirst({ where: { studentId: peerId, groupId: { in: groupIds }, AND: activeAssignment(now) }, select: { id: true } }) || await prisma.teacherAssignment.findFirst({ where: { teacherId: peerId, groupId: { in: groupIds }, ...activeAssignment(now) }, select: { id: true } }));
}

export async function openTeacherGroupChat(groupIdValue: unknown) {
  const teacher = await requireRole(Role.TEACHER); const groupId = String(groupIdValue ?? "");
  if (!UUID.test(groupId)) throw new Error("Некорректная учебная группа.");
  const now = new Date();
  if (!(await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, groupId, ...activeAssignment(now) }, select: { id: true } }))) throw new Error("Группа не относится к вашим действующим назначениям.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`group-chat:${groupId}`}, 0))`;
    const chat = await tx.chat.findFirst({ where: { kind: ChatKind.GROUP, groupId }, select: { id: true } }) ?? await tx.chat.create({ data: { kind: ChatKind.GROUP, groupId, name: "Чат учебной группы" }, select: { id: true } });
    const memberships = await tx.groupMembership.findMany({ where: { groupId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { studentId: true } });
    await tx.chatMember.createMany({ data: [...new Set([...memberships.map((item) => item.studentId), teacher.id])].map((userId) => ({ chatId: chat.id, userId })), skipDuplicates: true });
    await tx.chatMember.updateMany({ where: { chatId: chat.id, userId: teacher.id }, data: { leftAt: null, joinedAt: now } });
    return chat.id;
  }, { isolationLevel: "Serializable" });
}

export async function openTeacherDirectChat(peerIdValue: unknown) {
  const teacher = await requireRole(Role.TEACHER); const peerId = String(peerIdValue ?? "");
  if (!UUID.test(peerId) || peerId === teacher.id) throw new Error("Некорректный участник чата.");
  const scope = await teacherScope(teacher.id); const groupIds = [...new Set(scope.map((item) => item.groupId))]; const now = new Date();
  const [peer, membership, assignment] = await Promise.all([
    prisma.user.findFirst({ where: { id: peerId, isActive: true, roles: { some: { role: { in: [Role.STUDENT, Role.TEACHER] }, revokedAt: null } } }, select: { id: true } }),
    prisma.groupMembership.findFirst({ where: { studentId: peerId, groupId: { in: groupIds }, AND: activeAssignment(now) }, select: { id: true } }),
    prisma.teacherAssignment.findFirst({ where: { teacherId: peerId, groupId: { in: groupIds }, ...activeAssignment(now) }, select: { id: true } }),
  ]);
  if (!peer || (!membership && !assignment)) throw new Error("Личный чат можно начать только с участником ваших назначенных групп.");
  const directKey = [teacher.id, peerId].sort().join(":");
  return prisma.$transaction(async (tx) => {
    let chat = await tx.chat.findUnique({ where: { directKey }, select: { id: true } });
    if (!chat) chat = await tx.chat.create({ data: { kind: ChatKind.DIRECT, directKey, members: { create: [{ userId: teacher.id }, { userId: peerId }] } }, select: { id: true } });
    else await tx.chatMember.updateMany({ where: { chatId: chat.id, userId: { in: [teacher.id, peerId] } }, data: { leftAt: null, joinedAt: now } });
    return chat.id;
  }, { isolationLevel: "Serializable" });
}

export async function getTeacherChatWorkspace(selectedChatId?: string) {
  const teacher = await requireRole(Role.TEACHER);
  const scope = await teacherScope(teacher.id); const groupIds = [...new Set(scope.map((item) => item.groupId))];
  const memberships = groupIds.length ? await prisma.chatMember.findMany({
    where: { userId: teacher.id, leftAt: null, chat: { OR: [{ kind: ChatKind.GROUP, groupId: { in: groupIds } }, { kind: ChatKind.DIRECT }] } },
    orderBy: { joinedAt: "desc" }, take: 80,
    select: {
      id: true, chatId: true, lastReadAt: true,
      chat: { select: {
        id: true, kind: true, groupId: true, name: true, createdAt: true,
        group: { select: { code: true } },
        members: { where: { leftAt: null, userId: { not: teacher.id } }, select: { userId: true, user: { select: {
          profile: { select: { displayName: true } },
          memberships: { where: { groupId: { in: groupIds }, ...activeAssignment(new Date()) }, take: 10, select: { groupId: true } },
          teaching: { where: { groupId: { in: groupIds }, ...activeAssignment(new Date()) }, take: 10, select: { groupId: true } },
        } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, senderId: true } },
      } },
    },
  }) : [];
  const safeMemberships = memberships.filter((member) => teacherChatVisible({ kind: member.chat.kind, chatGroupId: member.chat.groupId, assignedGroupIds: groupIds, participantGroupIds: member.chat.members.flatMap((peer) => [...peer.user.memberships.map((entry) => entry.groupId), ...peer.user.teaching.map((entry) => entry.groupId)]) }) && (member.chat.kind !== ChatKind.DIRECT || member.chat.members.length === 1));
  const selected = safeMemberships.find((item) => item.chatId === selectedChatId) ?? safeMemberships[0] ?? null;
  const messages = selected ? await prisma.message.findMany({ where: { chatId: selected.chatId }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, senderId: true, body: true, createdAt: true, sender: { select: { profile: { select: { displayName: true } } } } } }) : [];
  const conversations = safeMemberships.map((member) => ({ id: member.chatId, kind: member.chat.kind, title: member.chat.name ?? member.chat.members[0]?.user.profile?.displayName ?? member.chat.group?.code ?? "Чат", subtitle: member.chat.kind === ChatKind.GROUP ? member.chat.group?.code ?? "Группа" : "Личная переписка", lastMessage: member.chat.messages[0]?.body ?? "Нет сообщений", lastMessageAt: member.chat.messages[0]?.createdAt ?? member.chat.createdAt }));
  const contacts = groupIds.length ? await prisma.user.findMany({ where: { id: { not: teacher.id }, isActive: true, OR: [{ roles: { some: { role: Role.STUDENT, revokedAt: null } }, memberships: { some: { groupId: { in: groupIds }, AND: activeAssignment(new Date()) } } }, { roles: { some: { role: Role.TEACHER, revokedAt: null } }, teaching: { some: { groupId: { in: groupIds }, ...activeAssignment(new Date()) } } }] }, orderBy: { login: "asc" }, take: 100, select: { id: true, login: true, profile: { select: { displayName: true } } } }) : [];
  const groups = groupIds.length ? await prisma.group.findMany({ where: { id: { in: groupIds } }, orderBy: { code: "asc" }, select: { id: true, code: true } }) : [];
  return { conversations, selectedId: selected?.chatId ?? null, messages: messages.map((message) => ({ ...message, senderName: message.sender.profile?.displayName ?? "Участник" })), contacts: contacts.map((contact) => ({ id: contact.id, name: contact.profile?.displayName ?? contact.login })), groups };
}

export async function sendTeacherChatMessage(chatIdValue: unknown, bodyValue: unknown) {
  const teacher = await requireRole(Role.TEACHER); const chatId = String(chatIdValue ?? ""); const body = typeof bodyValue === "string" ? bodyValue.trim() : "";
  if (!UUID.test(chatId) || !body || body.length > 4000) throw new Error("Сообщение должно содержать от 1 до 4000 символов.");
  return prisma.$transaction(async (tx) => {
    if (!(await allowedChat(teacher.id, chatId))) throw new Error("Чат недоступен в рамках ваших назначений.");
    const message = await tx.message.create({ data: { chatId, senderId: teacher.id, body }, select: { id: true } });
    const recipients = await tx.chatMember.findMany({ where: { chatId, userId: { not: teacher.id }, leftAt: null, mutedAt: null }, select: { userId: true } });
    if (recipients.length) {
      const recipientIds = recipients.map(({ userId }) => userId);
      const mutedPreferences = await tx.notificationPreference.findMany({ where: { userId: { in: recipientIds }, category: NotificationCategory.CHAT, muted: true }, select: { userId: true } });
      const muted = new Set(mutedPreferences.map((item) => item.userId));
      const notice = await tx.notification.upsert({ where: { eventKey: `chat:${chatId}:message:${message.id}` }, create: { category: NotificationCategory.CHAT, sourceType: "CHAT", sourceId: chatId, eventKey: `chat:${chatId}:message:${message.id}`, title: "Новое сообщение", body: body.slice(0, 500) }, update: {}, select: { id: true } });
      await tx.notificationDelivery.createMany({ data: recipients.map(({ userId }) => ({ notificationId: notice.id, recipientId: userId, channel: NotificationChannel.IN_APP, ...(muted.has(userId) ? { mutedAt: new Date() } : {}) })), skipDuplicates: true });
    }
    return message.id;
  });
}
