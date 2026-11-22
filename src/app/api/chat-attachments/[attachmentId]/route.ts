import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { getChatAttachmentForCurrentStudent } from "@/lib/campus/chat-service";
import { readChatFile } from "@/lib/campus/chat-file-store";
import { courseworkContentDisposition } from "@/lib/coursework/coursework-file-store";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    await requireRole(Role.STUDENT); const { attachmentId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) return new Response(null, { status: 404, headers: privateHeaders });
    const attachment = await getChatAttachmentForCurrentStudent(attachmentId);
    if (!attachment) return new Response(null, { status: 404, headers: privateHeaders });
    const bytes = await readChatFile(attachment.objectKey); const body = new ArrayBuffer(bytes.byteLength); new Uint8Array(body).set(bytes);
    return new Response(body, { status: 200, headers: { ...privateHeaders, "Content-Type": attachment.mimeType, "Content-Length": String(bytes.byteLength), "Content-Disposition": courseworkContentDisposition(attachment.fileName) } });
  } catch { return Response.json({ error: "Не удалось получить вложение." }, { status: 404, headers: privateHeaders }); }
}
