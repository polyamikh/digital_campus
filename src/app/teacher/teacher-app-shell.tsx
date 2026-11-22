import type { ReactNode } from "react";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/app/logout-button";

const items = [
  ["home", "Главная", "/teacher", "⌂"], ["profile", "Мой профиль", "/teacher/profile", "◉"],
  ["schedule", "Расписание", "/teacher/schedule", "▦"], ["groups", "Мои группы", "/teacher/groups", "♧"],
  ["grades", "Журнал оценок", "/teacher/grades", "▥"], ["homework", "Домашние задания", "/teacher/homework", "▧"],
  ["testing", "Тестирование", "/teacher/testing", "✓"], ["materials", "Материалы", "/teacher/materials", "▱"],
  ["chats", "Чаты", "/teacher/chats", "▰"], ["calendar", "Календарь", "/teacher/calendar", "▣"],
  ["notifications", "Уведомления", "/teacher/notifications", "♧"], ["assistant", "AI-помощник", "/teacher/assistant", "✳"],
] as const;

export type TeacherSection = typeof items[number][0];

export default async function TeacherAppShell({ activeSection, children }: { activeSection: TeacherSection; children: ReactNode }) {
  const user = await requireRole(Role.TEACHER);
  const [profile, unreadCount] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id }, select: { displayName: true } }),
    prisma.notificationDelivery.count({ where: { recipientId: user.id, readAt: null, mutedAt: null } }),
  ]);
  const displayName = profile?.displayName ?? user.login;
  const title = items.find(([section]) => section === activeSection)?.[1] ?? "Кабинет преподавателя";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU");
  return <div className="app-shell teacher-app-shell">
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <aside className="sidebar" aria-label="Навигация преподавателя">
      <Link className="brand" href="/teacher" aria-label="Digital Campus — кабинет преподавателя"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span className="brand-name">DIGITAL<br />CAMPUS<small>МГИМО</small></span></Link>
      <div className="role-chip"><span className="role-dot" />Кабинет преподавателя</div>
      <nav className="side-nav" aria-label="Разделы преподавателя"><span className="nav-caption">ПРЕПОДАВАНИЕ</span>{items.map(([section, label, href, icon]) => <Link className={"nav-item" + (activeSection === section ? " is-active" : "")} href={href} key={section} aria-current={activeSection === section ? "page" : undefined} data-mobile-visible="true"><span className="icon" aria-hidden="true">{icon}</span><span className="nav-label">{label}</span>{section === "notifications" && unreadCount > 0 ? <span className="notification-count-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}</Link>)}</nav>
      <div className="sidebar-foot"><span className="status-light" />Демонстрационный интерфейс</div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumbs"><span>Преподаватель</span><span className="crumb-separator">/</span><strong>{title}</strong></div><div className="topbar-tools"><span className="demo-badge"><span />Демо-режим</span><Link className="icon-button notification-button" href="/teacher/notifications" aria-label={"Уведомления: " + unreadCount + " непрочитанных"}><span aria-hidden="true">♧</span>{unreadCount > 0 ? <span className="notification-dot" /> : null}</Link><div className="profile-menu"><span className="avatar" aria-hidden="true">{initials}</span><span className="profile-name">{displayName}<small>Преподаватель</small></span></div><LogoutButton /></div></header><main className="main-content" id="main-content">{children}</main></div>
  </div>;
}
