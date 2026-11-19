import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createRequestDocumentObjectKey, MAX_REQUEST_DOCUMENT_BYTES, resolveRequestDocumentPath, validateRequestDocument } from "./request-document-core";

const pdf = new TextEncoder().encode("%PDF-1.7\ncontent");
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("only PDF signatures within the configured size are accepted", () => {
  assert.equal(validateRequestDocument(pdf, "application/pdf", "result.pdf").mimeType, "application/pdf");
  assert.throws(() => validateRequestDocument(new TextEncoder().encode("not a pdf"), "application/pdf", "bad.pdf"), /не является PDF/);
  assert.throws(() => validateRequestDocument(pdf, "text/plain", "bad.txt"), /только PDF/);
  assert.throws(() => validateRequestDocument(new Uint8Array(MAX_REQUEST_DOCUMENT_BYTES + 1), undefined, "large.pdf"), /10 МБ/);
});

test("private object keys are generated and resolved only under the private root", () => {
  const key = createRequestDocumentObjectKey(requestId);
  assert.match(key, new RegExp(`^requests/${requestId}/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(resolveRequestDocumentPath("/private/docs", key), join("/private/docs", key));
  assert.throws(() => resolveRequestDocumentPath("/private/docs", "../../secret"), /Invalid private document key/);
  assert.throws(() => createRequestDocumentObjectKey("../../request"), /Invalid request document identity/);
});
