import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser, ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getMyRequestWorkspace } from "@/lib/requests/request-workflow";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { prisma } from "@/lib/prisma";
import RequestsContent from "./requests-content";
import type { RequestNotificationView, StudentRequestView } from "@/lib/requests/requests-view-core";

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

  const requests: StudentRequestView[] = loaded.workspace.requests.map((request) => {
    const membership = request.student.memberships
      .filter((item) => (!item.startsAt || item.startsAt <= request.submittedAt) && (!item.endsAt || item.endsAt >= request.submittedAt))
      .sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0))[0];
    return {
      id: request.id,
      category: request.category,
      state: request.state,
      title: request.title,
      body: request.body,
      submittedAt: request.submittedAt.toISOString(),
      deadlineAt: request.deadlineAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
      rejectionReason: request.rejectionReason,
      resolution: [...request.history].reverse().find((entry) => entry.toState === "COMPLETED")?.reason ?? null,
      history: request.history.map(({ actor, ...entry }) => ({ ...entry, createdAt: entry.createdAt.toISOString(), actorName: actor.profile?.displayName ?? actor.login })),
      clarifications: request.clarifications.map((entry) => ({ id: entry.id, question: entry.question, answer: entry.answer, requestedAt: entry.requestedAt.toISOString(), answeredAt: entry.answeredAt?.toISOString() ?? null })),
      documents: request.documents.map((entry) => ({ id: entry.id, fileName: entry.fileName, byteSize: entry.byteSize.toString(), issuedAt: entry.issuedAt?.toISOString() ?? null })),
      groupCode: membership?.group.code ?? null,
    };
  });
  const notifications: RequestNotificationView[] = loaded.workspace.notifications.map((notification) => ({
    deliveryId: notification.deliveryId,
    sourceId: notification.sourceId,
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
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
      <RequestsContent requests={requests} notifications={notifications} />
    </StudentAppShell>
  );
}

async function loadRequestsPageData(userId: string) {
  const [workspace, profile, photo] = await Promise.all([
    getMyRequestWorkspace(userId),
    prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } }),
    getProfilePhotoMetadata(userId),
  ]);
  return { workspace, profile, photo };
}
