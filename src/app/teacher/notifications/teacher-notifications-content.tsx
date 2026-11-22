"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NotificationCategory } from "@/generated/prisma/enums";
import { markAllTeacherNotificationsReadAction, markTeacherNotificationReadAction, setTeacherNotificationPreferenceAction } from "@/app/actions/teacher";
import { notificationTarget } from "@/lib/notifications/notification-core";

type Data = Awaited<ReturnType<typeof import("@/lib/teacher/teacher-workspace").getTeacherNotifications>>;
const labels: Record<string, string> = { CRITICAL_OFFICIAL: "Критически важные", OFFICIAL_ANNOUNCEMENT: "Официальные объявления", COURSE_ANNOUNCEMENT: "Учебные объявления", SCHEDULE: "Расписание", HOMEWORK: "Домашние задания", TEST: "Тестирование", REQUEST: "Заявки", TASK: "Задачи", CHAT: "Сообщения", OTHER: "Системные" };

export default function TeacherNotificationsContent({ deliveries, preferences }: Data) {
  const router = useRouter(); const [filter, setFilter] = useState("ALL"); const [category, setCategory] = useState("ALL"); const [message, setMessage] = useState(""); const [busy, startTransition] = useTransition();
  const visible = deliveries.filter((item) => (filter !== "UNREAD" || (!item.readAt && !item.mutedAt)) && (category === "ALL" || item.notification.category === category));
  const update = (operation: () => Promise<{ ok: boolean; error?: string }>, success: string) => startTransition(async () => { const result = await operation(); setMessage(result.ok ? success : result.error ?? "Не удалось сохранить."); if (result.ok) router.refresh(); });
  return <section className="teacher-notification-center"><div className="teacher-filter-row"><label>Показать<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Все</option><option value="UNREAD">Непрочитанные</option></select></label><label>Категория<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Все категории</option>{Object.values(NotificationCategory).map((value) => <option value={value} key={value}>{labels[value] ?? value}</option>)}</select></label><button type="button" className="coursework-secondary" disabled={busy || !deliveries.some((item) => !item.readAt)} onClick={() => update(markAllTeacherNotificationsReadAction, "Уведомления отмечены прочитанными.")}>Прочитать все</button></div>
    {message ? <p className="teacher-feedback" role="status">{message}</p> : null}
    <details className="teacher-preferences"><summary>Настройки категорий</summary><ul>{Object.values(NotificationCategory).map((value) => { const enabled = preferences[value] ?? true; const locked = value === NotificationCategory.CRITICAL_OFFICIAL; return <li key={value}><span>{labels[value] ?? value}</span><button type="button" role="switch" aria-checked={enabled} disabled={busy || locked} onClick={() => update(() => setTeacherNotificationPreferenceAction(value, !enabled), "Настройка обновлена.")}>{locked ? "Всегда включены" : enabled ? "Включены" : "Отключены"}</button></li>; })}</ul></details>
    {visible.length ? <ul className="teacher-notification-list">{visible.map((item) => { const target = notificationTarget(item.notification.category, item.notification.sourceId, item.notification.sourceType); return <li className={!item.readAt && !item.mutedAt ? "is-unread" : ""} key={item.id}><div><span>{labels[item.notification.category] ?? item.notification.category}</span><time>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(item.createdAt)}</time></div><strong>{item.notification.title}</strong><p>{item.notification.body}</p><footer>{target ? <Link href={target}>Открыть связанный раздел →</Link> : <span>Связанный раздел пока недоступен.</span>}{!item.readAt ? <button type="button" disabled={busy} onClick={() => update(() => markTeacherNotificationReadAction(item.id), "Отмечено прочитанным.")}>Прочитано</button> : <small>Прочитано</small>}</footer></li>; })}</ul> : <div className="teacher-empty"><h2>Уведомлений нет</h2><p>{filter === "UNREAD" ? "Непрочитанных уведомлений нет." : "Новые события появятся здесь после реального действия."}</p></div>}
  </section>;
}
