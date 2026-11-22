import "server-only";

import { ChatKind, NotificationCategory, NotificationChannel, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { chatDisplayTitle, directChatKey, studentChatVisibilityScope } from "./campus-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ChatActionError extends Error {}

async function groupIdsForStudent(studentId: string) {
  const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(studentId, new Date()), select: { groupId: true }, take: 3 });
  return memberships.length === 1 ? memberships.map((item) => item.groupId) : [];
}

function chatScope(groupIds: string[]) {
  return studentChatVisibilityScope(groupIds);
}

export async function getStudentChatWorkspace(selectedChatId?: string, messageSearch?: string) {
  const student = await requireRole(Role.STUDENT);
  const groupIds = await groupIdsForStudent(student.id);
  const memberships = await prisma.chatMember.findMany({
    where: { userId: student.id, leftAt: null, chat: chatScope(groupIds) },
    include: {
      chat: {
        include: {
          course: { select: { name: true } },
          group: { select: { code: true } },
          members: { where: { leftAt: null }, include: { user: { select: { id: true, profile: { select: { displayName: true } } } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
    take: 80,
  });
  const previews = await Promise.all(memberships.map(async (membership) => ({
    membership,
    unreadCount: await prisma.message.count({ where: { chatId: membership.chatId, senderId: { not: student.id }, ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}) } }),
  })));
  previews.sort((a, b) => (b.membership.chat.messages[0]?.createdAt.getTime() ?? b.membership.joinedAt.getTime()) - (a.membership.chat.messages[0]?.createdAt.getTime() ?? a.membership.joinedAt.getTime()));
  const selected = previews.find(({ membership }) => membership.chatId === selectedChatId) ?? previews[0] ?? null;
  let messages: Array<Record<string, unknown>> = [];
  if (selected) {
    const now = new Date();
    await prisma.chatMember.update({ where: { id: selected.membership.id }, data: { lastReadAt: now } });
    messages = await prisma.message.findMany({
      where: { chatId: selected.membership.chatId, ...(messageSearch?.trim() ? { body: { contains: messageSearch.trim().slice(0, 120), mode: "insensitive" as const } } : {}) },
      orderBy: { createdAt: "desc" }, take: 80,
      include: {
        sender: { select: { id: true, profile: { select: { displayName: true } } } },
        replyTo: { select: { id: true, body: true } },
        pinnedBy: { select: { id: true, profile: { select: { displayName: true } } } },
        attachments: { select: { id: true, fileName: true, mimeType: true, byteSize: true } },
        reactions: { select: { userId: true, reaction: true } },
      },
    });
    messages.reverse();
  }
  const contacts = groupIds.length ? await getStudentChatContacts(student.id, groupIds[0]!) : [];
  const selectedChat = selected ? {
    id: selected.membership.chat.id,
    kind: selected.membership.chat.kind,
    title: chatDisplayTitle({ name: selected.membership.chat.name, kind: selected.membership.chat.kind, peerName: selected.membership.chat.kind === ChatKind.DIRECT ? selected.membership.chat.members.find((item) => item.user.id !== student.id)?.user.profile?.displayName : null, courseName: selected.membership.chat.course?.name, groupCode: selected.membership.chat.group?.code }),
    members: selected.membership.chat.members.map((item) => ({ id: item.user.id, name: item.user.profile?.displayName ?? "Участник" })),
  } : null;
  return {
    selectedChatId: selected?.membership.chatId ?? null,
    selectedChat,
    messageSearch: messageSearch?.slice(0, 120) ?? "",
    conversations: previews.map(({ membership, unreadCount }) => {
      const chat = membership.chat;
      const peer = chat.kind === ChatKind.DIRECT ? chat.members.find((item) => item.user.id !== student.id)?.user.profile?.displayName : null;
      return {
        id: chat.id,
        kind: chat.kind,
        title: chatDisplayTitle({ name: chat.name, kind: chat.kind, peerName: peer, courseName: chat.course?.name, groupCode: chat.group?.code }),
        subtitle: chat.kind === ChatKind.DIRECT ? "Личная переписка" : chat.course?.name ?? chat.group?.code ?? "Учебное сообщество",
        lastMessage: chat.messages[0]?.body ?? "Нет сообщений",
        lastMessageAt: chat.messages[0]?.createdAt ?? chat.createdAt,
        unreadCount: membership.chatId === selected?.membership.chatId ? 0 : unreadCount,
        muted: membership.mutedAt !== null,
      };
    }),
    contacts,
    messages: messages.map((raw) => {
      const message = raw as { id: string; chatId: string; senderId: string; body: string; createdAt: Date; replyTo: { id: string; body: string } | null; pinnedAt: Date | null; pinnedBy: { profile: { displayName: string | null } | null } | null; sender: { profile: { displayName: string | null } | null }; attachments: Array<{ id: string; fileName: string; mimeType: string; byteSize: bigint }>; reactions: Array<{ userId: string; reaction: string }> };
      return { id: message.id, chatId: message.chatId, senderId: message.senderId, senderName: message.sender.profile?.displayName ?? "Участник", body: message.body, createdAt: message.createdAt, replyTo: message.replyTo, pinnedAt: message.pinnedAt, pinnedByName: message.pinnedBy?.profile?.displayName ?? null, attachments: message.attachments.map((file) => ({ ...file, byteSize: file.byteSize.toString() })), reactions: message.reactions };
    }),
  };
}

async function getStudentChatContacts(studentId: string, groupId: string) {
  const now = new Date();
  const [students, teachers] = await Promise.all([
    prisma.user.findMany({ where: { id: { not: studentId }, isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } }, memberships: { some: { studentId: { not: studentId }, groupId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] } } }, select: { id: true, profile: { select: { displayName: true } } }, orderBy: { login: "asc" }, take: 80 }),
    prisma.teacherAssignment.findMany({ where: { groupId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], teacher: { isActive: true, roles: { some: { role: Role.TEACHER, revokedAt: null } } } }, select: { teacher: { select: { id: true, profile: { select: { displayName: true } } } } }, take: 40 }),
  ]);
  const byId = new Map<string, { id: string; name: string; kind: "STUDENT" | "TEACHER" }>();
  for (const user of students) byId.set(user.id, { id: user.id, name: user.profile?.displayName ?? "Студент", kind: "STUDENT" });
  for (const item of teachers) if (!byId.has(item.teacher.id)) byId.set(item.teacher.id, { id: item.teacher.id, name: item.teacher.profile?.displayName ?? "Преподаватель", kind: "TEACHER" });
  return [...byId.values()];
}

async function notifyChatMembers(tx: Prisma.TransactionClient, chatId: string, senderId: string, messageId: string, body: string) {
  const recipients = await tx.chatMember.findMany({ where: { chatId, userId: { not: senderId }, leftAt: null, mutedAt: null }, select: { userId: true } });
  if (!recipients.length) return;
  const preferences = await tx.notificationPreference.findMany({ where: { userId: { in: recipients.map((item) => item.userId) }, category: NotificationCategory.CHAT, muted: true }, select: { userId: true } });
  const muted = new Set(preferences.map((item) => item.userId));
  const activeRecipients = recipients.filter((item) => !muted.has(item.userId));
  if (!activeRecipients.length) return;
  const notice = await tx.notification.upsert({ where: { eventKey: `chat:${chatId}:message:${messageId}` }, create: { category: NotificationCategory.CHAT, sourceType: "CHAT", sourceId: chatId, eventKey: `chat:${chatId}:message:${messageId}`, title: "Новое сообщение", body: body.slice(0, 500) || "В чате появилось вложение." }, update: {} });
  for (const recipient of activeRecipients) await tx.notificationDelivery.upsert({ where: { notificationId_recipientId_channel: { notificationId: notice.id, recipientId: recipient.userId, channel: NotificationChannel.IN_APP } }, create: { notificationId: notice.id, recipientId: recipient.userId }, update: {} });
}

export async function createStudentDirectChat(peerIdValue: unknown) {
  const student = await requireRole(Role.STUDENT);
  const peerId = String(peerIdValue ?? "");
  const groupIds = await groupIdsForStudent(student.id);
  if (!UUID.test(peerId) || peerId === student.id || groupIds.length !== 1) throw new ChatActionError("Не удалось подтвердить доступ к контакту.");
  const groupId = groupIds[0]!;
  const contacts = await getStudentChatContacts(student.id, groupId);
  if (!contacts.some((contact) => contact.id === peerId)) throw new ChatActionError("Этого пользователя нельзя добавить в личный чат.");
  const directKey = directChatKey(student.id, peerId)!;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.chat.findUnique({ where: { directKey }, select: { id: true, members: { select: { userId: true, leftAt: true } } } });
      if (existing) {
        if (existing.members.length !== 2 || !existing.members.some((item) => item.userId === student.id) || !existing.members.some((item) => item.userId === peerId)) throw new ChatActionError("Личная переписка недоступна.");
        await tx.chatMember.updateMany({ where: { chatId: existing.id, userId: { in: [student.id, peerId] } }, data: { leftAt: null, joinedAt: new Date() } });
        return existing.id;
      }
      const chat = await tx.chat.create({ data: { kind: ChatKind.DIRECT, directKey, members: { create: [{ userId: student.id }, { userId: peerId }] } }, select: { id: true } });
      return chat.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const existing = await prisma.chat.findUnique({ where: { directKey }, select: { id: true } }).catch(() => null);
    if (existing) return existing.id;
    throw error;
  }
}

export async function createStudentGroupChat() {
  const student = await requireRole(Role.STUDENT); const groupIds = await groupIdsForStudent(student.id);
  if (groupIds.length !== 1) throw new ChatActionError("Не удалось подтвердить активную группу.");
  const groupId = groupIds[0]!; const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`group-chat:${groupId}`}, 0))`;
    const existing = await tx.chat.findFirst({ where: { kind: ChatKind.GROUP, groupId }, select: { id: true } });
    if (existing) {
      await tx.chatMember.upsert({ where: { chatId_userId: { chatId: existing.id, userId: student.id } }, create: { chatId: existing.id, userId: student.id }, update: { leftAt: null, joinedAt: now } });
      return existing.id;
    }
    const memberships = await tx.groupMembership.findMany({ where: { groupId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }], student: { isActive: true, roles: { some: { role: Role.STUDENT, revokedAt: null } } } }, select: { studentId: true } });
    const userIds = [...new Set([...memberships.map((item) => item.studentId), student.id])];
    const chat = await tx.chat.create({ data: { kind: ChatKind.GROUP, groupId, name: "Чат учебной группы" }, select: { id: true } });
    await tx.chatMember.createMany({ data: userIds.map((userId) => ({ chatId: chat.id, userId })), skipDuplicates: true });
    return chat.id;
  }, { isolationLevel: "Serializable" });
}

export async function sendStudentChatMessage(input: { chatId: unknown; body: unknown; replyToId?: unknown; attachment?: { objectKey: string; fileName: string; mimeType: string; byteSize: number } }) {
  const student = await requireRole(Role.STUDENT);
  const chatId = String(input.chatId ?? "");
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const replyToId = input.replyToId ? String(input.replyToId) : null;
  if (!UUID.test(chatId) || body.length > 4000 || (!body && !input.attachment) || (replyToId && !UUID.test(replyToId))) throw new ChatActionError("Проверьте сообщение и вложение.");
  const groupIds = await groupIdsForStudent(student.id);
  return prisma.$transaction(async (tx) => {
    const member = await tx.chatMember.findFirst({ where: { userId: student.id, chatId, leftAt: null, chat: chatScope(groupIds) }, select: { id: true } });
    if (!member) throw new ChatActionError("Вы больше не состоите в этом чате.");
    if (replyToId && !(await tx.message.findFirst({ where: { id: replyToId, chatId }, select: { id: true } }))) throw new ChatActionError("Сообщение для ответа не найдено в этом чате.");
    const message = await tx.message.create({ data: { chatId, senderId: student.id, body, replyToId, ...(input.attachment ? { attachments: { create: input.attachment } } : {}) }, select: { id: true } });
    await notifyChatMembers(tx, chatId, student.id, message.id, body);
    return message.id;
  }, { isolationLevel: "Serializable" });
}

export async function toggleStudentChatReaction(messageIdValue: unknown, reactionValue: unknown) {
  const student = await requireRole(Role.STUDENT);
  const messageId = String(messageIdValue ?? ""); const reaction = String(reactionValue ?? "");
  if (!UUID.test(messageId) || !["👍", "❤️", "👏", "😂", "💡"].includes(reaction)) throw new ChatActionError("Недопустимая реакция.");
  const groupIds = await groupIdsForStudent(student.id);
  const message = await prisma.message.findFirst({ where: { id: messageId, chat: { ...chatScope(groupIds), members: { some: { userId: student.id, leftAt: null } } } }, select: { id: true, chatId: true } });
  if (!message) throw new ChatActionError("Сообщение недоступно.");
  const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId_reaction: { messageId, userId: student.id, reaction } }, select: { messageId: true } });
  if (existing) await prisma.messageReaction.delete({ where: { messageId_userId_reaction: { messageId, userId: student.id, reaction } } });
  else await prisma.messageReaction.create({ data: { messageId, userId: student.id, reaction } });
  return message.chatId;
}

export async function toggleStudentChatPin(messageIdValue: unknown) {
  const student = await requireRole(Role.STUDENT); const messageId = String(messageIdValue ?? "");
  if (!UUID.test(messageId)) throw new ChatActionError("Недопустимое сообщение.");
  const groupIds = await groupIdsForStudent(student.id);
  const message = await prisma.message.findFirst({ where: { id: messageId, chat: { ...chatScope(groupIds), members: { some: { userId: student.id, leftAt: null } } } }, select: { id: true, chatId: true, pinnedAt: true, pinnedById: true } });
  if (!message) throw new ChatActionError("Сообщение недоступно.");
  if (message.pinnedAt && message.pinnedById !== student.id) throw new ChatActionError("Закреплённое другим участником сообщение нельзя снять.");
  await prisma.message.update({ where: { id: message.id }, data: message.pinnedAt ? { pinnedAt: null, pinnedById: null } : { pinnedAt: new Date(), pinnedById: student.id } });
  return message.chatId;
}

export async function toggleStudentChatMute(chatIdValue: unknown) {
  const student = await requireRole(Role.STUDENT); const chatId = String(chatIdValue ?? "");
  if (!UUID.test(chatId)) throw new ChatActionError("Недопустимый чат.");
  const groupIds = await groupIdsForStudent(student.id);
  const member = await prisma.chatMember.findFirst({ where: { chatId, userId: student.id, leftAt: null, chat: chatScope(groupIds) }, select: { id: true, mutedAt: true } });
  if (!member) throw new ChatActionError("Чат недоступен.");
  await prisma.chatMember.update({ where: { id: member.id }, data: { mutedAt: member.mutedAt ? null : new Date() } });
}

export async function createChatAttachmentMessage(input: { chatId: unknown; body: unknown; replyToId?: unknown; objectKey: string; fileName: string; mimeType: string; byteSize: number }) {
  return sendStudentChatMessage({ ...input, attachment: { objectKey: input.objectKey, fileName: input.fileName, mimeType: input.mimeType, byteSize: input.byteSize } });
}

export async function getChatAttachmentForCurrentStudent(attachmentId: string, chatId?: string) {
  const student = await requireRole(Role.STUDENT); const groupIds = await groupIdsForStudent(student.id);
  return prisma.messageAttachment.findFirst({ where: { id: attachmentId, message: { ...(chatId ? { chatId } : {}), chat: { ...chatScope(groupIds), members: { some: { userId: student.id, leftAt: null } } } } }, select: { objectKey: true, fileName: true, mimeType: true, byteSize: true } });
}
