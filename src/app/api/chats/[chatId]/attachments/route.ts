import { randomUUID } from "node:crypto";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { createChatAttachmentMessage } from "@/lib/campus/chat-service";
import { deleteChatFile, saveChatFile } from "@/lib/campus/chat-file-store";
import { validateCourseworkUpload } from "@/lib/coursework/coursework-core";
import { readCourseworkFormData } from "@/lib/coursework/coursework-http";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  if (!isSameOriginRequest(request.headers.get("origin"), request.headers.get("x-forwarded-host") ?? request.headers.get("host"), request.headers.get("x-forwarded-proto"), process.env.NODE_ENV === "production")) return Response.json({ error: "Запрос отклонён." }, { status: 403, headers: privateHeaders });
  try {
    await requireRole(Role.STUDENT); const { chatId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(chatId)) return Response.json({ error: "Чат не найден." }, { status: 404, headers: privateHeaders });
    const form = await readCourseworkFormData(request, 21 * 1024 * 1024); const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Выберите файл." }, { status: 400, headers: privateHeaders });
    const bytes = new Uint8Array(await file.arrayBuffer()); const checked = validateCourseworkUpload(bytes, file.type);
    if (!checked.ok) return Response.json({ error: checked.reason }, { status: 400, headers: privateHeaders });
    const id = randomUUID(); const objectKey = `chats/${chatId}/${id}.${checked.extension}`;
    await saveChatFile(objectKey, bytes);
    try {
      await createChatAttachmentMessage({ chatId, body: String(form.get("body") ?? "").slice(0, 4000), replyToId: form.get("replyToId") || undefined, objectKey, fileName: file.name.slice(0, 255) || `attachment.${checked.extension}`, mimeType: checked.mimeType, byteSize: bytes.byteLength });
      return Response.json({ ok: true }, { status: 201, headers: privateHeaders });
    } catch (error) { await deleteChatFile(objectKey); return Response.json({ error: error instanceof Error ? error.message : "Не удалось отправить файл." }, { status: 403, headers: privateHeaders }); }
  } catch (error) { return Response.json({ error: error instanceof RangeError ? "Максимальный размер файла — 20 МБ." : "Не удалось загрузить вложение." }, { status: error instanceof RangeError ? 413 : 400, headers: privateHeaders }); }
}
