import assert from "node:assert/strict";
import { test } from "node:test";
import { Role } from "@/generated/prisma/enums";
import { homePathForRole } from "./role-routes";

test("maps each authenticated role only to its own home", () => {
  assert.equal(homePathForRole(Role.STUDENT), "/");
  assert.equal(homePathForRole(Role.TEACHER), "/teacher");
  assert.equal(homePathForRole(Role.DEAN), "/dean");
});
