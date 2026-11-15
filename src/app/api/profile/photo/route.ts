import { Role } from "@/generated/prisma/enums";
import { ForbiddenRoleError, requireRole, UnauthenticatedError } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { MAX_PROFILE_PHOTO_BYTES, requireStudentPhotoOwner } from "@/lib/profile/profile-photo-core";
import { deleteProfilePhoto, readProfilePhoto, saveProfilePhoto } from "@/lib/profile/profile-photo-store";

const MAX_MULTIPART_BYTES = MAX_PROFILE_PHOTO_BYTES + 64 * 1024;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

class RequestBodyTooLargeError extends Error {}

async function sessionResponse(): Promise<string | Response> {
  try {
    return requireStudentPhotoOwner(await requireRole(Role.STUDENT));
  } catch (error) {
    if (error instanceof UnauthenticatedError) return Response.json({ error: "Требуется войти в кабинет студента." }, { status: 401, headers: PRIVATE_HEADERS });
    if (error instanceof ForbiddenRoleError || error instanceof Error && error.message === "Student session required") {
      return Response.json({ error: "Фотографию может менять только студент в своём кабинете." }, { status: 403, headers: PRIVATE_HEADERS });
    }
    return Response.json({ error: "Не удалось проверить сессию." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

function sameOrigin(request: Request): boolean {
  const headers = request.headers;
  return isSameOriginRequest(
    headers.get("origin"),
    headers.get("x-forwarded-host") ?? headers.get("host"),
    headers.get("x-forwarded-proto"),
    process.env.NODE_ENV === "production",
  );
}

async function readLimitedBody(request: Request): Promise<ArrayBuffer> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) throw new Error("Некорректный размер запроса.");
    if (length > MAX_MULTIPART_BYTES) throw new RequestBodyTooLargeError();
  }
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
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }
  const body = new ArrayBuffer(total);
  const output = new Uint8Array(body);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function GET(): Promise<Response> {
  const ownerId = await sessionResponse();
  if (ownerId instanceof Response) return ownerId;
  try {
    const photo = await readProfilePhoto(ownerId);
    if (!photo) return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
    const body = new ArrayBuffer(photo.bytes.byteLength);
    new Uint8Array(body).set(photo.bytes);
    return new Response(body, {
      status: 200,
      headers: { ...PRIVATE_HEADERS, "Content-Type": photo.mimeType, "Content-Disposition": "inline" },
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить фотографию." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Запрос отклонён. Обновите страницу и попробуйте ещё раз." }, { status: 403, headers: PRIVATE_HEADERS });
  const ownerId = await sessionResponse();
  if (ownerId instanceof Response) return ownerId;

  try {
    const body = await readLimitedBody(request);
    const formData = await new Request(request.url, { method: "POST", headers: request.headers, body }).formData();
    const keys = [...formData.keys()];
    const uploaded = formData.get("photo");
    if (keys.length !== 1 || keys[0] !== "photo" || !(uploaded instanceof File)) {
      return Response.json({ error: "Выберите один файл фотографии." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const bytes = new Uint8Array(await uploaded.arrayBuffer());
    await saveProfilePhoto(ownerId, bytes, uploaded.type || undefined);
    return Response.json({ ok: true }, { status: 200, headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: "Размер запроса превышает допустимый предел 5 МБ." }, { status: 413, headers: PRIVATE_HEADERS });
    }
    if (error instanceof Error && /^(Выберите|Размер фотографии|Поддерживаются|Тип файла)/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400, headers: PRIVATE_HEADERS });
    }
    if (error instanceof Error && error.message === "Некорректный размер запроса.") {
      return Response.json({ error: error.message }, { status: 400, headers: PRIVATE_HEADERS });
    }
    return Response.json({ error: "Не удалось сохранить фотографию." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Запрос отклонён. Обновите страницу и попробуйте ещё раз." }, { status: 403, headers: PRIVATE_HEADERS });
  const ownerId = await sessionResponse();
  if (ownerId instanceof Response) return ownerId;

  try {
    await deleteProfilePhoto(ownerId);
    return Response.json({ ok: true }, { status: 200, headers: PRIVATE_HEADERS });
  } catch {
    return Response.json({ error: "Не удалось удалить фотографию." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
