import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser, ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { listMyServiceRequests } from "@/lib/requests/student-service-requests";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { prisma } from "@/lib/prisma";
import RequestsContent from "./requests-content";
import type { StudentRequestView } from "@/lib/requests/requests-view-core";

export default function StudentRequestsPage() {
  return (
    <Suspense fallback={<AuthRouteFallback message="Загружаем заявки…" />}>
      <AuthenticatedStudentRequests />
    </Suspense>
  );
}

async function AuthenticatedStudentRequests() {
  const identity = await currentUser();
  if (!identity) redirect("/login");
  if (identity.activeRole !== Role.STUDENT) redirect(homePathForRole(identity.activeRole as RoleType));

  let loaded: Awaited<ReturnType<typeof loadRequestsPageData>> | null = null;
  try {
    loaded = await loadRequestsPageData(identity.id);
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenRoleError) redirect(homePathForRole(identity.activeRole));
  }

  if (!loaded) {
    return (
      <StudentAppShell displayName={identity.login} groupCode={null} activeSection="requests">
        <section className="profile-page-heading requests-page-heading" aria-labelledby="requests-page-title">
          <span className="profile-heading-kicker">ОБРАЩЕНИЯ В ДЕКАНАТ</span>
          <h1 id="requests-page-title">Заявки и справки</h1>
        </section>
        <section className="requests-empty requests-error" role="alert">
          <span className="requests-empty-icon" aria-hidden="true">!</span>
          <h2>Не удалось загрузить заявки</h2>
          <p>Попробуйте открыть раздел позже. Данные заявок не изменены.</p>
        </section>
      </StudentAppShell>
    );
  }

  const requests: StudentRequestView[] = loaded.rows.map((request) => ({
    ...request,
    submittedAt: request.submittedAt.toISOString(),
    deadlineAt: request.deadlineAt?.toISOString() ?? null,
    completedAt: request.completedAt?.toISOString() ?? null,
  }));
  return (
    <StudentAppShell
      displayName={loaded.profile?.displayName || identity.login}
      groupCode={null}
      photoVersion={loaded.photo?.version ?? null}
      activeSection="requests"
    >
      <section className="profile-page-heading requests-page-heading" aria-labelledby="requests-page-title">
        <span className="profile-heading-kicker">ОБРАЩЕНИЯ В ДЕКАНАТ</span>
        <h1 id="requests-page-title">Заявки и справки</h1>
        <p>Создавайте обращения и отслеживайте их статус и срок.</p>
      </section>
      <RequestsContent requests={requests} />
    </StudentAppShell>
  );
}

async function loadRequestsPageData(userId: string) {
  const [rows, profile, photo] = await Promise.all([
    listMyServiceRequests(),
    prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } }),
    getProfilePhotoMetadata(userId),
  ]);
  return { rows, profile, photo };
}
