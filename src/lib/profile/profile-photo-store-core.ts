import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectProfilePhotoFormat, type ProfilePhotoFormat } from "./profile-photo-core";

const PRIVATE_PHOTO_ROOT = join(process.cwd(), ".private-data", "profile-photos");
const FORMAT_BY_EXTENSION: Record<ProfilePhotoFormat["extension"], ProfilePhotoFormat["mimeType"]> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type PhotoManifest = { fileName: string; mimeType: ProfilePhotoFormat["mimeType"] };
export type ProfilePhotoMetadata = PhotoManifest & { version: number };

function userDirectory(userId: string, root = PRIVATE_PHOTO_ROOT): string {
  const digest = createHash("sha256").update(`digital-campus-profile-photo\0${userId}`).digest("hex");
  return join(root, digest);
}

function isManifest(value: unknown): value is PhotoManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Record<string, unknown>;
  if (typeof manifest.fileName !== "string" || typeof manifest.mimeType !== "string") return false;
  const match = /^avatar-[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(manifest.fileName);
  if (!match) return false;
  const extension = match[1] as ProfilePhotoFormat["extension"];
  return FORMAT_BY_EXTENSION[extension] === manifest.mimeType;
}

async function readManifest(userId: string, root = PRIVATE_PHOTO_ROOT): Promise<PhotoManifest | null> {
  try {
    const raw = await readFile(join(userDirectory(userId, root), "current.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getProfilePhotoMetadata(userId: string, root = PRIVATE_PHOTO_ROOT): Promise<ProfilePhotoMetadata | null> {
  const manifest = await readManifest(userId, root);
  if (!manifest) return null;
  try {
    const file = await stat(join(userDirectory(userId, root), manifest.fileName));
    if (!file.isFile()) return null;
    return { ...manifest, version: file.mtimeMs };
  } catch {
    return null;
  }
}

export async function readProfilePhoto(userId: string, root = PRIVATE_PHOTO_ROOT): Promise<{ bytes: Buffer; mimeType: ProfilePhotoFormat["mimeType"] } | null> {
  const metadata = await getProfilePhotoMetadata(userId, root);
  if (!metadata) return null;
  try {
    return { bytes: await readFile(join(userDirectory(userId, root), metadata.fileName)), mimeType: metadata.mimeType };
  } catch {
    return null;
  }
}

export async function deleteProfilePhoto(userId: string, root = PRIVATE_PHOTO_ROOT): Promise<boolean> {
  const directory = userDirectory(userId, root);
  const manifest = await readManifest(userId, root);
  if (!manifest) return false;

  await rm(join(directory, "current.json"), { force: true });
  await rm(join(directory, manifest.fileName), { force: true });
  return true;
}

export async function saveProfilePhoto(userId: string, bytes: Uint8Array, declaredMimeType?: string, root = PRIVATE_PHOTO_ROOT): Promise<ProfilePhotoMetadata> {
  const format = detectProfilePhotoFormat(bytes, declaredMimeType);
  const directory = userDirectory(userId, root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);

  const previous = await readManifest(userId, root);
  const fileName = `avatar-${randomUUID()}.${format.extension}`;
  const finalPath = join(directory, fileName);
  const temporaryManifestPath = join(directory, `.current-${randomUUID()}.tmp`);
  const manifest: PhotoManifest = { fileName, mimeType: format.mimeType };
  await writeFile(finalPath, bytes, { flag: "wx", mode: 0o600 });
  try {
    await writeFile(temporaryManifestPath, JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
    await rename(temporaryManifestPath, join(directory, "current.json"));
  } catch (error) {
    await Promise.all([rm(finalPath, { force: true }), rm(temporaryManifestPath, { force: true })]);
    throw error;
  }

  if (previous && previous.fileName !== fileName) await rm(join(directory, previous.fileName), { force: true });
  const files = await readdir(directory);
  await Promise.all(files
    .filter((entry) => entry.startsWith(".current-") && entry.endsWith(".tmp"))
    .map((entry) => rm(join(directory, entry), { force: true })));
  const file = await stat(finalPath);
  return { ...manifest, version: file.mtimeMs };
}
