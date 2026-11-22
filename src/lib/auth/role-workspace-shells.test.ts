import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("teacher and dean shells share the persisted campus theme control", async () => {
  const [teacher, dean, theme] = await Promise.all([
    readFile(new URL("../../app/teacher/teacher-app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/dean/dean-app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/campus-theme-toggle.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(teacher, /<CampusThemeToggle\s*\/>/);
  assert.match(dean, /<CampusThemeToggle\s*\/>/);
  assert.match(theme, /digital-campus-theme/);
  assert.match(theme, /localStorage\.setItem/);
});

test("dean queue routes use the shared role shell and theme styles exclude student pages", async () => {
  const [requests, passes, styles] = await Promise.all([
    readFile(new URL("../../app/dean/requests/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/dean/passes/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/role-workspace-design.css", import.meta.url), "utf8"),
  ]);

  assert.match(requests, /<DeanAppShell active="\/dean\/requests">/);
  assert.match(passes, /<DeanAppShell active="\/dean\/passes">/);
  assert.doesNotMatch(styles, /\.student-app-shell/);
  assert.match(styles, /html\[data-campus-theme="light"\] \.dean-app-shell/);
  assert.match(styles, /html\[data-campus-theme="light"\] \.teacher-app-shell/);
});
