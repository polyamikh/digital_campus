import { NotificationCategory } from "@/generated/prisma/enums";

export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, { label: string; description: string; href: string | null }> = {
  [NotificationCategory.CRITICAL_OFFICIAL]: { label: "Критически важные", description: "Официальные сообщения, которые нельзя отключить.", href: null },
  [NotificationCategory.OFFICIAL_ANNOUNCEMENT]: { label: "Официальные объявления", description: "Объявления деканата и университета.", href: null },
  [NotificationCategory.COURSE_ANNOUNCEMENT]: { label: "Объявления курсов", description: "Обновления учебных курсов.", href: null },
  [NotificationCategory.SCHEDULE]: { label: "Расписание", description: "Изменения и события расписания.", href: "/schedule" },
  [NotificationCategory.HOMEWORK]: { label: "Домашние задания", description: "Новые задания и сроки.", href: null },
  [NotificationCategory.TEST]: { label: "Тестирование", description: "Тесты и результаты.", href: "/testing" },
  [NotificationCategory.REQUEST]: { label: "Заявки и справки", description: "Статусы, уточнения и документы по заявкам.", href: "/requests" },
  [NotificationCategory.TASK]: { label: "Задачи", description: "Личные и назначенные задачи.", href: null },
  [NotificationCategory.CHAT]: { label: "Сообщения", description: "Новые сообщения в чатах.", href: null },
  [NotificationCategory.OTHER]: { label: "Системные", description: "Другие системные события.", href: null },
};

export const NOTIFICATION_CATEGORIES = Object.values(NotificationCategory);

export function notificationCategoryLabel(category: NotificationCategory): string {
  return NOTIFICATION_CATEGORY_META[category].label;
}

export function canMuteNotificationCategory(category: NotificationCategory): boolean {
  return category !== NotificationCategory.CRITICAL_OFFICIAL;
}

export function notificationRecipientScope(recipientId: string) {
  return { recipientId } as const;
}

export function notificationTarget(category: NotificationCategory, sourceId: string): string | null {
  if (category === NotificationCategory.REQUEST) return `/requests#request-${encodeURIComponent(sourceId)}`;
  if (category === NotificationCategory.SCHEDULE) return "/schedule";
  return NOTIFICATION_CATEGORY_META[category].href;
}

export function filterNotifications<T extends { category: NotificationCategory; readAt: string | null }>(
  notifications: readonly T[],
  filter: { unreadOnly: boolean; category: NotificationCategory | "ALL" },
): T[] {
  return notifications.filter((notification) =>
    (!filter.unreadOnly || notification.readAt === null) &&
    (filter.category === "ALL" || notification.category === filter.category),
  );
}

export function formatNotificationDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
