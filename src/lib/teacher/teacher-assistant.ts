import "server-only";
import { AIConversationMode, AIMessageRole, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";

const activeAssignment = (now: Date) => ({ AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] });

export async function getTeacherAssistantWorkspace(conversationId?: string) {
  const teacher = await requireRole(Role.TEACHER);
  const conversations = await prisma.aIConversation.findMany({ where: { ownerId: teacher.id, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, updatedAt: true } });
  const allowed = conversations.some((item) => item.id === conversationId);
  const messages = allowed ? await prisma.aIMessage.findMany({ where: { conversation: { id: conversationId, ownerId: teacher.id, deletedAt: null }, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 80, select: { id: true, role: true, content: true, createdAt: true } }) : [];
  return { conversations, selectedId: allowed ? conversationId! : null, messages };
}

export async function sendTeacherAssistantQuestion(input: { conversationId?: string; question: unknown }) {
  const teacher = await requireRole(Role.TEACHER);
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!question || question.length > 2000) throw new Error("Сообщение должно содержать от 1 до 2000 символов.");
  const now = new Date();
  const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id, ...activeAssignment(now) }, select: { courseId: true, groupId: true } });
  const pairs = assignments.map(({ courseId, groupId }) => ({ courseId, groupId }));
  const pairScope = pairs.length ? { OR: pairs } : { id: { in: [] as string[] } };
  const [lessons, pending] = await Promise.all([
    prisma.lesson.findMany({ where: { OR: [{ teacherId: teacher.id }, { examinerId: teacher.id }, { substituteId: teacher.id }], state: "SCHEDULED", startsAt: { gte: now }, ...(pairs.length ? {} : { id: { in: [] as string[] } }) }, orderBy: { startsAt: "asc" }, take: 8, select: { startsAt: true, course: { select: { subject: { select: { name: true } } } }, group: { select: { code: true } } } }),
    prisma.submission.count({ where: { state: "UNDER_REVIEW", homework: { authorId: teacher.id, ...pairScope } } }),
  ]);
  const items = lessons.map((item) => ({ date: new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(item.startsAt), title: `${item.course.subject.name} · ${item.group?.code ?? "группа"}` }));
  const response = /провер|сдач|очеред/i.test(question)
    ? `Сейчас в очереди на проверку ${pending} работ. Сводка рассчитана по вашим действующим назначениям. Откройте раздел «Домашние задания», чтобы увидеть состав работ.`
    : items.length
      ? `По вашим назначениям ближайшие события:\n${items.map((item) => `• ${item.date} — ${item.title}`).join("\n")}\n\nЭто выборка из расписания PostgreSQL, не генеративный ответ.`
      : `В доступном расписании на ближайшее время событий нет. Очередь на проверку: ${pending}. Данные ограничены вашими назначениями.`;
  const conversationId = input.conversationId;
  if (conversationId && !(await prisma.aIConversation.findFirst({ where: { id: conversationId, ownerId: teacher.id, deletedAt: null }, select: { id: true } }))) throw new Error("Диалог недоступен.");
  return prisma.$transaction(async (tx) => {
    const conversation = conversationId
      ? await tx.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date(), title: question.slice(0, 120) }, select: { id: true } })
      : await tx.aIConversation.create({ data: { ownerId: teacher.id, mode: AIConversationMode.STUDY_PLANNER, title: question.slice(0, 120) }, select: { id: true } });
    await tx.aIMessage.createMany({ data: [{ conversationId: conversation.id, role: AIMessageRole.USER, content: question }, { conversationId: conversation.id, role: AIMessageRole.ASSISTANT, content: response, providerModel: "campus-teacher-rules-v1" }] });
    return conversation.id;
  });
}
