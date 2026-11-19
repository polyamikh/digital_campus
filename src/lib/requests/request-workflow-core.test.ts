import assert from "node:assert/strict";
import { test } from "node:test";
import { Role, ServiceRequestCategory, ServiceRequestState } from "@/generated/prisma/enums";
import { canTransitionServiceRequest, calculateResumedServiceRequestDeadline } from "./service-request-core";
import { isCertificateRequest, isRequestTerminal, notificationEventKey, parseRequestText, requestDocumentAllowedForRole, RequestWorkflowInputError } from "./request-workflow-core";
import type { OfficialCalendarDay, OfficialCalendarYear } from "./service-request-core";

function calendar(year: number): OfficialCalendarYear {
  const days: OfficialCalendarDay[] = [];
  const date = new Date(Date.UTC(year, 0, 1));
  while (date.getUTCFullYear() === year) {
    const key = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    days.push({ date: key, kind: weekday === 0 || weekday === 6 ? "NON_WORKING" : "WORKING" });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return { id: String(year), year, sourceName: "Official test calendar", sourceUrl: "https://example.test", verifiedAt: new Date(`${year}-01-01T00:00:00Z`), days };
}

test("request transitions stay within existing workflow statuses", () => {
  assert.equal(canTransitionServiceRequest(ServiceRequestState.SUBMITTED, ServiceRequestState.IN_REVIEW), true);
  assert.equal(canTransitionServiceRequest(ServiceRequestState.IN_REVIEW, ServiceRequestState.COMPLETED), true);
  assert.equal(canTransitionServiceRequest(ServiceRequestState.COMPLETED, ServiceRequestState.IN_REVIEW), false);
  assert.equal(canTransitionServiceRequest(ServiceRequestState.CLARIFICATION_REQUESTED, ServiceRequestState.COMPLETED), false);
  assert.equal(isRequestTerminal(ServiceRequestState.REJECTED), true);
});

test("clarification resumes only remaining official working days and keeps expired SLA expired", () => {
  const result = calculateResumedServiceRequestDeadline(
    new Date("2026-11-06T12:00:00Z"),
    new Date("2026-11-09T12:00:00Z"),
    new Date("2026-11-12T12:00:00Z"),
    "ACADEMIC_QUESTION",
    new Date("2026-11-13T20:59:59.999Z"),
    [calendar(2026)],
  );
  assert.equal(result?.toISOString(), "2026-11-18T20:59:59.999Z");
  const secondPause = calculateResumedServiceRequestDeadline(
    new Date("2026-11-06T12:00:00Z"),
    new Date("2026-11-17T12:00:00Z"),
    new Date("2026-11-18T12:00:00Z"),
    "ACADEMIC_QUESTION",
    new Date("2026-11-18T20:59:59.999Z"),
    [calendar(2026)],
    [{ requestedAt: new Date("2026-11-09T12:00:00Z"), answeredAt: new Date("2026-11-12T12:00:00Z") }],
  );
  assert.equal(secondPause?.toISOString(), "2026-11-19T20:59:59.999Z");
  const overdueSubmittedAt = new Date("2026-11-02T12:00:00Z");
  const pausedAfterDeadline = new Date("2026-11-12T12:00:00Z");
  const expiredDeadline = new Date("2026-11-10T20:59:59.999Z");
  assert.equal(calculateResumedServiceRequestDeadline(overdueSubmittedAt, pausedAfterDeadline, new Date("2026-11-13T12:00:00Z"), "OTHER", expiredDeadline, [calendar(2026)])?.toISOString(), expiredDeadline.toISOString());
  assert.throws(() => calculateResumedServiceRequestDeadline(new Date("2026-11-06T12:00:00Z"), new Date("2026-11-09T12:00:00Z"), new Date("2026-11-12T12:00:00Z"), "OTHER", new Date("2026-11-13T20:59:59.999Z"), []), /официальный производственный календарь/);
});

test("request input text is required and bounded", () => {
  assert.equal(parseRequestText("  Ответ  ", "Ответ"), "Ответ");
  assert.throws(() => parseRequestText("   ", "Ответ"), RequestWorkflowInputError);
  assert.throws(() => parseRequestText("12345", "Ответ", 4), RequestWorkflowInputError);
});

test("only certificate categories are treated as document requests", () => {
  assert.equal(isCertificateRequest(ServiceRequestCategory.STUDY_CERTIFICATE), true);
  assert.equal(isCertificateRequest(ServiceRequestCategory.OTHER), false);
});

test("document access is role and owner scoped and revoked documents are denied", () => {
  assert.equal(requestDocumentAllowedForRole(Role.STUDENT, "alice", "alice", null), true);
  assert.equal(requestDocumentAllowedForRole(Role.STUDENT, "sofia", "alice", null), false);
  assert.equal(requestDocumentAllowedForRole(Role.DEAN, "dean", "alice", null), true);
  assert.equal(requestDocumentAllowedForRole(Role.DEAN, "dean", "alice", new Date()), false);
  assert.equal(requestDocumentAllowedForRole(Role.TEACHER, "teacher", "alice", null), false);
});

test("notification event keys are stable", () => {
  assert.equal(notificationEventKey("request-1", "status-v2"), notificationEventKey("request-1", "status-v2"));
});
