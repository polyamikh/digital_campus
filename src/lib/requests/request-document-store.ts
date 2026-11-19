import "server-only";

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRequestDocumentPath } from "./request-document-core";

const ROOT = join(process.cwd(), ".private-data", "request-documents");

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

export async function savePrivateRequestDocument(objectKey: string, bytes: Uint8Array): Promise<void> {
  const path = resolveRequestDocumentPath(ROOT, objectKey);
  await ensurePrivateDirectory(ROOT);
  await ensurePrivateDirectory(join(ROOT, "requests"));
  const requestId = objectKey.split("/")[1];
  await ensurePrivateDirectory(join(ROOT, "requests", requestId));
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}

export async function readPrivateRequestDocument(objectKey: string): Promise<Buffer> {
  return readFile(resolveRequestDocumentPath(ROOT, objectKey));
}

export async function deletePrivateRequestDocument(objectKey: string): Promise<void> {
  await rm(resolveRequestDocumentPath(ROOT, objectKey), { force: true });
}
