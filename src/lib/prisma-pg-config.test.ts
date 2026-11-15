import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaPgConfig, POSTGRES_SESSION_OPTIONS } from "./prisma-pg-config";

test("all PrismaPg pool connections receive a UTC PostgreSQL session startup option", () => {
  assert.deepEqual(createPrismaPgConfig("postgresql://example.invalid/demo"), {
    connectionString: "postgresql://example.invalid/demo",
    options: "-c timezone=UTC",
  });
  assert.equal(POSTGRES_SESSION_OPTIONS, "-c timezone=UTC");
});
