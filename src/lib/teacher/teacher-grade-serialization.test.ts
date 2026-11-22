import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { serializeTeacherGradebook } from "./teacher-grade-serialization";

test("serializes Decimal values throughout the gradebook DTO, including nested revisions", () => {
  const gradebook = {
    structures: [{ weights: [{ maximumPoints: new Prisma.Decimal("36.10") }] }],
    assessments: [{
      entries: [{
        score: "91.25",
        pendingScore: null,
        currentRevision: { score: new Prisma.Decimal("91.25"), publishedAt: new Date("2026-11-22T10:00:00Z") },
        revisions: [{ score: new Prisma.Decimal("87.50"), reason: "Исправление" }],
      }],
    }],
  };

  const result = serializeTeacherGradebook(gradebook);
  const json = JSON.stringify(result);
  const roundTrip = JSON.parse(json) as typeof result;

  assert.equal(roundTrip.structures[0].weights[0].maximumPoints, "36.1");
  assert.equal(roundTrip.assessments[0].entries[0].score, "91.25");
  assert.equal(roundTrip.assessments[0].entries[0].currentRevision.score, "91.25");
  assert.equal(roundTrip.assessments[0].entries[0].revisions[0].score, "87.5");
  assert.equal(roundTrip.assessments[0].entries[0].currentRevision.publishedAt, "2026-11-22T10:00:00.000Z");
});
