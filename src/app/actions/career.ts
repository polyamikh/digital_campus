"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { applyToCareerOpportunity, saveStudentCareerResume, setCareerEventRegistration, withdrawCareerApplication } from "@/lib/campus/career-service";
import { parseCareerEntries, validateCareerResumeInput } from "@/lib/campus/campus-core";

async function sameOrigin() {
  const h = await headers();
  return isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}

export async function applyCareerAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const coverLetter = String(formData.get("coverLetter") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(opportunityId) || coverLetter.length > 3000) return { ok: false, error: "Проверьте данные отклика." };
  try { await applyToCareerOpportunity(opportunityId, coverLetter); revalidatePath("/career"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось отправить отклик." }; }
}

export async function withdrawCareerAction(applicationId: string) {
  if (!(await sameOrigin()) || !/^[0-9a-f-]{36}$/i.test(applicationId)) return { ok: false, error: "Запрос отклонён." };
  try { await withdrawCareerApplication(applicationId); revalidatePath("/career"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось отозвать отклик." }; }
}

export async function saveCareerResumeAction(formData: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  const parsed = validateCareerResumeInput({ headline: formData.get("headline"), summary: formData.get("summary"), skills: formData.get("skills") });
  const entries = parseCareerEntries(formData.get("entries"));
  if (!parsed.ok || !entries.ok) return { ok: false, error: !parsed.ok ? parsed.error : !entries.ok ? entries.error : "Проверьте поля." };
  try { await saveStudentCareerResume({ headline: parsed.headline, summary: parsed.summary, skills: parsed.skills, entries: entries.entries }); revalidatePath("/career"); return { ok: true }; }
  catch { return { ok: false, error: "Не удалось сохранить резюме." }; }
}

export async function careerEventRegistrationAction(eventId: string, registered: boolean) {
  if (!(await sameOrigin()) || !/^[0-9a-f-]{36}$/i.test(eventId) || typeof registered !== "boolean") return { ok: false, error: "Запрос отклонён." };
  try { await setCareerEventRegistration(eventId, registered); revalidatePath("/career"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Не удалось обновить регистрацию." }; }
}
