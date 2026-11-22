import "server-only";

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const root = join(process.cwd(), ".private-data", "chats");
export function chatFilePath(key: string) {
  if (!/^chats\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|txt|jpg|png|webp)$/i.test(key)) throw new Error("Invalid chat file key");
  const base = resolve(root); const target = resolve(process.cwd(), ".private-data", key);
  if (!target.startsWith(`${base}${sep}`)) throw new Error("Invalid private chat path");
  return target;
}
export async function saveChatFile(key: string, bytes: Uint8Array) {
  const path = chatFilePath(key); const directory = join(root, key.split("/")[1]!);
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(root, 0o700).catch(() => undefined); await chmod(directory, 0o700);
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}
export async function readChatFile(key: string) { return readFile(chatFilePath(key)); }
export async function deleteChatFile(key: string) { await rm(chatFilePath(key), { force: true }); }
