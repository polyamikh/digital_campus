import assert from "node:assert/strict";
import { test } from "node:test";
import { teacherChatVisible } from "./teacher-chat-core";

test("teacher chat visibility is bounded to assigned groups and peers", () => {
  assert.equal(teacherChatVisible({ kind: "GROUP", chatGroupId: "g1", assignedGroupIds: ["g1"], participantGroupIds: [] }), true);
  assert.equal(teacherChatVisible({ kind: "GROUP", chatGroupId: "g2", assignedGroupIds: ["g1"], participantGroupIds: [] }), false);
  assert.equal(teacherChatVisible({ kind: "DIRECT", chatGroupId: null, assignedGroupIds: ["g1"], participantGroupIds: ["g1"] }), true);
  assert.equal(teacherChatVisible({ kind: "DIRECT", chatGroupId: null, assignedGroupIds: ["g1"], participantGroupIds: ["g2"] }), false);
  assert.equal(teacherChatVisible({ kind: "COURSE", chatGroupId: null, assignedGroupIds: ["g1"], participantGroupIds: ["g1"] }), false);
});
