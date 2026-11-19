import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import LogoutButton from "@/app/logout-button";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { listDeanRequestWorkspace } from "@/lib/requests/request-workflow";
import type { RequestNotificationView } from "@/lib/requests/requests-view-core";
import DeanRequestsContent, { type DeanRequestView } from "./requests-content";

export default function DeanRequestsPage() {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем очередь заявок…" />}><AuthenticatedDeanRequests /></Suspense>;
}

async function AuthenticatedDeanRequests() {
  const identity = await currentUser();
  if (!identity) redirect("/login");
  if (identity.activeRole !== Role.DEAN) redirect(homePathForRole(identity.activeRole));
  let workspace: Awaited<ReturnType<typeof listDeanRequestWorkspace>>;
  try {
    workspace = await listDeanRequestWorkspace();
  } catch {
    return <main className="dean-requests-page"><header className="dean-requests-topbar"><Link className="login-brand" href="/dean">DIGITAL<br />CAMPUS</Link><span className="dean-role-chip">Кабинет деканата</span><LogoutButton /></header><div className="dean-requests-content"><section className="dean-requests-heading"><span className="profile-heading-kicker">РАБОЧЕЕ МЕСТО ДЕКАНАТА</span><h1>Заявки и справки</h1></section><div className="dean-request-empty" role="alert"><strong>Не удалось загрузить очередь</strong><p>Попробуйте открыть раздел позже. Данные заявок не изменены.</p></div></div></main>;
  }
  const requests: DeanRequestView[] = workspace.requests.map((request) => {
    const membership = request.student.memberships
      .filter((item) => (!item.startsAt || item.startsAt <= request.submittedAt) && (!item.endsAt || item.endsAt >= request.submittedAt))
      .sort((a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0))[0];
    return {
      id: request.id,
      studentId: request.studentId,
      assignedToId: request.assignedToId,
      category: request.category,
      state: request.state,
      title: request.title,
      body: request.body,
      submittedAt: request.submittedAt.toISOString(),
      deadlineAt: request.deadlineAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
      rejectionReason: request.rejectionReason,
      version: request.version,
      studentName: request.student.profile?.displayName ?? request.student.login,
      studentLogin: request.student.login,
      groupCode: membership?.group.code ?? "Группа не указана",
      assignedName: request.assignedTo?.profile?.displayName ?? request.assignedTo?.login ?? null,
      history: request.history.map(({ actor, ...entry }) => ({ ...entry, createdAt: entry.createdAt.toISOString(), actorName: actor.profile?.displayName ?? actor.login })),
      clarifications: request.clarifications.map(({ requestedBy, ...entry }) => ({ ...entry, requestedAt: entry.requestedAt.toISOString(), answeredAt: entry.answeredAt?.toISOString() ?? null, requesterName: requestedBy.profile?.displayName ?? requestedBy.login })),
      documents: request.documents.map((entry) => ({ id: entry.id, fileName: entry.fileName, byteSize: entry.byteSize.toString(), issuedAt: entry.issuedAt?.toISOString() ?? null })),
    };
  });
  const assignments = workspace.assignments.map(({ userId, user }) => ({ id: userId, label: user.profile?.displayName ?? user.login }));
  const notifications: RequestNotificationView[] = workspace.notifications.map((notification) => ({
    deliveryId: notification.deliveryId,
    sourceId: notification.sourceId,
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  }));

  return <main className="dean-requests-page">
    <header className="dean-requests-topbar"><Link className="login-brand" href="/dean">DIGITAL<br />CAMPUS</Link><nav><Link href="/dean/requests" aria-current="page">Заявки и справки</Link><Link href="#dean-request-notifications">Уведомления</Link></nav><span className="dean-role-chip">Кабинет деканата</span><LogoutButton /></header>
    <div className="dean-requests-content"><section className="dean-requests-heading"><span className="profile-heading-kicker">РАБОЧЕЕ МЕСТО ДЕКАНАТА</span><h1>Заявки и справки</h1><p>Обрабатывайте обращения, уточнения и готовые документы.</p></section><DeanRequestsContent requests={requests} assignments={assignments} notifications={notifications} evaluatedAt={new Date().toISOString()} /></div>
  </main>;
}
