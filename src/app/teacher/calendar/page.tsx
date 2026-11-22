import { Suspense } from "react";
import AuthRouteFallback from "@/app/auth-route-fallback";
import TeacherAppShell from "../teacher-app-shell";
import TeacherCalendarContent from "./teacher-calendar-content";
import { getTeacherCalendar } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherHeader } from "../teacher-route";

export default function TeacherCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем календарь преподавателя…" />}><Content searchParams={searchParams} /></Suspense>; }
async function Content({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireTeacherPage(); const params = await searchParams; const data = await getTeacherCalendar(params.month);
  return <TeacherAppShell activeSection="calendar"><div className="teacher-workspace-page">{teacherHeader("УЧЕБНЫЕ И ЛИЧНЫЕ СОБЫТИЯ", "Календарь", "Занятия, ожидающие проверки работы и ваши личные события.")}<TeacherCalendarContent data={data} /></div></TeacherAppShell>;
}
