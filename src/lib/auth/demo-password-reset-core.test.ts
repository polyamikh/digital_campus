import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { verifyPassword } from "./password";
import {
  collectDemoPasswords,
  hashDemoPassword,
  PASSWORD_RESET_APPROVAL,
  validateLocalDatabaseUrl,
} from "./demo-password-reset-core";

test("accepts only local PostgreSQL URL for the exact target database", () => {
  assert.deepEqual(validateLocalDatabaseUrl("postgresql://localhost:5432/digital_campus"), {
    host: "localhost",
    database: "digital_campus",
  });
  assert.equal(validateLocalDatabaseUrl("postgres://[::1]:5432/digital_campus").database, "digital_campus");
  assert.throws(() => validateLocalDatabaseUrl("postgresql://db.example:5432/digital_campus"));
  assert.throws(() => validateLocalDatabaseUrl("postgresql://127.0.0.1:5432/other_db"));
  assert.throws(() => validateLocalDatabaseUrl("postgresql://localhost:5432/digital_campus?host=db.example"));
  assert.throws(() => validateLocalDatabaseUrl("mysql://localhost/digital_campus"));
});

test("requires exact reset confirmation and all four passwords of at least 14 characters", () => {
  const generatedPassword = () => randomBytes(24).toString("base64url");
  const environment: Record<string, string | undefined> = {
    DIGITAL_CAMPUS_PASSWORD_RESET_APPROVED: PASSWORD_RESET_APPROVAL,
    DEMO_PASSWORD_SOKOLOVA_A: generatedPassword(),
    DEMO_PASSWORD_BELOVA_S: generatedPassword(),
    DEMO_PASSWORD_VOLKOVA_M: generatedPassword(),
    DEMO_PASSWORD_ORLOVA_E: generatedPassword(),
  };
  assert.equal(Object.keys(collectDemoPasswords(environment)).length, 4);
  assert.throws(() => collectDemoPasswords({ ...environment, DIGITAL_CAMPUS_PASSWORD_RESET_APPROVED: "no" }));
  assert.throws(() => collectDemoPasswords({ ...environment, DEMO_PASSWORD_ORLOVA_E: "x".repeat(13) }));
});

test("produces a seed-compatible scrypt hash without changing its parameters", async () => {
  const password = randomBytes(24).toString("base64url");
  const hash = await hashDemoPassword(password);
  assert.match(hash, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(randomBytes(24).toString("base64url"), hash), false);
});
