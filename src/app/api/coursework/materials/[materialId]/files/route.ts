import { randomUUID } from "node:crypto";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { attachTeacherMaterialFile, CourseworkAccessError } from "@/lib/coursework/coursework-service";
import { saveCourseworkFile, deleteCourseworkFile } from "@/lib/coursework/coursework-file-store";
import { validateCourseworkUpload } from "@/lib/coursework/coursework-core";
import { readCourseworkFormData } from "@/lib/coursework/coursework-http";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request, context: { params: Promise<{ materialId: string }> }) {
  if (!isSameOriginRequest(request.headers.get("origin"), request.headers.get("x-forwarded-host") ?? request.headers.get("host"), request.headers.get("x-forwarded-proto"), process.env.NODE_ENV === "production")) return Response.json({ error: "Запрос отклонён." }, { status: 403, headers: privateHeaders });
  try {
    await requireRole(Role.TEACHER);
    const { materialId } = await context.params;
    const form = await readCourseworkFormData(request, 21 * 1024 * 1024); const file = form.get("file"); if (!(file instanceof File) || form.getAll("file").length !== 1) return Response.json({ error: "Выберите один файл." }, { status: 400, headers: privateHeaders });
    const bytes = new Uint8Array(await file.arrayBuffer()); const checked = validateCourseworkUpload(bytes, file.type);
    if (!checked.ok) return Response.json({ error: checked.reason }, { status: 400, headers: privateHeaders });
    const fileId = randomUUID(); const objectKey = `materials/${materialId}/${fileId}.${checked.extension}`;
    await saveCourseworkFile(objectKey, bytes);
    try {
      await attachTeacherMaterialFile({ materialId, objectKey, fileName: file.name.slice(0, 255) || `material.${checked.extension}`, mimeType: checked.mimeType, byteSize: bytes.byteLength });
    } catch (error) { await deleteCourseworkFile(objectKey); if (error instanceof CourseworkAccessError) return Response.json({ error: error.message }, { status: 403, headers: privateHeaders }); throw error; }
    return Response.json({ ok: true }, { status: 201, headers: privateHeaders });
  } catch (error) { return Response.json({ error: error instanceof RangeError ? "Максимальный размер — 20 МБ." : "Не удалось сохранить файл материала." }, { status: error instanceof RangeError ? 413 : 400, headers: privateHeaders }); }
}
