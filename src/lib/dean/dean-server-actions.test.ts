import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("dean form callbacks are explicitly declared as Server Actions", async () => {
  const source = await readFile(new URL("../../app/dean/dean-workspace-page.tsx", import.meta.url), "utf8");

  assert.match(source, /action=\{async \(formData\) => \{ "use server"; await updateDeanProfileAction\(formData\); \}\}/);
  assert.doesNotMatch(source, /action=\{async(?!\s*\([^)]*\)\s*=>\s*\{\s*"use server";)/);
});
