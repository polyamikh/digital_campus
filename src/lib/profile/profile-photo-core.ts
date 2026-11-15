import { Role, type Role as RoleType } from "@/generated/prisma/enums";

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export type ProfilePhotoFormat = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

export type ProfilePhotoIdentity = { id: string; activeRole: RoleType };

export function requireStudentPhotoOwner(identity: ProfilePhotoIdentity | null): string {
  if (!identity || identity.activeRole !== Role.STUDENT) throw new Error("Student session required");
  return identity.id;
}

export function detectProfilePhotoFormat(bytes: Uint8Array, declaredMimeType?: string): ProfilePhotoFormat {
  if (bytes.byteLength === 0) throw new Error("Выберите непустое изображение.");
  if (bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) throw new Error("Размер фотографии не должен превышать 5 МБ.");

  let format: ProfilePhotoFormat | null = null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    format = { mimeType: "image/jpeg", extension: "jpg" };
  } else if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    format = { mimeType: "image/png", extension: "png" };
  } else if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    format = { mimeType: "image/webp", extension: "webp" };
  }

  if (!format) throw new Error("Поддерживаются только изображения JPG, PNG и WebP.");
  if (declaredMimeType && declaredMimeType !== format.mimeType) {
    throw new Error("Тип файла не совпадает с содержимым изображения.");
  }
  return format;
}
