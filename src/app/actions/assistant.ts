"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { sendAssistantMessage } from "@/lib/campus/assistant-service";

export async function sendAssistantMessageAction(formData: FormData) {
  const h = await headers();
  if (!isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production")) return { ok: false, error: "Запрос отклонён." };
  const mode = String(formData.get("mode") ?? "STUDY_PLANNER");
  const question = String(formData.get("question") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "") || undefined;
  if (!(["STUDY_PLANNER", "CAREER_ASSISTANT"].includes(mode))) return { ok: false, error: "Неизвестный режим помощника." };
  try { const id = await sendAssistantMessage({ mode: mode as "STUDY_PLANNER" | "CAREER_ASSISTANT", question, conversationId }); revalidatePath("/assistant"); return { ok: true, conversationId: id }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось отправить сообщение." }; }
}
