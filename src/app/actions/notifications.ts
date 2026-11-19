"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NotificationCategory } from "@/generated/prisma/enums";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { markAllCurrentStudentNotificationsRead, markCurrentStudentNotificationRead, setCurrentStudentNotificationPreference } from "@/lib/notifications/student-notifications";

async function isSameOriginAction(): Promise<boolean> {
  const requestHeaders = await headers();
  return isSameOriginRequest(
    requestHeaders.get("origin"),
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
    process.env.NODE_ENV === "production",
  );
}

export async function markNotificationReadAction(deliveryId: string) {
  if (!(await isSameOriginAction()) || !isUuid(deliveryId)) return { ok: false, error: "Уведомление не найдено." };
  try {
    const count = await markCurrentStudentNotificationRead(deliveryId);
    revalidatePath("/notifications");
    revalidatePath("/");
    return count === 1 ? { ok: true, error: null } : { ok: false, error: "Уведомление уже прочитано или недоступно." };
  } catch {
    return { ok: false, error: "Не удалось обновить уведомление." };
  }
}

export async function markAllNotificationsReadAction() {
  if (!(await isSameOriginAction())) return { ok: false, error: "Запрос отклонён." };
  try {
    const count = await markAllCurrentStudentNotificationsRead();
    revalidatePath("/notifications");
    revalidatePath("/");
    return { ok: true, error: null, count };
  } catch {
    return { ok: false, error: "Не удалось отметить уведомления прочитанными." };
  }
}

export async function setNotificationCategoryPreferenceAction(categoryValue: string, enabled: boolean) {
  if (!(await isSameOriginAction())) return { ok: false, error: "Запрос отклонён." };
  if (!Object.values(NotificationCategory).includes(categoryValue as NotificationCategory) || typeof enabled !== "boolean") {
    return { ok: false, error: "Некорректная настройка уведомлений." };
  }
  try {
    const saved = await setCurrentStudentNotificationPreference(categoryValue as NotificationCategory, enabled);
    revalidatePath("/notifications");
    revalidatePath("/");
    return saved ? { ok: true, error: null } : { ok: false, error: "Критически важные уведомления нельзя отключить." };
  } catch {
    return { ok: false, error: "Не удалось сохранить настройку." };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
