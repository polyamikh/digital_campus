import assert from "node:assert/strict";
import test from "node:test";
import { NotificationCategory } from "@/generated/prisma/enums";
import { canMuteNotificationCategory, filterNotifications, formatNotificationDate, notificationCategoryLabel, notificationRecipientScope, notificationTarget } from "./notification-core";

test("notification categories use the existing Prisma taxonomy", () => {
  assert.equal(notificationCategoryLabel(NotificationCategory.REQUEST), "Заявки и справки");
  assert.equal(notificationCategoryLabel(NotificationCategory.SCHEDULE), "Расписание");
  assert.equal(canMuteNotificationCategory(NotificationCategory.REQUEST), true);
  assert.equal(canMuteNotificationCategory(NotificationCategory.CRITICAL_OFFICIAL), false);
});

test("notification links only target implemented sections", () => {
  assert.equal(notificationTarget(NotificationCategory.REQUEST, "request id"), "/requests#request-request%20id");
  assert.equal(notificationTarget(NotificationCategory.SCHEDULE, "lesson-id"), "/schedule");
  assert.equal(notificationTarget(NotificationCategory.TEST, "test-id"), null);
});

test("notification recipient scope is bound to the authenticated recipient and dates use Moscow time", () => {
  assert.deepEqual(notificationRecipientScope("alice-id"), { recipientId: "alice-id" });
  assert.match(formatNotificationDate("2026-11-19T16:00:00.000Z"), /19:00/);
});

test("notification filters combine unread and category without changing source list", () => {
  const notifications = [
    { category: NotificationCategory.REQUEST, readAt: null, id: "new-request" },
    { category: NotificationCategory.SCHEDULE, readAt: "2026-11-19T10:00:00Z", id: "read-schedule" },
    { category: NotificationCategory.REQUEST, readAt: "2026-11-19T11:00:00Z", id: "read-request" },
  ];
  assert.deepEqual(filterNotifications(notifications, { unreadOnly: true, category: NotificationCategory.REQUEST }).map(({ id }) => id), ["new-request"]);
  assert.equal(notifications.length, 3);
});
