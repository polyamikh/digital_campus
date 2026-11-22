"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { CourseworkAccessError, CourseworkConflictError, CourseworkInputError, createMaterialFolder, createOrUpdateHomework, markCurrentTeacherHomeworkNotificationRead, publishHomework, publishTeacherMaterial, publishHomeworkGrade, removeTeacherMaterial, reviewStudentSubmission, saveStudentSubmission, saveTeacherMaterial } from "@/lib/coursework/coursework-service";

async function sameOrigin() {
  const h = await headers();
  return isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}
function result(error: unknown) {
  if (error instanceof CourseworkInputError || error instanceof CourseworkAccessError || error instanceof CourseworkConflictError) return { ok: false, error: error.message };
  return { ok: false, error: "Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз." };
}
const str = (data: FormData, key: string) => { const value = data.get(key); return typeof value === "string" ? value : null; };

export async function saveMaterialAction(data: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const groupIds = data.getAll("groupId").filter((value): value is string => typeof value === "string"); const resultValue = await saveTeacherMaterial({ materialId: str(data, "materialId"), expectedVersion: data.has("version") ? Number(str(data, "version")) : undefined, courseId: str(data, "courseId"), groupIds, folderId: str(data, "folderId"), title: str(data, "title"), description: str(data, "description"), externalUrl: str(data, "externalUrl") }); revalidatePath("/teacher/materials"); revalidatePath("/materials"); return { ok: true, error: null, id: resultValue.id }; } catch (error) { return result(error); }
}
export async function createMaterialFolderAction(data: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await createMaterialFolder({ courseId: str(data, "courseId"), groupId: str(data, "groupId"), name: str(data, "name") }); revalidatePath("/teacher/materials"); return { ok: true, error: null }; } catch (error) { return result(error); }
}
export async function publishMaterialAction(id: string, publish: boolean) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await publishTeacherMaterial(id, publish); revalidatePath("/teacher/materials"); revalidatePath("/materials"); revalidatePath("/notifications"); return { ok: true, error: null }; } catch (error) { return result(error); }
}
export async function removeMaterialAction(id: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const disposition = await removeTeacherMaterial(id); revalidatePath("/teacher/materials"); revalidatePath("/materials"); revalidatePath("/notifications"); return { ok: true, error: null, disposition }; } catch (error) { return result(error); }
}
export async function saveHomeworkAction(data: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const saved = await createOrUpdateHomework({ homeworkId: str(data, "homeworkId"), version: data.has("version") ? Number(str(data, "version")) : undefined, assignmentId: str(data, "assignmentId"), title: str(data, "title"), instructions: str(data, "instructions"), criteria: str(data, "criteria"), deadline: str(data, "deadline"), allowText: str(data, "allowText"), allowFile: str(data, "allowFile"), allowLink: str(data, "allowLink"), componentId: str(data, "componentId"), materialIds: data.getAll("materialId").filter((value): value is string => typeof value === "string") }); revalidatePath("/teacher/homework"); revalidatePath("/homework"); revalidatePath("/tasks"); return { ok: true, error: null, id: saved.id }; } catch (error) { return result(error); }
}
export async function publishHomeworkAction(id: string, publish: boolean) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await publishHomework(id, publish); revalidatePath("/teacher/homework"); revalidatePath("/homework"); revalidatePath("/tasks"); revalidatePath("/notifications"); revalidatePath("/grades"); return { ok: true, error: null }; } catch (error) { return result(error); }
}
export async function saveSubmissionAction(data: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { const saved = await saveStudentSubmission({ homeworkId: str(data, "homeworkId"), text: str(data, "text"), link: str(data, "link"), submit: str(data, "submit") === "true" }); revalidatePath("/homework"); revalidatePath(`/homework/${str(data, "homeworkId")}`); revalidatePath("/teacher/homework"); return { ok: true, error: null, id: saved.id }; } catch (error) { return result(error); }
}
export async function reviewSubmissionAction(data: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await reviewStudentSubmission({ submissionId: str(data, "submissionId"), revisionId: str(data, "revisionId"), decision: str(data, "decision"), comment: str(data, "comment"), score: str(data, "score") }); revalidatePath("/teacher/homework"); revalidatePath("/homework"); revalidatePath("/notifications"); revalidatePath("/grades"); return { ok: true, error: null }; } catch (error) { return result(error); }
}
export async function publishHomeworkGradeAction(data: FormData) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await publishHomeworkGrade({ submissionId: str(data, "submissionId"), revisionId: str(data, "revisionId") }); revalidatePath("/teacher/homework"); revalidatePath("/homework"); revalidatePath("/grades"); revalidatePath("/notifications"); return { ok: true, error: null }; } catch (error) { return result(error); }
}
export async function markTeacherHomeworkNotificationReadAction(id: string) {
  if (!(await sameOrigin())) return { ok: false, error: "Запрос отклонён." };
  try { await markCurrentTeacherHomeworkNotificationRead(id); revalidatePath("/teacher/notifications"); return { ok: true, error: null }; } catch (error) { return result(error); }
}
