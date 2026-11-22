import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import LogoutButton from "@/app/logout-button";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getDeanPassWorkspace } from "@/lib/campus/pass-service";
import PassQueueContent from "./pass-queue-content";

export default function DeanPassesPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем очередь пропусков…" />}><DeanPasses /></Suspense>; }

async function DeanPasses() {
  const user = await currentUser(); if (!user) redirect("/login"); if (user.activeRole !== Role.DEAN) redirect(homePathForRole(user.activeRole));
  const workspace = await getDeanPassWorkspace();
  return <main className="dean-requests-page"><header className="dean-requests-topbar"><Link className="login-brand" href="/dean">DIGITAL<br />CAMPUS</Link><nav className="dean-workspace-nav"><Link href="/dean">Главная</Link><Link href="/dean/profile">Мой профиль</Link><Link href="/dean/students">Студенты</Link><Link href="/dean/teachers">Преподаватели</Link><Link href="/dean/schedule">Расписание</Link><Link href="/dean/requests">Заявки и документы</Link><Link href="/dean/passes" aria-current="page">Пропуска</Link><Link href="/dean/analytics">Аналитика</Link><Link href="/dean/announcements">Объявления</Link><Link href="/dean/calendar">Календарь</Link><Link href="/dean/notifications">Уведомления</Link><Link href="/dean/assistant">AI-помощник</Link><Link href="/dean/career">Карьерный центр</Link></nav><span className="dean-role-chip">Кабинет деканата</span><LogoutButton /></header><div className="dean-requests-content"><section className="dean-requests-heading"><span className="profile-heading-kicker">СЕРВИС ПРОПУСКОВ</span><h1>Запросы на пропуск</h1><p>Обрабатывайте только поступившие запросы. Отклонение требует причины; временная запись остаётся демонстрационной.</p></section>{workspace.notifications.length ? <section className="request-notifications"><div className="request-notifications-heading"><div><span className="profile-heading-kicker">УВЕДОМЛЕНИЯ</span><h2>Новые запросы</h2></div></div><ul>{workspace.notifications.map((notice) => <li key={notice.id} className={notice.readAt ? "" : "is-unread"}><span aria-hidden="true">●</span><div><strong>{notice.notification.title}</strong><p>{notice.notification.body}</p><small>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(notice.createdAt)}</small><Link href={`/dean/passes#${notice.notification.sourceId}`}>Открыть запрос</Link></div></li>)}</ul></section> : null}<PassQueueContent requests={workspace.requests} /></div></main>;
}
