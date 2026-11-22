"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { createStudentDirectChat, createStudentGroupChat, sendStudentChatMessage, toggleStudentChatMute, toggleStudentChatPin, toggleStudentChatReaction } from "@/lib/campus/chat-service";

async function sameOrigin() {
  const h = await headers();
  return isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}
export async function startDirectChatAction(peerId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const chatId = await createStudentDirectChat(peerId); revalidatePath("/chats"); return { ok: true, chatId }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось открыть чат." }; }
}
export async function startGroupChatAction() {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const chatId = await createStudentGroupChat(); revalidatePath("/chats"); return { ok: true, chatId }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось открыть чат группы." }; }
}
export async function sendStudentMessageAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await sendStudentChatMessage({ chatId: formData.get("chatId"), body: formData.get("body"), replyToId: formData.get("replyToId") || undefined }); revalidatePath("/chats"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось отправить сообщение." }; }
}
export async function toggleChatReactionAction(messageId: string, reaction: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await toggleStudentChatReaction(messageId, reaction); revalidatePath("/chats"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось поставить реакцию." }; }
}
export async function toggleChatPinAction(messageId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await toggleStudentChatPin(messageId); revalidatePath("/chats"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось закрепить сообщение." }; }
}
export async function toggleChatMuteAction(chatId: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await toggleStudentChatMute(chatId); revalidatePath("/chats"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось изменить настройки чата." }; }
}
