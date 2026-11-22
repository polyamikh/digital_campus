"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { createTeacherAssessmentStructure, createTeacherGroupAnnouncement, createTeacherPersonalTask, deleteTeacherPersonalTask, markTeacherNotificationCategoryRead, markTeacherNotificationRead, publishTeacherGradeDraft, saveTeacherGradeDrafts, setTeacherNotificationPreference, createTeacherScheduleSubstitution, toggleTeacherPersonalTaskCompletion, updateTeacherPersonalTask } from "@/lib/teacher/teacher-workspace";
import { openTeacherDirectChat, openTeacherGroupChat, sendTeacherChatMessage } from "@/lib/teacher/teacher-chat-service";
import { sendTeacherAssistantQuestion } from "@/lib/teacher/teacher-assistant";

async function sameOrigin() {
  const h = await headers();
  return isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось выполнить действие.";
}

export async function saveTeacherGradesAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    const raw = formData.get("grades");
    if (typeof raw !== "string") return { ok: false, error: "Нет оценок для сохранения." };
    const result = await saveTeacherGradeDrafts(JSON.parse(raw) as unknown);
    revalidatePath("/teacher/grades");
    return { ok: true, saved: result.saved };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function publishTeacherGradeAction(assessmentId: string, studentId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await publishTeacherGradeDraft({ assessmentId, studentId }); revalidatePath("/teacher/grades"); revalidatePath("/grades"); return { ok: true }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function createTeacherStructureAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    const result = await createTeacherAssessmentStructure({ courseId: formData.get("courseId"), rawComponents: formData.get("components"), reason: formData.get("reason") });
    revalidatePath("/teacher/grades"); revalidatePath("/grades"); revalidatePath("/teacher/homework"); revalidatePath("/teacher/testing");
    return { ok: true, version: result.version };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function markTeacherNotificationReadAction(id: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await markTeacherNotificationRead(id); revalidatePath("/teacher/notifications"); return { ok: true }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function markAllTeacherNotificationsReadAction() {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await markTeacherNotificationCategoryRead(); revalidatePath("/teacher/notifications"); return { ok: true }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function setTeacherNotificationPreferenceAction(category: string, enabled: boolean) {
  if (!(await sameOrigin()) || typeof enabled !== "boolean") return { ok: false, error: "Запрос отклонён." };
  try { await setTeacherNotificationPreference(category, enabled); revalidatePath("/teacher/notifications"); return { ok: true }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function createTeacherSubstitutionRequestAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    const requestId = await createTeacherScheduleSubstitution({ lessonId: formData.get("lessonId"), substituteId: formData.get("substituteId"), reason: formData.get("reason") });
    revalidatePath("/teacher/schedule"); revalidatePath("/dean/schedule");
    return { ok: true, requestId };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function saveTeacherPersonalTaskAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try {
    const id = formData.get("id");
    const input = { title: formData.get("title"), details: formData.get("details"), date: formData.get("date"), startTime: formData.get("startTime"), endTime: formData.get("endTime"), allDay: formData.get("allDay") === "on", category: formData.get("category"), priority: formData.get("priority"), reminderMinutes: formData.get("reminderMinutes") };
    if (typeof id === "string" && id) await updateTeacherPersonalTask({ ...input, id, version: formData.get("version"), state: formData.get("state") });
    else await createTeacherPersonalTask(input);
    revalidatePath("/teacher/calendar"); revalidatePath("/teacher");
    return { ok: true };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function deleteTeacherPersonalTaskAction(id: string, version: number) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await deleteTeacherPersonalTask(id, version); revalidatePath("/teacher/calendar"); return { ok: true }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function toggleTeacherPersonalTaskCompletionAction(id: string, version: number) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await toggleTeacherPersonalTaskCompletion(id, version); revalidatePath("/teacher/calendar"); return { ok: true }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function openTeacherGroupChatAction(groupId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const chatId = await openTeacherGroupChat(groupId); revalidatePath("/teacher/chats"); return { ok: true, chatId }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function openTeacherDirectChatAction(peerId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const chatId = await openTeacherDirectChat(peerId); revalidatePath("/teacher/chats"); return { ok: true, chatId }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function sendTeacherChatMessageAction(chatId: string, body: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await sendTeacherChatMessage(chatId, body); revalidatePath("/teacher/chats"); return { ok: true }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function sendTeacherAssistantQuestionAction(conversationId: string | undefined, question: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const id = await sendTeacherAssistantQuestion({ ...(conversationId ? { conversationId } : {}), question }); revalidatePath("/teacher/assistant"); return { ok: true, conversationId: id }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

export async function createTeacherGroupAnnouncementAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const id = await createTeacherGroupAnnouncement({ groupId: formData.get("groupId"), courseId: formData.get("courseId"), title: formData.get("title"), body: formData.get("body") }); revalidatePath("/teacher/groups"); revalidatePath("/notifications"); return { ok: true, id }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}
