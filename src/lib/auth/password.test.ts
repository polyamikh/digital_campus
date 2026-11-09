import assert from "node:assert/strict";
import { randomBytes, scrypt } from "node:crypto";
import { test } from "node:test";
import { verifyPassword } from "./password";

async function seedFormatHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

test("accepts password matching the seed scrypt format", async () => {
  const password = randomBytes(24).toString("base64url");
  const hash = await seedFormatHash(password);
  assert.equal(await verifyPassword(password, hash), true);
});

test("rejects an incorrect password", async () => {
  const password = randomBytes(24).toString("base64url");
  const incorrectPassword = randomBytes(24).toString("base64url");
  const hash = await seedFormatHash(password);
  assert.equal(await verifyPassword(incorrectPassword, hash), false);
});

test("rejects malformed or unsupported scrypt encodings", async () => {
  const candidate = randomBytes(24).toString("base64url");
  assert.equal(await verifyPassword(candidate, "not-a-hash"), false);
  assert.equal(await verifyPassword(candidate, "scrypt$16384$8$1$YQ$Yg"), false);
  assert.equal(await verifyPassword(candidate, "scrypt$32768$8$1$not_base64!$also_invalid"), false);
});
