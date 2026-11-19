import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { getCurrentStudentTesting } from "@/lib/testing/testing-service";
import { getStudentTestStatus } from "@/lib/testing/testing-core";
import TestingContent from "./testing-content";

export default function StudentTestingPage() {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем тестирование…" />}><AuthenticatedTestingPage /></Suspense>;
}

async function AuthenticatedTestingPage() {
  const identity = await currentUser();
  if (!identity) redirect("/login");
  if (identity.activeRole !== Role.STUDENT) redirect(homePathForRole(identity.activeRole));
  const now = new Date();
  const [workspace, profile, photo] = await Promise.all([
    getCurrentStudentTesting(now).catch(() => null),
    prisma.user.findUnique({ where: { id: identity.id }, select: { profile: { select: { displayName: true } } } }),
    getProfilePhotoMetadata(identity.id),
  ]);
  const tests = (workspace?.tests ?? []).map((item) => ({
    ...item,
    opensAt: item.opensAt?.toISOString() ?? null,
    closesAt: item.closesAt?.toISOString() ?? null,
    attempts: item.attempts.map((attempt) => ({ ...attempt, submittedAt: attempt.submittedAt?.toISOString() ?? null, publishedAt: attempt.publishedAt?.toISOString() ?? null })),
    status: getStudentTestStatus({ state: "PUBLISHED", opensAt: item.opensAt, closesAt: item.closesAt, attemptLimit: item.attemptLimit, attemptsUsed: item.attemptsUsed, hasCompletedAttempt: item.attempts.some((attempt) => ["SUBMITTED", "REVIEWED", "PUBLISHED"].includes(attempt.state)) }, now),
  }));
  return <StudentAppShell displayName={profile?.profile?.displayName ?? identity.login} groupCode={workspace?.groupCode ?? null} photoVersion={photo?.version ?? null} activeSection="testing">
    <TestingContent tests={tests} membershipState={workspace?.membershipState ?? "ERROR"} now={now.toISOString()} />
  </StudentAppShell>;
}
