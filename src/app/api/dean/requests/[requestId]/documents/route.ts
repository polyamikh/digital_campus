import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { ForbiddenRoleError, requireRole, UnauthenticatedError } from "@/lib/auth/session";
import { deletePrivateRequestDocument, savePrivateRequestDocument } from "@/lib/requests/request-document-store";
import { createRequestDocumentObjectKey, MAX_REQUEST_DOCUMENT_BYTES, validateRequestDocument } from "@/lib/requests/request-document-core";
import { completeServiceRequestWithDocument, RequestWorkflowConflictError, RequestWorkflowInputError } from "@/lib/requests/request-workflow";
import { Role } from "@/generated/prisma/enums";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MULTIPART_BYTES = MAX_REQUEST_DOCUMENT_BYTES + 64 * 1024;

function sameOrigin(request: Request): boolean {
  return isSameOriginRequest(
    request.headers.get("origin"),
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
    process.env.NODE_ENV === "production",
  );
}

async function limitedBody(request: Request): Promise<ArrayBuffer> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_MULTIPART_BYTES)) throw new Error("UPLOAD_TOO_LARGE");
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MULTIPART_BYTES) {
      await reader.cancel();
      throw new Error("UPLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body.buffer;
}

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Запрос отклонён. Обновите страницу и попробуйте снова." }, { status: 403, headers: RESPONSE_HEADERS });
  const { requestId } = await context.params;
  if (!UUID.test(requestId)) return Response.json({ error: "Заявка не найдена." }, { status: 404, headers: RESPONSE_HEADERS });
  try {
    await requireRole(Role.DEAN);
    const body = await limitedBody(request);
    const formData = await new Request(request.url, { method: "POST", headers: request.headers, body }).formData();
    const keys = [...formData.keys()];
    const file = formData.get("document");
    if (keys.length !== 1 || keys[0] !== "document" || !(file instanceof File)) {
      return Response.json({ error: "Выберите один PDF-документ." }, { status: 400, headers: RESPONSE_HEADERS });
    }
    const validated = validateRequestDocument(new Uint8Array(await file.arrayBuffer()), file.type || undefined, file.name);
    const objectKey = createRequestDocumentObjectKey(requestId);
    await savePrivateRequestDocument(objectKey, validated.bytes);
    try {
      await completeServiceRequestWithDocument(requestId, objectKey, validated.fileName, validated.bytes.byteLength);
    } catch (error) {
      await deletePrivateRequestDocument(objectKey).catch(() => undefined);
      throw error;
    }
    return Response.json({ ok: true }, { status: 201, headers: RESPONSE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === "UPLOAD_TOO_LARGE") return Response.json({ error: "Файл не должен превышать 10 МБ." }, { status: 413, headers: RESPONSE_HEADERS });
    if (error instanceof Error && /^(Выберите|Размер документа|Для результата|Содержимое файла)/.test(error.message)) return Response.json({ error: error.message }, { status: 400, headers: RESPONSE_HEADERS });
    if (error instanceof UnauthenticatedError) return Response.json({ error: "Войдите в кабинет деканата." }, { status: 401, headers: RESPONSE_HEADERS });
    if (error instanceof ForbiddenRoleError) return Response.json({ error: "Прикрепить документ может только сотрудник деканата." }, { status: 403, headers: RESPONSE_HEADERS });
    if (error instanceof RequestWorkflowInputError || error instanceof RequestWorkflowConflictError) return Response.json({ error: error.message }, { status: 409, headers: RESPONSE_HEADERS });
    return Response.json({ error: "Не удалось сохранить документ. Проверьте доступность приватного хранилища." }, { status: 500, headers: RESPONSE_HEADERS });
  }
}
