import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildServiceRequestCreationPlan,
  calculateServiceRequestSla,
  OfficialCalendarUnavailableError,
  parseNewServiceRequestInput,
  REQUEST_SLA_WORKING_DAYS,
  ServiceRequestInputError,
  serviceRequestOwnerScope,
  type OfficialCalendarDay,
  type OfficialCalendarYear,
} from "./service-request-core";

function calendar(year: number, nonWorking: string[] = [], overrides: Record<string, "WORKING" | "NON_WORKING"> = {}): OfficialCalendarYear {
  const days: OfficialCalendarDay[] = [];
  const date = new Date(Date.UTC(year, 0, 1));
  while (date.getUTCFullYear() === year) {
    const key = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    const kind = overrides[key] ?? (weekday === 0 || weekday === 6 || nonWorking.includes(key) ? "NON_WORKING" : "WORKING");
    days.push({ date: key, kind });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return {
    id: `calendar-${year}`,
    year,
    sourceName: `Официальный календарь ${year}`,
    sourceUrl: `https://example.test/calendar/${year}`,
    verifiedAt: new Date(`${year}-01-01T00:00:00.000Z`),
    days,
  };
}

test("six approved categories have their agreed SLA durations", () => {
  assert.deepEqual(REQUEST_SLA_WORKING_DAYS, {
    STUDY_CERTIFICATE: 3,
    STUDY_PERIOD_CERTIFICATE: 3,
    GRADE_TRANSCRIPT: 3,
    ACADEMIC_QUESTION: 5,
    PERSONAL_DATA_CORRECTION: 5,
    OTHER: 5,
  });
  assert.throws(() => parseNewServiceRequestInput({ category: "OTHER", title: " ", body: "Текст" }), ServiceRequestInputError);
  assert.throws(() => parseNewServiceRequestInput({ category: "OTHER", title: "Тема", body: " " }), ServiceRequestInputError);
});

test("new request input is trimmed and ignores forged owner fields", () => {
  assert.deepEqual(parseNewServiceRequestInput({
    category: "ACADEMIC_QUESTION", title: "  Вопрос  ", body: "  Описание  ", studentId: "another-user", groupId: "other-group",
  }), { category: "ACADEMIC_QUESTION", title: "Обращение по учебному вопросу", body: "Обращение по учебному вопросу. Подробности можно уточнить при обработке заявки." });
  assert.deepEqual(parseNewServiceRequestInput({ category: "STUDY_CERTIFICATE", title: "подмена", body: "подмена" }), {
    category: "STUDY_CERTIFICATE", title: "Справка об обучении", body: "Запрос на получение справки об обучении.",
  });
  assert.deepEqual(parseNewServiceRequestInput({ category: "STUDY_CERTIFICATE" }), {
    category: "STUDY_CERTIFICATE", title: "Справка об обучении", body: "Запрос на получение справки об обучении.",
  });
  for (const category of ["STUDY_PERIOD_CERTIFICATE", "GRADE_TRANSCRIPT", "ACADEMIC_QUESTION", "PERSONAL_DATA_CORRECTION"] as const) {
    const standardRequest = parseNewServiceRequestInput({ category });
    assert.ok(standardRequest.title.length > 0);
    assert.ok(standardRequest.body.length > 0);
  }
  assert.deepEqual(parseNewServiceRequestInput({ category: "OTHER", title: "  Мой запрос  ", body: "  Подробности  " }), {
    category: "OTHER", title: "Мой запрос", body: "Подробности",
  });
  assert.deepEqual(serviceRequestOwnerScope("session-student"), { studentId: "session-student" });
});

test("request creation plan keeps the session student as owner and records initial status history", () => {
  const studentId = "authenticated-student";
  const submittedAt = new Date("2026-11-06T12:00:00.000Z");
  const input = parseNewServiceRequestInput({ category: "ACADEMIC_QUESTION", title: "Вопрос", body: "Описание", studentId: "forged" });
  const sla = calculateServiceRequestSla(submittedAt, input.category, [calendar(2026)]);
  const plan = buildServiceRequestCreationPlan(studentId, input, submittedAt, sla);
  assert.equal(plan.request.studentId, studentId);
  assert.equal(plan.request.state, "SUBMITTED");
  assert.equal(plan.request.slaWorkingDays, 5);
  assert.equal(plan.initialHistory.actorId, studentId);
  assert.equal(plan.initialHistory.fromState, null);
  assert.equal(plan.initialHistory.toState, "SUBMITTED");
  assert.deepEqual(plan.calendarIds, ["calendar-2026"]);
});

test("deadline starts the next working date and ends at Moscow day-end", () => {
  const result = calculateServiceRequestSla(new Date("2026-11-06T12:00:00.000Z"), "STUDY_CERTIFICATE", [calendar(2026)]);
  assert.equal(result.slaWorkingDays, 3);
  assert.equal(result.deadlineAt.toISOString(), "2026-11-11T20:59:59.999Z");
  assert.deepEqual(result.calendarIds, ["calendar-2026"]);
});

test("OTHER uses its agreed five-working-day SLA", () => {
  const result = calculateServiceRequestSla(new Date("2026-11-06T12:00:00.000Z"), "OTHER", [calendar(2026)]);
  assert.equal(result.slaWorkingDays, 5);
  assert.equal(result.deadlineAt.toISOString(), "2026-11-13T20:59:59.999Z");
});

test("deadline honors official moved working and non-working days", () => {
  const result = calculateServiceRequestSla(new Date("2026-11-03T12:00:00.000Z"), "ACADEMIC_QUESTION", [
    calendar(2026, ["2026-11-04"], { "2026-11-07": "WORKING" }),
  ]);
  assert.equal(result.deadlineAt.toISOString(), "2026-11-10T20:59:59.999Z");
});

test("calendar year boundary requires both verified official years", () => {
  const result = calculateServiceRequestSla(new Date("2026-12-29T12:00:00.000Z"), "STUDY_CERTIFICATE", [
    calendar(2026, ["2026-12-31"]),
    calendar(2027, ["2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"]),
  ]);
  assert.equal(result.deadlineAt.toISOString(), "2027-01-12T20:59:59.999Z");
  assert.deepEqual(result.calendarIds, ["calendar-2026", "calendar-2027"]);
  assert.throws(
    () => calculateServiceRequestSla(new Date("2026-12-29T12:00:00.000Z"), "STUDY_CERTIFICATE", [calendar(2026)]),
    OfficialCalendarUnavailableError,
  );
});

test("missing or unverified calendar dates never fall back to weekday assumptions", () => {
  const complete = calendar(2026);
  const incomplete = { ...complete, days: complete.days.filter((day) => day.date !== "2026-11-09") };
  assert.throws(
    () => calculateServiceRequestSla(new Date("2026-11-06T12:00:00.000Z"), "STUDY_CERTIFICATE", [incomplete]),
    OfficialCalendarUnavailableError,
  );
  const unverified = { ...calendar(2026), verifiedAt: null };
  assert.throws(
    () => calculateServiceRequestSla(new Date("2026-11-06T12:00:00.000Z"), "STUDY_CERTIFICATE", [unverified]),
    OfficialCalendarUnavailableError,
  );
});
