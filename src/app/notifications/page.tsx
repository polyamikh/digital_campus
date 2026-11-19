import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { getCurrentStudentNotificationCenter } from "@/lib/notifications/student-notifications";
import NotificationsContent from "./notifications-content";

export default function StudentNotificationsPage() {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем уведомления…" />}><AuthenticatedStudentNotifications /></Suspense>;
}

async function AuthenticatedStudentNotifications() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));

  const loaded = await loadNotificationPageData(user.id).catch(() => null);
  if (!loaded) {
    return (
      <StudentAppShell displayName={user.login} groupCode={null} activeSection="notifications" unreadNotificationCount={0}>
        <section className="notifications-page-heading" aria-labelledby="notifications-page-title"><span className="profile-heading-kicker">ЦЕНТР ОБНОВЛЕНИЙ</span><h1 id="notifications-page-title">Уведомления</h1></section>
        <section className="notifications-empty notifications-error" role="alert"><span aria-hidden="true">!</span><h2>Не удалось загрузить уведомления</h2><p>Попробуйте открыть раздел позже. Данные не изменены.</p></section>
      </StudentAppShell>
    );
  }

  const displayName = loaded.identity?.profile?.displayName || loaded.identity?.login || user.login;
  const notifications = loaded.center.notifications.map((notification) => ({ ...notification, createdAt: notification.createdAt.toISOString(), readAt: notification.readAt?.toISOString() ?? null }));
  return (
    <StudentAppShell displayName={displayName} groupCode={null} photoVersion={loaded.photo?.version ?? null} activeSection="notifications" unreadNotificationCount={loaded.center.unreadCount}>
      <section className="notifications-page-heading" aria-labelledby="notifications-page-title">
        <span className="profile-heading-kicker">ЦЕНТР ОБНОВЛЕНИЙ</span>
        <h1 id="notifications-page-title">Уведомления</h1>
        <p>События, адресованные вашему аккаунту. Критически важные сообщения всегда остаются включёнными.</p>
      </section>
      <NotificationsContent notifications={notifications} preferences={loaded.center.preferences} unreadCount={loaded.center.unreadCount} />
    </StudentAppShell>
  );
}

async function loadNotificationPageData(userId: string) {
  const [center, identity, photo] = await Promise.all([
    getCurrentStudentNotificationCenter(),
    prisma.user.findUnique({ where: { id: userId }, select: { login: true, profile: { select: { displayName: true } } } }),
    getProfilePhotoMetadata(userId),
  ]);
  return { center, identity, photo };
}
