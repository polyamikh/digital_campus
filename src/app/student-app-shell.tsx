import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import LogoutButton from "./logout-button";

const navigation = [
  { label: "Главная", icon: "⌂", href: "/", section: "home", available: true },
  { label: "Мой профиль", icon: "◉", href: "/profile", section: "profile", available: true },
  { label: "Расписание", icon: "▦", href: "/schedule", section: "schedule", available: true },
  { label: "Успеваемость", icon: "▥", href: "/grades", section: "grades", available: true },
  { label: "Заявки и справки", icon: "▤", href: "/requests", section: "requests", available: true },
  { label: "Уведомления", icon: "♧", section: "notifications" },
  { label: "Календарь задач", icon: "▣", section: "tasks" },
  { label: "Тестирование", icon: "✓", section: "testing" },
  { label: "Материалы", icon: "▱", section: "materials" },
  { label: "Домашнее задание", icon: "▧", section: "homework" },
  { label: "Чаты", icon: "▰", section: "chats" },
  { label: "Нет пропуска?", icon: "▣", section: "pass" },
  { label: "Карьерные возможности", icon: "↗", section: "career" },
  { label: "AI-помощник", icon: "✳", section: "ai" },
];

function Icon({ children }: { children: string }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function initialsFor(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU");
}

export default function StudentAppShell({
  displayName,
  groupCode,
  photoVersion,
  activeSection,
  children,
}: {
  displayName: string;
  groupCode: string | null;
  photoVersion?: number | null;
  activeSection: "home" | "profile" | "schedule" | "grades" | "requests";
  children: ReactNode;
}) {
  const initials = initialsFor(displayName);
  const sectionTitle = activeSection === "profile" ? "Мой профиль" : activeSection === "schedule" ? "Расписание" : activeSection === "grades" ? "Успеваемость" : activeSection === "requests" ? "Заявки и справки" : "Главная";

  return (
    <div className="app-shell">
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
            return item.available ? (
              <Link
                className={`nav-item${active ? " is-active" : ""}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                title={item.label}
                data-mobile-visible="true"
                key={item.section}
              >
                <Icon>{item.icon}</Icon><span className="nav-label">{item.label}</span>
              </Link>
            ) : (
              <div className="nav-item nav-disabled" aria-disabled="true" key={item.section}>
                <Icon>{item.icon}</Icon><span className="nav-label">{item.label}</span><span className="nav-status">В разработке</span>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot"><span className="status-light" />Демонстрационный интерфейс</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>Студент</span><span className="crumb-separator">/</span><strong>{sectionTitle}</strong></div>
          <div className="topbar-tools">
            <span className="demo-badge"><span />Демо-режим</span>
            <span className="icon-button notification-button" aria-label="Уведомления, демонстрационный просмотр">
              <Icon>♧</Icon><span className="notification-dot" />
            </span>
            <div className="profile-menu" aria-label={`Профиль ${displayName}`}>
              <span className="avatar" aria-hidden="true">
                {photoVersion !== null && photoVersion !== undefined
                  ? <Image src={`/api/profile/photo?v=${photoVersion}`} width={34} height={34} alt="" unoptimized />
                  : initials}
              </span><span className="profile-name">{displayName}<small>{groupCode ?? "Студент"}</small></span>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="main-content" id="main-content">{children}</main>
      </div>
    </div>
  );
}
