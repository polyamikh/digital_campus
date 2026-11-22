import "server-only";

import { AIConversationMode, AIMessageRole, CareerOpportunityState, PublicationState, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { studentHomeworkScope } from "@/lib/coursework/coursework-core";
import { answerCampusAssistant, type CampusAssistantMode } from "./campus-core";

function modeFrom(value: string | null | undefined): AIConversationMode {
  return value === "CAREER_ASSISTANT" ? AIConversationMode.CAREER_ASSISTANT : AIConversationMode.STUDY_PLANNER;
}

export async function getAssistantWorkspace(conversationId?: string, forceNew = false) {
  const user = await requireRole(Role.STUDENT);
  const [profile, conversations] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id }, select: { displayName: true } }),
    prisma.aIConversation.findMany({ where: { ownerId: user.id, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, mode: true, title: true, updatedAt: true } }),
  ]);
  const selected = forceNew ? null : conversations.find((item) => item.id === conversationId) ?? conversations[0] ?? null;
  const messages = selected ? await prisma.aIMessage.findMany({ where: { conversationId: selected.id, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, role: true, content: true, createdAt: true } }) : [];
  return { displayName: profile?.displayName ?? user.login, conversations, selected, messages };
}

export async function sendAssistantMessage(input: { conversationId?: string; mode: CampusAssistantMode; question: string }) {
  const user = await requireRole(Role.STUDENT);
  const mode = modeFrom(input.mode);
  const question = input.question.trim();
  if (!question || question.length > 2000) throw new Error("Сообщение должно содержать от 1 до 2000 символов.");
  const conversationId = input.conversationId;
  if (conversationId) {
    const owner = await prisma.aIConversation.findFirst({ where: { id: conversationId, ownerId: user.id, deletedAt: null }, select: { id: true, mode: true } });
    if (!owner) throw new Error("Диалог недоступен.");
    if (owner.mode && owner.mode !== mode) throw new Error("Режим этого диалога изменить нельзя.");
  }
  const now = new Date();
  const membership = await prisma.groupMembership.findMany({ where: activeMembershipWhere(user.id, now), select: { groupId: true }, take: 2 });
  const groupIds = membership.length === 1 ? membership.map((item) => item.groupId) : [];
  const [lessons, homework, resume, opportunities] = mode === "STUDY_PLANNER" ? await Promise.all([
    prisma.lesson.findMany({ where: { groupId: { in: groupIds }, state: { not: "CANCELLED" }, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 8, include: { course: { select: { name: true } } } }),
    prisma.homework.findMany({ where: { ...(groupIds.length === 1 ? studentHomeworkScope(groupIds[0]!) : { id: { in: [] } }), state: PublicationState.PUBLISHED, OR: [{ deadline: null }, { deadline: { gte: now } }] }, orderBy: { deadline: "asc" }, take: 5, select: { title: true, deadline: true } }),
    Promise.resolve(null), Promise.resolve([]),
  ]) : await Promise.all([
    Promise.resolve([]), Promise.resolve([]),
    prisma.careerResume.findUnique({ where: { studentId: user.id }, include: { skills: { select: { name: true } } } }),
    prisma.careerOpportunity.findMany({ where: { state: CareerOpportunityState.PUBLISHED, OR: [{ closesAt: null }, { closesAt: { gt: now } }] }, orderBy: { closesAt: "asc" }, take: 5, select: { title: true } }),
  ]);
  const upcomingItems = [
    ...lessons.map((item) => ({ title: item.course.name, at: item.startsAt, withTime: true })),
    ...homework.filter((item) => item.deadline).map((item) => ({ title: `Дедлайн: ${item.title}`, at: item.deadline!, withTime: false })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 5).map((item) => ({
    title: item.title,
    date: new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", ...(item.withTime ? { timeStyle: "short" as const } : {}), timeZone: "Europe/Moscow" }).format(item.at),
  }));
  const response = answerCampusAssistant({ mode: mode as CampusAssistantMode, question, upcomingItems, skills: resume?.skills.map((item) => item.name) ?? [], opportunityTitles: opportunities.map((item) => item.title) });
  const title = question.slice(0, 120);
  return prisma.$transaction(async (tx) => {
    const conversation = conversationId
      ? await tx.aIConversation.update({ where: { id: conversationId }, data: { mode, updatedAt: new Date(), title: title }, select: { id: true } })
      : await tx.aIConversation.create({ data: { ownerId: user.id, mode, title }, select: { id: true } });
    await tx.aIMessage.createMany({ data: [
      { conversationId: conversation.id, role: AIMessageRole.USER, content: question },
      { conversationId: conversation.id, role: AIMessageRole.ASSISTANT, content: response, providerModel: "campus-local-rules-v1" },
    ] });
    return conversation.id;
  });
}
