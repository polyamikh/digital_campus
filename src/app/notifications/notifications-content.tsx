"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { NotificationCategory } from "@/generated/prisma/enums";
import { markAllNotificationsReadAction, markNotificationReadAction, setNotificationCategoryPreferenceAction } from "@/app/actions/notifications";
import { canMuteNotificationCategory, filterNotifications, formatNotificationDate, NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_META, notificationTarget } from "@/lib/notifications/notification-core";

type NotificationItem = {
  deliveryId: string;
  category: NotificationCategory;
  critical: boolean;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  sourceId: string;
};

type Preferences = Partial<Record<NotificationCategory, boolean>>;

export default function NotificationsContent({ notifications, preferences, unreadCount }: { notifications: NotificationItem[]; preferences: Preferences; unreadCount: number }) {
  const router = useRouter();
  const [category, setCategory] = useState<NotificationCategory | "ALL">("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const visible = useMemo(() => filterNotifications(notifications, { unreadOnly, category }), [notifications, unreadOnly, category]);

  function act(action: () => Promise<{ ok: boolean; error: string | null }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      setFeedback(result.ok ? successMessage : result.error);
      if (result.ok) router.refresh();
    });
  }

  function setPreference(value: NotificationCategory, enabled: boolean) {
    act(() => setNotificationCategoryPreferenceAction(value, enabled), "Настройка уведомлений сохранена.");
  }

  return (
    <div className="notifications-layout">
      <section className="notifications-main-panel" aria-labelledby="notifications-list-title">
        <header className="notifications-panel-heading">
          <div><span className="profile-heading-kicker">ВАШИ СОБЫТИЯ</span><h2 id="notifications-list-title">Лента уведомлений</h2><p>{unreadCount ? `${unreadCount} непрочитано` : "Непрочитанных уведомлений нет"}</p></div>
          <button className="notifications-read-all" type="button" disabled={pending || unreadCount === 0} onClick={() => act(async () => { const result = await markAllNotificationsReadAction(); return { ok: result.ok, error: result.error }; }, "Все уведомления отмечены прочитанными.")}>Прочитать все</button>
        </header>

        <div className="notifications-filters" aria-label="Фильтры уведомлений">
          <button type="button" className={!unreadOnly ? "is-active" : ""} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Все</button>
          <button type="button" className={unreadOnly ? "is-active" : ""} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Непрочитанные</button>
          <label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.target.value as NotificationCategory | "ALL")}><option value="ALL">Все категории</option>{NOTIFICATION_CATEGORIES.map((value) => <option key={value} value={value}>{NOTIFICATION_CATEGORY_META[value].label}</option>)}</select></label>
        </div>

        {feedback ? <p className="notifications-feedback" role="status">{feedback}</p> : null}
        {visible.length ? <ol className="notifications-list">{visible.map((notification) => <NotificationCard key={notification.deliveryId} notification={notification} pending={pending} onRead={() => act(() => markNotificationReadAction(notification.deliveryId), "Уведомление отмечено прочитанным.")} />)}</ol> : (
          <div className="notifications-empty" role="status"><span aria-hidden="true">♧</span><h3>{notifications.length ? "По выбранным фильтрам ничего нет" : "Пока нет уведомлений"}</h3><p>{notifications.length ? "Измените категорию или покажите все события." : "Когда в приложении появятся адресованные вам события, они будут показаны здесь."}</p></div>
        )}
      </section>

      <aside className="notification-settings-panel" aria-labelledby="notification-settings-title">
        <span className="profile-heading-kicker">ПЕРСОНАЛЬНЫЕ НАСТРОЙКИ</span><h2 id="notification-settings-title">Категории</h2>
        <p>Отключайте необязательные уведомления. Настройки сохраняются для вашего аккаунта.</p>
        <ul>{NOTIFICATION_CATEGORIES.map((value) => {
          const meta = NOTIFICATION_CATEGORY_META[value];
          const locked = !canMuteNotificationCategory(value);
          const enabled = locked || preferences[value] !== false;
          return <li key={value}><div><strong>{meta.label}</strong><small>{locked ? "Всегда включены" : meta.description}</small></div><button type="button" role="switch" aria-checked={enabled} aria-label={`${meta.label}: ${enabled ? "включены" : "отключены"}`} disabled={pending || locked} onClick={() => setPreference(value, !enabled)} className={`notification-switch${enabled ? " is-on" : ""}`}><span /></button></li>;
        })}</ul>
        <p className="notification-settings-note">В этом MVP отображаются только уведомления, созданные существующими событиями платформы. Для разделов без готовых событий записи не создаются.</p>
      </aside>
    </div>
  );
}

function NotificationCard({ notification, pending, onRead }: { notification: NotificationItem; pending: boolean; onRead: () => void }) {
  const target = notificationTarget(notification.category, notification.sourceId);
  const isUnread = notification.readAt === null;
  return (
    <li className={`notification-card${isUnread ? " is-unread" : ""}${notification.critical ? " is-critical" : ""}`}>
      <span className="notification-card-mark" aria-hidden="true">{notification.critical ? "!" : "•"}</span>
      <div className="notification-card-content">
        <div className="notification-card-meta"><span>{NOTIFICATION_CATEGORY_META[notification.category].label}</span><time dateTime={notification.createdAt}>{formatNotificationDate(notification.createdAt)}</time><span className={`notification-read-state${isUnread ? " is-new" : ""}`}>{isUnread ? "Новое" : "Прочитано"}</span></div>
        <h3>{notification.title}</h3><p>{notification.body}</p>
        <div className="notification-card-actions">{target ? <a href={target}>Перейти в раздел <span aria-hidden="true">↗</span></a> : <span className="notification-unavailable">Связанный раздел появится позже</span>}{isUnread ? <button type="button" disabled={pending} onClick={onRead}>Отметить как прочитанное</button> : null}</div>
      </div>
    </li>
  );
}
