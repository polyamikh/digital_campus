import { Suspense } from "react";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherNotifications } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage } from "../teacher-route";
import TeacherNotificationsContent from "./teacher-notifications-content";

export default function TeacherNotificationsPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем уведомления…" />}><Content /></Suspense>; }
async function Content() {
  await requireTeacherPage(); const data = await getTeacherNotifications();
  return <TeacherAppShell activeSection="notifications"><div className="teacher-workspace-page"><section className="notifications-page-heading" aria-labelledby="teacher-notifications-title"><span className="profile-heading-kicker">ЦЕНТР ОБНОВЛЕНИЙ</span><h1 id="teacher-notifications-title">Уведомления</h1><p>События, адресованные вашему аккаунту преподавателя. Критически важные сообщения всегда остаются включёнными.</p></section><TeacherNotificationsContent {...data} /></div></TeacherAppShell>;
}
