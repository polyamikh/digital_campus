export async function readCourseworkFormData(request: Request, maxBytes: number): Promise<FormData> {
  const rawLength = request.headers.get("content-length");
  if (rawLength !== null) { const length = Number(rawLength); if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) throw new RangeError("UPLOAD_TOO_LARGE"); }
  if (!request.body) return new FormData();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new RangeError("UPLOAD_TOO_LARGE"); } chunks.push(value); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body = new ArrayBuffer(total); new Uint8Array(body).set(bytes);
  return new Request(request.url, { method: request.method, headers: request.headers, body }).formData();
}
