import assert from "node:assert/strict";
import test from "node:test";
import { detectDeanScheduleConflicts, publishedScoreSummary } from "./dean-core";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 22, 9, minute));
const row = (id: string, starts: number, ends: number, overrides: Partial<Parameters<typeof detectDeanScheduleConflicts>[0][number]> = {}) => ({ id, groupId: `g-${id}`, groupCode: `G-${id}`, roomId: null, roomCode: null, startsAt: at(starts), endsAt: at(ends), staffIds: [], ...overrides });

test("dean schedule conflicts detect group, room, teacher, examiner and substitute overlap", () => {
  const rows = [
    row("a", 0, 80, { groupId: "g", groupCode: "G1", roomId: "r", roomCode: "R1", staffIds: ["teacher"] }),
    row("b", 30, 90, { groupId: "g", groupCode: "G1", roomId: "r", roomCode: "R1", staffIds: ["examiner", "teacher"] }),
    row("c", 30, 90, { staffIds: ["examiner"] }),
  ];
  const result = detectDeanScheduleConflicts(rows);
  assert.equal(result.length, 4);
  assert.ok(result.some((entry) => entry.resource === "группа G1"));
  assert.ok(result.some((entry) => entry.resource === "аудитория R1"));
  assert.ok(result.some((entry) => entry.resource === "сотрудник teacher"));
  assert.ok(result.some((entry) => entry.resource === "сотрудник examiner"));
});

test("touching schedule intervals do not conflict", () => {
  assert.deepEqual(detectDeanScheduleConflicts([row("a", 0, 80, { groupId: "same", roomId: "same", staffIds: ["same"] }), row("b", 80, 160, { groupId: "same", roomId: "same", staffIds: ["same"] })]), []);
});

test("analytics average only accepts actual published 0–100 scores", () => {
  assert.deepEqual(publishedScoreSummary([50, 75, -1, 101, Number.NaN]), { count: 2, average: 62.5 });
  assert.deepEqual(publishedScoreSummary([]), { count: 0, average: null });
});
