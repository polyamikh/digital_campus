import assert from "node:assert/strict";
import test from "node:test";
import {
  EXAM_DURATIONS_MINUTES,
  findScheduleConflicts,
  isLessonScheduleValid,
  lessonScheduleViolation,
  validateScheduleProposal,
  type LessonScheduleCandidate,
} from "./lesson-rules";

const moscow = (date: string, time: string) => new Date(`${date}T${time}:00.000+03:00`);

function candidate(overrides: Partial<LessonScheduleCandidate> = {}): LessonScheduleCandidate {
  return {
    id: "lesson-a",
    kind: "CLASS",
    state: "SCHEDULED",
    startsAt: moscow("2026-11-09", "19:00"),
    endsAt: moscow("2026-11-09", "20:20"),
    groupId: "group-a",
    roomId: "room-a",
    teacherId: "teacher-a",
    substituteId: null,
    examinerId: null,
    ...overrides,
  };
}

test("accepts all approved weekday and Saturday class slots at exactly 80 minutes", () => {
  const slots = [
    ["2026-11-09", "19:00", "20:20"],
    ["2026-11-09", "20:30", "21:50"],
    ["2026-11-14", "10:35", "11:55"],
    ["2026-11-14", "12:55", "14:15"],
    ["2026-11-14", "14:30", "15:50"],
  ] as const;
  for (const [date, start, end] of slots) {
    assert.equal(isLessonScheduleValid("CLASS", moscow(date, start), moscow(date, end)), true, `${date} ${start}-${end}`);
  }
});

test("rejects class times outside the slots, on Sundays, or with a non-80-minute duration", () => {
  assert.ok(lessonScheduleViolation("CLASS", moscow("2026-11-09", "19:00"), moscow("2026-11-09", "20:00")));
  assert.ok(lessonScheduleViolation("CLASS", moscow("2026-11-09", "20:20"), moscow("2026-11-09", "21:40")));
  assert.ok(lessonScheduleViolation("CLASS", moscow("2026-11-08", "19:00"), moscow("2026-11-08", "20:20")));
  assert.ok(lessonScheduleViolation("CLASS", moscow("2026-11-14", "11:00"), moscow("2026-11-14", "12:20")));
});

test("preserves the approved 10-minute weekday and 60-minute Saturday breaks", () => {
  assert.equal(moscow("2026-11-09", "20:30").getTime() - moscow("2026-11-09", "20:20").getTime(), 10 * 60_000);
  assert.equal(moscow("2026-11-14", "12:55").getTime() - moscow("2026-11-14", "11:55").getTime(), 60 * 60_000);
  assert.equal(moscow("2026-11-14", "14:30").getTime() - moscow("2026-11-14", "14:15").getTime(), 15 * 60_000);
});

test("accepts only 80, 120 and 180 minute exams inside the correct windows", () => {
  assert.deepEqual(EXAM_DURATIONS_MINUTES, [80, 120, 180]);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-09", "19:00"), moscow("2026-11-09", "20:20")), true);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-09", "19:00"), moscow("2026-11-09", "21:00")), true);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-09", "19:00"), moscow("2026-11-09", "22:00")), false);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-14", "10:35"), moscow("2026-11-14", "13:35")), true);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-14", "13:10"), moscow("2026-11-14", "15:10")), true);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-14", "14:30"), moscow("2026-11-14", "15:50")), true);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-14", "14:00"), moscow("2026-11-14", "16:00")), false);
  assert.equal(isLessonScheduleValid("EXAM", moscow("2026-11-08", "19:00"), moscow("2026-11-08", "20:20")), false);
});

test("checks conflicts by group, room, teacher, substitute and examiner, but permits gaps", () => {
  const base = candidate();
  const overlap = candidate({ id: "lesson-b", teacherId: "teacher-b" });
  assert.deepEqual(findScheduleConflicts([base, overlap]).map((row) => row.resource), ["group", "room"]);
  assert.equal(findScheduleConflicts([base, candidate({ id: "lesson-c", startsAt: moscow("2026-11-09", "20:30"), endsAt: moscow("2026-11-09", "21:50"), groupId: "group-b", roomId: "room-b", teacherId: "teacher-a" })]).length, 0);
  assert.ok(findScheduleConflicts([base, candidate({ id: "lesson-d", groupId: "group-b", roomId: "room-b", teacherId: "teacher-a" })]).some((row) => row.resource === "staff"));
  assert.ok(findScheduleConflicts([
    candidate({ teacherId: "teacher-x", substituteId: "substitute-a" }),
    candidate({ id: "lesson-e", teacherId: "teacher-y", substituteId: "substitute-a", groupId: "group-b", roomId: "room-b" }),
  ]).some((row) => row.resourceId === "substitute-a"));
  assert.ok(findScheduleConflicts([
    candidate({ examinerId: "teacher-x" }),
    candidate({ id: "lesson-f", teacherId: "teacher-x", groupId: "group-b", roomId: "room-b" }),
  ]).some((row) => row.resource === "staff"));
});

test("schedule proposal validation reuses exact time rules and resource conflict checks", () => {
  const current = candidate();
  const other = candidate({
    id: "lesson-other",
    groupId: "group-a",
    roomId: "room-other",
    teacherId: "teacher-other",
    startsAt: moscow("2026-11-09", "20:30"),
    endsAt: moscow("2026-11-09", "21:50"),
  });
  const proposal = validateScheduleProposal(current, {
    startsAt: moscow("2026-11-09", "20:30"),
    endsAt: moscow("2026-11-09", "21:50"),
  }, [current, other]);
  assert.equal(proposal.candidate?.startsAt.toISOString(), moscow("2026-11-09", "20:30").toISOString());
  assert.ok(proposal.conflicts.some((conflict) => conflict.resource === "group"));
  assert.throws(() => validateScheduleProposal(current, {
    startsAt: moscow("2026-11-09", "19:15"),
    endsAt: moscow("2026-11-09", "20:35"),
  }, []), /слоту/);
  assert.equal(validateScheduleProposal(current, { cancelled: true }, [other]).candidate, null);
});

test("cancelled and completed lessons do not reserve schedule resources", () => {
  assert.deepEqual(findScheduleConflicts([
    candidate({ state: "CANCELLED" }),
    candidate({ id: "lesson-completed", state: "COMPLETED" }),
  ]), []);
});
