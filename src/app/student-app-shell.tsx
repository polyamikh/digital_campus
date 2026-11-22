import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import LogoutButton from "./logout-button";
import CampusThemeToggle from "./campus-theme-toggle";
import { getCurrentStudentUnreadNotificationCount } from "@/lib/notifications/student-notifications";

const navigation = [
  { label: "Главная", icon: "home", href: "/", section: "home" },
  { label: "Мой профиль", icon: "profile", href: "/profile", section: "profile" },
  { label: "Расписание", icon: "schedule", href: "/schedule", section: "schedule" },
  { label: "Успеваемость", icon: "grades", href: "/grades", section: "grades" },
  { label: "Заявки и справки", icon: "requests", href: "/requests", section: "requests" },
  { label: "Уведомления", icon: "notifications", href: "/notifications", section: "notifications" },
  { label: "Календарь задач", icon: "tasks", href: "/tasks", section: "tasks" },
  { label: "Тестирование", icon: "testing", href: "/testing", section: "testing" },
  { label: "Материалы", icon: "materials", href: "/materials", section: "materials" },
  { label: "Домашние задания", icon: "homework", href: "/homework", section: "homework" },
  { label: "Чаты", icon: "chats", href: "/chats", section: "chats" },
  { label: "Забыл пропуск", icon: "pass", href: "/pass", section: "pass" },
  { label: "Карьерные возможности", icon: "career", href: "/career", section: "career" },
  { label: "AI-помощник", icon: "ai", href: "/assistant", section: "ai" },
] as const;

const iconPaths: Record<string, string> = {
  home: "M3 10.8 12 3l9 7.8M5.5 9.5V21h13V9.5M9.5 21v-7h5v7",
  profile: "M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  schedule: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 4h2",
  grades: "M4 19V5m0 14h17M7 15l4-4 3 2 6-7M7 8h.01",
  requests: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7",
  notifications: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4",
  tasks: "M8 4H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-3M8 2h8v4H8zM7 12l2 2 4-4m2 2h3m-9 5h6",
  testing: "M7 3h10v3h3v15H4V6h3zM9 3h6v5H9zM8 13h8m-8 4h5",
  materials: "M4 4h6l2 2h8v14H4zM8 11h8m-8 4h8",
  homework: "M4 4h16v16H4zM8 9h8m-8 4h8m-8 4h5",
  chats: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z",
  pass: "M4 7h16v12H4zM8 7V5a4 4 0 0 1 8 0v2m-4 4v4",
  career: "M3 7h18v13H3zM8 7V4h8v3m-13 5h18m-11 0v2h4v-2",
  ai: "M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 2l.7 2.3L8 5l-2.3.7L5 8l-.7-2.3L2 5l2.3-.7L5 2Z",
};

function Icon({ name }: { name: string }) {
  return <span className="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name] ?? iconPaths.home} /></svg></span>;
}

function initialsFor(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU");
}

export default async function StudentAppShell({
  displayName,
  groupCode,
  photoVersion,
  activeSection,
  unreadNotificationCount,
  children,
}: {
  displayName: string;
  groupCode: string | null;
  photoVersion?: number | null;
  activeSection: (typeof navigation)[number]["section"];
  unreadNotificationCount?: number;
  children: ReactNode;
}) {
  const unreadCount = unreadNotificationCount ?? await getCurrentStudentUnreadNotificationCount().catch(() => 0);
  const initials = initialsFor(displayName);
  const sectionTitle = navigation.find((item) => item.section === activeSection)?.label ?? "Главная";

  return <div className="app-shell student-app-shell">
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <aside className="sidebar" aria-label="Студенческая навигация">
      <Link className="brand" href="/" aria-label="Digital Campus — главная">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <span className="brand-name">DIGITAL<br />CAMPUS<small>МГИМО</small></span>
      </Link>
      <div className="role-chip"><span className="role-dot" />Кабинет студента</div>
      <nav className="side-nav" aria-label="Разделы студента">
        <span className="nav-caption">УЧЁБА И КАМПУС</span>
        {navigation.map((item) => {
          const active = item.section === activeSection;
          return <Link className={`nav-item${active ? " is-active" : ""}`} href={item.href} aria-current={active ? "page" : undefined} aria-label={item.label} title={item.label} data-mobile-visible="true" key={item.section}>
            <Icon name={item.icon} /><span className="nav-label">{item.label}</span>
            {item.section === "notifications" && unreadCount > 0 ? <span className="notification-count-badge" aria-label={`${unreadCount} непрочитанных`}>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
          </Link>;
        })}
      </nav>
      <div className="sidebar-foot"><span className="status-light" />Демонстрационный интерфейс</div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>Студент</span><span className="crumb-separator">/</span><strong>{sectionTitle}</strong></div>
        <div className="topbar-tools">
          <CampusThemeToggle />
          <Link className="icon-button notification-button" href="/notifications" aria-label={unreadCount ? `Уведомления: ${unreadCount} непрочитанных` : "Уведомления"}><Icon name="notifications" />{unreadCount > 0 ? <span className="notification-count-badge topbar-unread-count">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}</Link>
          <Link className="profile-menu" href="/profile" aria-label={`Профиль ${displayName}`}>
            <span className="avatar" aria-hidden="true">{photoVersion !== null && photoVersion !== undefined ? <Image src={`/api/profile/photo?v=${photoVersion}`} width={36} height={36} alt="" unoptimized /> : initials}</span>
            <span className="profile-name">{displayName}<small>{groupCode ?? "Студент"}</small></span><span className="chevron" aria-hidden="true">⌄</span>
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="main-content" id="main-content">{children}</main>
    </div>
  </div>;
}
