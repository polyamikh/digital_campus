"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { PassRequestState } from "@/generated/prisma/enums";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { requestStudentPass, transitionDeanPassRequest } from "@/lib/campus/pass-service";

async function sameOrigin() {
  const h = await headers();
  return isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}

export async function requestStudentPassAction(kind: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const result = await requestStudentPass(kind); revalidatePath("/pass"); return { ok: true, created: result.created }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось отправить запрос." }; }
}

export async function deanPassTransitionAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  const requestId = String(formData.get("requestId") ?? "");
  const expectedVersion = Number(formData.get("version"));
  const nextState = String(formData.get("nextState") ?? "") as PassRequestState;
  const note = String(formData.get("note") ?? "");
  const rawExpiry = String(formData.get("expiresAt") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !Number.isInteger(expectedVersion) || !Object.values(PassRequestState).includes(nextState)) return { ok: false, error: "Проверьте данные запроса." };
  let expiresAt: Date | undefined;
  if (rawExpiry) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawExpiry)) return { ok: false, error: "Укажите дату в корректном формате." };
    expiresAt = new Date(`${rawExpiry}:00+03:00`);
    if (Number.isNaN(expiresAt.getTime())) return { ok: false, error: "Укажите корректную дату окончания." };
  }
  try { await transitionDeanPassRequest({ requestId, expectedVersion, nextState, note, expiresAt }); revalidatePath("/dean/passes"); revalidatePath("/pass"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось обновить запрос." }; }
}
