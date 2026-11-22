import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getDeanNotificationsUnreadCount } from "@/lib/dean/dean-workspace";
import LogoutButton from "@/app/logout-button";

const links = [
  ["/dean", "Главная"], ["/dean/profile", "Мой профиль"], ["/dean/students", "Студенты"], ["/dean/teachers", "Преподаватели"],
  ["/dean/schedule", "Расписание"], ["/dean/requests", "Заявки и документы"], ["/dean/passes", "Пропуска"],
  ["/dean/analytics", "Учебная аналитика"], ["/dean/announcements", "Объявления"], ["/dean/calendar", "Календарь"],
  ["/dean/notifications", "Уведомления"], ["/dean/assistant", "AI-помощник"], ["/dean/career", "Карьерный центр"],
] as const;

export default async function DeanAppShell({ children, active }: { children: ReactNode; active: string }) {
  const identity = await currentUser();
  if (!identity) redirect("/login");
  if (identity.activeRole !== Role.DEAN) redirect(homePathForRole(identity.activeRole));
  const unread = await getDeanNotificationsUnreadCount();
  return <main className="dean-requests-page dean-workspace-page">
    <header className="dean-requests-topbar"><Link className="login-brand" href="/dean">DIGITAL<br />CAMPUS</Link><nav aria-label="Разделы деканата" className="dean-workspace-nav">{links.map(([href, label]) => <Link key={href} href={href} aria-current={active === href ? "page" : undefined}>{label}{href === "/dean/notifications" && unread ? <span className="dean-nav-count">{unread}</span> : null}</Link>)}</nav><span className="dean-role-chip">Кабинет деканата</span><LogoutButton /></header>
    <div className="dean-requests-content">{children}</div>
  </main>;
}
