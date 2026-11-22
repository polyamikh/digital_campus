"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markTeacherHomeworkNotificationReadAction } from "@/app/actions/coursework";

type Notice = { id: string; title: string; body: string; createdAt: Date; readAt: Date | null; href: string | null };
export default function TeacherHomeworkNotificationsContent({ unreadCount, items }: { unreadCount: number; items: Notice[] }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <section className="coursework-detail-panel"><p className="coursework-meta">Непрочитанных: {unreadCount}</p>{items.length ? <div className="coursework-notification-list">{items.map((item) => <article className={`coursework-notification${item.readAt ? "" : " is-unread"}`} key={item.id}><time>{new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time><h2>{item.title}</h2><p>{item.body}</p><div className="coursework-actions">{item.href ? <Link className="coursework-resource" href={item.href}>Открыть домашние задания →</Link> : null}{!item.readAt ? <button className="coursework-secondary" type="button" disabled={pending} onClick={() => startTransition(async () => { await markTeacherHomeworkNotificationReadAction(item.id); router.refresh(); })}>Отметить прочитанным</button> : <small>Прочитано</small>}</div></article>)}</div> : <div className="coursework-empty"><h2>Новых уведомлений пока нет</h2><p>Сообщения о сдачах появятся здесь.</p></div>}</section>;
}
