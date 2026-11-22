import "server-only";

import { NotificationCategory, NotificationChannel, Role } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { canMuteNotificationCategory, notificationRecipientScope } from "./notification-core";

const visibleDeliveryWhere = {
  OR: [
    { mutedAt: null },
    { notification: { is: { critical: true } } },
    { notification: { is: { category: NotificationCategory.CRITICAL_OFFICIAL } } },
  ],
} satisfies Prisma.NotificationDeliveryWhereInput;

export type StudentNotificationRecord = {
  deliveryId: string;
  category: NotificationCategory;
  critical: boolean;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  sourceId: string;
  sourceType: string;
};

export async function getCurrentStudentNotificationCenter() {
  const user = await requireRole(Role.STUDENT);
  const where = { ...notificationRecipientScope(user.id), ...visibleDeliveryWhere } satisfies Prisma.NotificationDeliveryWhereInput;
  const [deliveries, preferences, unreadCount] = await Promise.all([
    prisma.notificationDelivery.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        readAt: true,
        notification: { select: { category: true, critical: true, title: true, body: true, sourceId: true, sourceType: true } },
      },
    }),
    prisma.notificationPreference.findMany({ where: { userId: user.id }, select: { category: true, muted: true } }),
    prisma.notificationDelivery.count({ where: { ...where, readAt: null, channel: NotificationChannel.IN_APP } }),
  ]);

  return {
    notifications: deliveries.map((delivery): StudentNotificationRecord => ({
      deliveryId: delivery.id,
      category: delivery.notification.category,
      critical: delivery.notification.critical || delivery.notification.category === NotificationCategory.CRITICAL_OFFICIAL,
      title: delivery.notification.title,
      body: delivery.notification.body,
      createdAt: delivery.createdAt,
      readAt: delivery.readAt,
      sourceId: delivery.notification.sourceId,
      sourceType: delivery.notification.sourceType,
    })),
    preferences: Object.fromEntries(preferences.map(({ category, muted }) => [category, !muted])) as Partial<Record<NotificationCategory, boolean>>,
    unreadCount,
  };
}

export async function getCurrentStudentUnreadNotificationCount(): Promise<number> {
  const user = await requireRole(Role.STUDENT);
  return prisma.notificationDelivery.count({
    where: {
      ...notificationRecipientScope(user.id),
      readAt: null,
      channel: NotificationChannel.IN_APP,
      ...visibleDeliveryWhere,
    },
  });
}

export async function markCurrentStudentNotificationRead(deliveryId: string): Promise<number> {
  const user = await requireRole(Role.STUDENT);
  const result = await prisma.notificationDelivery.updateMany({
    where: { id: deliveryId, ...notificationRecipientScope(user.id), readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function markAllCurrentStudentNotificationsRead(): Promise<number> {
  const user = await requireRole(Role.STUDENT);
  const result = await prisma.notificationDelivery.updateMany({
    where: { ...notificationRecipientScope(user.id), readAt: null, channel: NotificationChannel.IN_APP, ...visibleDeliveryWhere },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function setCurrentStudentNotificationPreference(category: NotificationCategory, enabled: boolean): Promise<boolean> {
  const user = await requireRole(Role.STUDENT);
  if (!canMuteNotificationCategory(category)) return false;

  await prisma.$transaction(async (tx) => {
    await tx.notificationPreference.upsert({
      where: { userId_category: { userId: user.id, category } },
      create: { userId: user.id, category, muted: !enabled },
      update: { muted: !enabled },
    });
    await tx.notificationDelivery.updateMany({
      where: {
        ...notificationRecipientScope(user.id),
        readAt: null,
        notification: { is: { category, critical: false } },
      },
      data: { mutedAt: enabled ? null : new Date() },
    });
  });
  return true;
}
