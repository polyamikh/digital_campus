import { randomUUID } from "node:crypto";
import { basename, isAbsolute, join, resolve, sep } from "node:path";

export const MAX_REQUEST_DOCUMENT_BYTES = 10 * 1024 * 1024;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export type ValidatedRequestDocument = { fileName: string; mimeType: "application/pdf"; bytes: Uint8Array };

export function validateRequestDocument(bytes: Uint8Array, declaredMimeType: string | undefined, originalName: string): ValidatedRequestDocument {
  if (!bytes.byteLength) throw new Error("Выберите непустой PDF-файл.");
  if (bytes.byteLength > MAX_REQUEST_DOCUMENT_BYTES) throw new Error("Размер документа не должен превышать 10 МБ.");
  if (declaredMimeType && declaredMimeType !== "application/pdf") throw new Error("Для результата заявки поддерживаются только PDF-документы.");
  if (bytes.byteLength < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("Содержимое файла не является PDF-документом.");
  }
  const leaf = basename(originalName.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const safeStem = leaf.replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N} ._()-]/gu, "_").trim().slice(0, 180);
  return { fileName: `${safeStem || "Документ"}.pdf`, mimeType: "application/pdf", bytes };
}

export function createRequestDocumentObjectKey(requestId: string, artifactId = randomUUID()): string {
  if (!new RegExp(`^${UUID}$`, "i").test(requestId) || !new RegExp(`^${UUID}$`, "i").test(artifactId)) {
    throw new Error("Invalid request document identity");
  }
  return `requests/${requestId}/${artifactId}.pdf`;
}

export function resolveRequestDocumentPath(root: string, objectKey: string): string {
  if (!new RegExp(`^requests/${UUID}/${UUID}\\.pdf$`, "i").test(objectKey)) throw new Error("Invalid private document key");
  const base = resolve(root);
  const target = resolve(base, objectKey);
  if (isAbsolute(objectKey) || (target !== base && !target.startsWith(`${base}${sep}`))) throw new Error("Invalid private document path");
  return join(base, objectKey);
}
