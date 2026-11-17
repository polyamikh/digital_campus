import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { Role, ServiceRequestCategory as RequestCategory, ServiceRequestState } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { moscowDateKey } from "@/lib/schedule/moscow-time";
import {
  buildServiceRequestCreationPlan,
  calculateServiceRequestSla,
  parseNewServiceRequestInput,
  serviceRequestOwnerScope,
  type OfficialCalendarYear,
} from "./service-request-core";

const requestListSelect = {
  id: true,
  category: true,
  state: true,
  title: true,
  submittedAt: true,
  deadlineAt: true,
  completedAt: true,
} satisfies Prisma.ServiceRequestSelect;

export async function listMyServiceRequests() {
  const student = await requireRole(Role.STUDENT);
  return prisma.serviceRequest.findMany({
    where: serviceRequestOwnerScope(student.id),
    select: requestListSelect,
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
  });
}

export async function getMyServiceRequest(requestId: string) {
  const student = await requireRole(Role.STUDENT);
  return prisma.serviceRequest.findFirst({
    where: { id: requestId, ...serviceRequestOwnerScope(student.id) },
    select: {
      ...requestListSelect,
      body: true,
      slaWorkingDays: true,
      rejectionReason: true,
      history: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          fromState: true,
          toState: true,
          reason: true,
          createdAt: true,
          actor: { select: { profile: { select: { displayName: true } } } },
        },
      },
    },
  });
}

export async function createMyServiceRequest(untrustedInput: unknown) {
  const student = await requireRole(Role.STUDENT);
  const input = parseNewServiceRequestInput(untrustedInput);
  const submittedAt = new Date();
  const startYear = Number(moscowDateKey(submittedAt).slice(0, 4));

  return prisma.$transaction(async (tx) => {
    const rows = await tx.productionCalendarYear.findMany({
      where: { year: { in: [startYear, startYear + 1] } },
      select: {
        id: true,
        year: true,
        sourceName: true,
        sourceUrl: true,
        verifiedAt: true,
        days: { select: { date: true, kind: true } },
      },
      orderBy: { year: "asc" },
    });
    const calendars: OfficialCalendarYear[] = rows.map((row) => ({
      ...row,
      days: row.days.map((day) => ({ date: day.date.toISOString().slice(0, 10), kind: day.kind })),
    }));
    const sla = calculateServiceRequestSla(submittedAt, input.category, calendars);
    const plan = buildServiceRequestCreationPlan(student.id, input, submittedAt, sla);

    const request = await tx.serviceRequest.create({
      data: { ...plan.request, category: input.category as RequestCategory, state: ServiceRequestState.SUBMITTED },
      select: requestListSelect,
    });

    await tx.requestStatusHistory.create({
      data: {
        requestId: request.id,
        ...plan.initialHistory,
        toState: ServiceRequestState.SUBMITTED,
      },
    });

    await tx.serviceRequestCalendar.createMany({
      data: plan.calendarIds.map((calendarId) => ({ requestId: request.id, calendarId })),
    });

    return request;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 30_000 });
}
