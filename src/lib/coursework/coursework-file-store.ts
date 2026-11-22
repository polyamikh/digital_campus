import "server-only";

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { isSafeCourseworkObjectKey } from "./coursework-core";

const root = join(process.cwd(), ".private-data", "coursework");
export function resolveCourseworkFilePath(key: string): string {
  if (!isSafeCourseworkObjectKey(key)) throw new Error("Invalid private coursework file key");
  const base = resolve(root); const target = resolve(base, key);
  if (!target.startsWith(`${base}${sep}`)) throw new Error("Invalid private coursework file path");
  return target;
}
async function ensure(path: string) { await mkdir(path, { recursive: true, mode: 0o700 }); await chmod(path, 0o700); }
export async function saveCourseworkFile(key: string, bytes: Uint8Array) {
  const path = resolveCourseworkFilePath(key); await ensure(root); await ensure(join(root, key.split("/")[0]!)); await ensure(join(root, key.split("/")[0]!, key.split("/")[1]!));
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}
export async function readCourseworkFile(key: string) { return readFile(resolveCourseworkFilePath(key)); }
export async function deleteCourseworkFile(key: string) { await rm(resolveCourseworkFilePath(key), { force: true }); }
export function safeCourseworkDownloadName(name: string) { return basename(name).replace(/[^\x20-\x7E]|[\r\n"\\]/g, "_").slice(0, 180) || "file"; }
export function courseworkContentDisposition(name: string) { return `attachment; filename="${safeCourseworkDownloadName(name)}"; filename*=UTF-8''${encodeURIComponent(basename(name)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`; }
