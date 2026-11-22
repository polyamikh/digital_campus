import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getDeanNotificationsUnreadCount } from "@/lib/dean/dean-workspace";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/app/logout-button";
import CampusThemeToggle from "@/app/campus-theme-toggle";

const links = [
  ["home", "/dean", "Главная", "⌂"], ["profile", "/dean/profile", "Мой профиль", "◉"],
  ["students", "/dean/students", "Студенты", "♧"], ["teachers", "/dean/teachers", "Преподаватели", "♙"],
  ["schedule", "/dean/schedule", "Расписание", "▦"], ["requests", "/dean/requests", "Заявки и документы", "▤"],
  ["passes", "/dean/passes", "Пропуска", "▣"], ["analytics", "/dean/analytics", "Учебная аналитика", "▥"],
  ["announcements", "/dean/announcements", "Объявления", "▱"], ["calendar", "/dean/calendar", "Календарь", "▦"],
  ["notifications", "/dean/notifications", "Уведомления", "♧"], ["assistant", "/dean/assistant", "AI-помощник", "✳"],
  ["career", "/dean/career", "Карьерный центр", "◇"],
] as const;

export default async function DeanAppShell({ children, active }: { children: ReactNode; active: string }) {
  const identity = await currentUser();
  if (!identity) redirect("/login");
  if (identity.activeRole !== Role.DEAN) redirect(homePathForRole(identity.activeRole));
  const [unread, profile] = await Promise.all([
    getDeanNotificationsUnreadCount(),
    prisma.userProfile.findUnique({ where: { userId: identity.id }, select: { displayName: true } }),
  ]);
  const displayName = profile?.displayName ?? identity.login;
  const activeItem = links.find(([, href]) => href === active);
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU");

  return <div className="app-shell dean-app-shell">
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <aside className="sidebar" aria-label="Навигация деканата">
      <Link className="brand" href="/dean" aria-label="Digital Campus — кабинет деканата"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span className="brand-name">DIGITAL<br />CAMPUS<small>МГИМО</small></span></Link>
      <div className="role-chip"><span className="role-dot" />Кабинет деканата</div>
      <nav className="side-nav" aria-label="Разделы деканата"><span className="nav-caption">УПРАВЛЕНИЕ КАМПУСОМ</span>{links.map(([section, href, label, icon]) => <Link key={section} href={href} className={`nav-item${active === href ? " is-active" : ""}`} aria-current={active === href ? "page" : undefined} data-mobile-visible="true"><span className="icon" aria-hidden="true">{icon}</span><span className="nav-label">{label}</span>{section === "notifications" && unread > 0 ? <span className="notification-count-badge">{unread > 99 ? "99+" : unread}</span> : null}</Link>)}</nav>
      <div className="sidebar-foot"><span className="status-light" />Рабочее пространство деканата</div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumbs"><span>Деканат</span><span className="crumb-separator">/</span><strong>{activeItem?.[2] ?? "Рабочее пространство"}</strong></div><div className="topbar-tools"><CampusThemeToggle /><Link className="icon-button notification-button" href="/dean/notifications" aria-label={`Уведомления: ${unread} непрочитанных`}><span aria-hidden="true">♧</span>{unread > 0 ? <span className="notification-dot" /> : null}</Link><div className="profile-menu"><span className="avatar" aria-hidden="true">{initials}</span><span className="profile-name">{displayName}<small>Деканат</small></span></div><LogoutButton /></div></header><main className="main-content" id="main-content">{children}</main></div>
  </div>;
}
