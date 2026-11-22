import { Suspense } from "react";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherNotifications } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherHeader } from "../teacher-route";
import TeacherNotificationsContent from "./teacher-notifications-content";

export default function TeacherNotificationsPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем уведомления…" />}><Content /></Suspense>; }
async function Content() {
  await requireTeacherPage(); const data = await getTeacherNotifications();
  return <TeacherAppShell activeSection="notifications"><div className="teacher-workspace-page">{teacherHeader("ЛИЧНЫЙ ЦЕНТР СОБЫТИЙ", "Уведомления", "События адресованы вашему аккаунту. Открытие страницы не создаёт новых уведомлений.")}<TeacherNotificationsContent {...data} /></div></TeacherAppShell>;
}
