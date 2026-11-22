import "server-only";

import { CareerApplicationState, CareerRegistrationState, CareerOpportunityState, CareerEventState, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { safeCampusUrl } from "./campus-core";

export async function getStudentCareerWorkspace() {
  const student = await requireRole(Role.STUDENT);
  const now = new Date();
  const [profile, opportunities, applications, resume, events, categories, membership] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: student.id }, select: { displayName: true } }),
    prisma.careerOpportunity.findMany({ where: { state: CareerOpportunityState.PUBLISHED, OR: [{ closesAt: null }, { closesAt: { gt: now } }] }, include: { category: true }, orderBy: [{ closesAt: "asc" }, { createdAt: "desc" }], take: 100 }),
    prisma.careerApplication.findMany({ where: { studentId: student.id }, include: { opportunity: { include: { category: true } }, history: { orderBy: { createdAt: "asc" } } }, orderBy: { appliedAt: "desc" }, take: 100 }),
    prisma.careerResume.findUnique({ where: { studentId: student.id }, include: { skills: { orderBy: { name: "asc" } }, entries: { orderBy: [{ position: "asc" }, { title: "asc" }] } } }),
    prisma.careerEvent.findMany({ where: { state: CareerEventState.PUBLISHED, startsAt: { gte: now } }, include: { registrations: { where: { studentId: student.id }, select: { id: true, state: true } } }, orderBy: { startsAt: "asc" }, take: 50 }),
    prisma.careerCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.groupMembership.findFirst({ where: activeMembershipWhere(student.id, now), include: { group: { include: { academicProgram: true } } } }),
  ]);
  const skills = resume?.skills.map((item) => item.name) ?? [];
  const appliedIds = new Set(applications.filter((item) => item.state !== CareerApplicationState.WITHDRAWN).map((item) => item.opportunityId));
  return {
    displayName: profile?.displayName ?? student.login,
    opportunities: opportunities.map((item) => ({ ...item, externalUrl: safeCampusUrl(item.externalUrl), applied: appliedIds.has(item.id) })),
    applications,
    resume,
    skills,
    categories,
    education: { group: membership?.group.code ?? null, program: membership?.group.academicProgram ?? null },
    events: events.map((event) => ({ ...event, externalUrl: safeCampusUrl(event.externalUrl), registration: event.registrations[0] ?? null })),
  };
}

export async function getStudentCareerOpportunityDetail(opportunityId: string) {
  await requireRole(Role.STUDENT);
  const item = await prisma.careerOpportunity.findFirst({ where: { id: opportunityId, state: CareerOpportunityState.PUBLISHED, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] }, include: { category: true } });
  return item ? { ...item, externalUrl: safeCampusUrl(item.externalUrl) } : null;
}

export async function applyToCareerOpportunity(opportunityId: string, coverLetter: string) {
  const student = await requireRole(Role.STUDENT);
  const opportunity = await prisma.careerOpportunity.findFirst({ where: { id: opportunityId, state: CareerOpportunityState.PUBLISHED, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] }, select: { id: true } });
  if (!opportunity) throw new Error("Возможность закрыта или недоступна.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.careerApplication.findUnique({ where: { studentId_opportunityId: { studentId: student.id, opportunityId } } });
    if (existing && existing.state !== CareerApplicationState.WITHDRAWN) throw new Error("Отклик уже отправлен.");
    const application = existing
      ? await tx.careerApplication.update({ where: { id: existing.id }, data: { state: CareerApplicationState.SUBMITTED, coverLetter: coverLetter || null, appliedAt: new Date() } })
      : await tx.careerApplication.create({ data: { studentId: student.id, opportunityId, coverLetter: coverLetter || null } });
    await tx.careerApplicationHistory.create({ data: { applicationId: application.id, actorId: student.id, fromState: existing?.state ?? null, toState: CareerApplicationState.SUBMITTED } });
    return application.id;
  }, { isolationLevel: "Serializable" });
}

export async function withdrawCareerApplication(applicationId: string) {
  const student = await requireRole(Role.STUDENT);
  return prisma.$transaction(async (tx) => {
    const item = await tx.careerApplication.findFirst({ where: { id: applicationId, studentId: student.id }, select: { id: true, state: true } });
    if (!item || (item.state !== CareerApplicationState.SUBMITTED && item.state !== CareerApplicationState.IN_REVIEW)) throw new Error("Этот отклик нельзя отозвать.");
    const changed = await tx.careerApplication.updateMany({ where: { id: item.id, studentId: student.id, state: item.state }, data: { state: CareerApplicationState.WITHDRAWN } });
    if (changed.count !== 1) throw new Error("Отклик уже обновлён. Обновите страницу.");
    await tx.careerApplicationHistory.create({ data: { applicationId: item.id, actorId: student.id, fromState: item.state, toState: CareerApplicationState.WITHDRAWN } });
  });
}

export async function saveStudentCareerResume(input: { headline: string | null; summary: string | null; skills: string[]; entries: Array<{ kind: "EXPERIENCE" | "PROJECT"; title: string; organization: string | null; description: string | null; position: number }> }) {
  const student = await requireRole(Role.STUDENT);
  return prisma.$transaction(async (tx) => {
    const resume = await tx.careerResume.upsert({ where: { studentId: student.id }, create: { studentId: student.id, headline: input.headline, summary: input.summary }, update: { headline: input.headline, summary: input.summary } });
    await tx.careerResumeSkill.deleteMany({ where: { resumeId: resume.id } });
    await tx.careerResumeEntry.deleteMany({ where: { resumeId: resume.id } });
    if (input.skills.length) await tx.careerResumeSkill.createMany({ data: input.skills.map((name) => ({ resumeId: resume.id, name })) });
    if (input.entries.length) await tx.careerResumeEntry.createMany({ data: input.entries.map((entry) => ({ ...entry, resumeId: resume.id })) });
    return resume.id;
  });
}

export async function setCareerEventRegistration(eventId: string, registered: boolean) {
  const student = await requireRole(Role.STUDENT);
  const event = await prisma.careerEvent.findFirst({ where: { id: eventId, state: CareerEventState.PUBLISHED, startsAt: { gt: new Date() } }, select: { id: true } });
  if (!event) throw new Error("Регистрация на это мероприятие недоступна.");
  return prisma.careerEventRegistration.upsert({ where: { eventId_studentId: { eventId, studentId: student.id } }, create: { eventId, studentId: student.id }, update: { state: registered ? CareerRegistrationState.ACTIVE : CareerRegistrationState.CANCELLED } });
}
