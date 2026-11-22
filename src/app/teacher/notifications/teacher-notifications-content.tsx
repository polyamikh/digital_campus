"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { NotificationCategory } from "@/generated/prisma/enums";
import { markAllTeacherNotificationsReadAction, markTeacherNotificationReadAction, setTeacherNotificationPreferenceAction } from "@/app/actions/teacher";
import { formatNotificationDate } from "@/lib/notifications/notification-core";

type Data = Awaited<ReturnType<typeof import("@/lib/teacher/teacher-workspace").getTeacherNotifications>>;
const labels: Record<string, string> = { CRITICAL_OFFICIAL: "Критически важные", OFFICIAL_ANNOUNCEMENT: "Официальные объявления", COURSE_ANNOUNCEMENT: "Объявления курсов", SCHEDULE: "Расписание", HOMEWORK: "Домашние задания", TEST: "Тестирование", REQUEST: "Заявки", TASK: "Задачи", CHAT: "Сообщения", OTHER: "Системные" };
const teacherCategories = Object.values(NotificationCategory);

function teacherTarget(category: NotificationCategory, sourceId: string, sourceType: string) {
  const id = encodeURIComponent(sourceId);
  if (sourceType === "GRADE") return "/teacher/grades";
  if (sourceType === "COURSE_ANNOUNCEMENT") return "/teacher/materials";
  if (sourceType === "OFFICIAL_ANNOUNCEMENT") return null;
  if (category === NotificationCategory.SCHEDULE) return "/teacher/schedule";
  if (category === NotificationCategory.HOMEWORK) return "/teacher/homework";
  if (category === NotificationCategory.TEST) return "/teacher/testing";
  if (category === NotificationCategory.REQUEST) return "/teacher/groups";
  if (category === NotificationCategory.TASK) return "/teacher/calendar";
  if (category === NotificationCategory.CHAT) return "/teacher/chats";
  if (category === NotificationCategory.COURSE_ANNOUNCEMENT && id) return "/teacher/materials";
  return null;
}

export default function TeacherNotificationsContent({ deliveries, preferences }: Data) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [category, setCategory] = useState<NotificationCategory | "ALL">("ALL");
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const visible = useMemo(() => deliveries.filter((item) => (filter !== "UNREAD" || (!item.readAt && !item.mutedAt)) && (category === "ALL" || item.notification.category === category)), [deliveries, filter, category]);
  const unreadCount = deliveries.filter((item) => !item.readAt && !item.mutedAt).length;
  const update = (operation: () => Promise<{ ok: boolean; error?: string }>, success: string) => startTransition(async () => { const result = await operation(); setMessage(result.ok ? success : result.error ?? "Не удалось сохранить."); if (result.ok) router.refresh(); });
  return <div className="notifications-layout">
    <section className="notifications-main-panel" aria-labelledby="teacher-notifications-list-title">
      <header className="notifications-panel-heading"><div><span className="profile-heading-kicker">ВАШИ СОБЫТИЯ</span><h2 id="teacher-notifications-list-title">Лента уведомлений</h2><p>{unreadCount ? `${unreadCount} непрочитано` : "Непрочитанных уведомлений нет"}</p></div><button className="notifications-read-all" type="button" disabled={busy || unreadCount === 0} onClick={() => update(markAllTeacherNotificationsReadAction, "Все уведомления отмечены прочитанными.")}>Прочитать все</button></header>
      <div className="notifications-filters" aria-label="Фильтры уведомлений"><button type="button" className={filter === "ALL" ? "is-active" : ""} aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>Все</button><button type="button" className={filter === "UNREAD" ? "is-active" : ""} aria-pressed={filter === "UNREAD"} onClick={() => setFilter("UNREAD")}>Непрочитанные</button><label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.target.value as NotificationCategory | "ALL")}><option value="ALL">Все категории</option>{teacherCategories.map((value) => <option value={value} key={value}>{labels[value] ?? value}</option>)}</select></label></div>
      {message ? <p className="notifications-feedback" role="status">{message}</p> : null}
      {visible.length ? <ol className="notifications-list">{visible.map((item) => { const notification = item.notification; const isUnread = !item.readAt; const target = teacherTarget(notification.category, notification.sourceId, notification.sourceType); return <li className={`notification-card${isUnread ? " is-unread" : ""}${notification.critical ? " is-critical" : ""}`} key={item.id}><span className="notification-card-mark" aria-hidden="true">{notification.critical ? "!" : "•"}</span><div className="notification-card-content"><div className="notification-card-meta"><span>{labels[notification.category] ?? notification.category}</span><time dateTime={item.createdAt.toISOString()}>{formatNotificationDate(item.createdAt.toISOString())}</time><span className={`notification-read-state${isUnread ? " is-new" : ""}`}>{isUnread ? "Новое" : "Прочитано"}</span></div><h3>{notification.title}</h3><p>{notification.body}</p><div className="notification-card-actions">{target ? <Link href={target}>Перейти в раздел <span aria-hidden="true">↗</span></Link> : <span className="notification-unavailable">Связанный раздел не предусмотрен для этого события</span>}{isUnread ? <button type="button" disabled={busy} onClick={() => update(() => markTeacherNotificationReadAction(item.id), "Уведомление отмечено прочитанным.")}>Отметить как прочитанное</button> : null}</div></div></li>; })}</ol> : <div className="notifications-empty" role="status"><span aria-hidden="true">♧</span><h3>{deliveries.length ? "По выбранным фильтрам ничего нет" : "Пока нет уведомлений"}</h3><p>{deliveries.length ? "Измените категорию или покажите все события." : "Когда появятся адресованные вам события, они будут показаны здесь."}</p></div>}
    </section>
    <aside className="notification-settings-panel" aria-labelledby="teacher-notification-settings-title"><span className="profile-heading-kicker">ПЕРСОНАЛЬНЫЕ НАСТРОЙКИ</span><h2 id="teacher-notification-settings-title">Категории</h2><p>Настройки сохраняются для вашего аккаунта преподавателя.</p><ul>{teacherCategories.map((value) => { const enabled = preferences[value] ?? true; const locked = value === NotificationCategory.CRITICAL_OFFICIAL; return <li key={value}><div><strong>{labels[value] ?? value}</strong><small>{locked ? "Всегда включены" : "Получать уведомления этой категории"}</small></div><button type="button" role="switch" aria-checked={enabled} aria-label={`${labels[value]}: ${enabled ? "включены" : "отключены"}`} disabled={busy || locked} onClick={() => update(() => setTeacherNotificationPreferenceAction(value, !enabled), "Настройка уведомлений сохранена.")} className={`notification-switch${enabled ? " is-on" : ""}`}><span /></button></li>; })}</ul><p className="notification-settings-note">Критически важные официальные уведомления всегда включены.</p></aside>
  </div>;
}
