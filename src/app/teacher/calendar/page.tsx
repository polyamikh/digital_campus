import { Suspense } from "react";
import AuthRouteFallback from "@/app/auth-route-fallback";
import TeacherAppShell from "../teacher-app-shell";
import TeacherCalendarContent from "./teacher-calendar-content";
import { getTeacherCalendar } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherHeader } from "../teacher-route";

export default function TeacherCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string; mode?: "month" | "week" | "day" | "list" }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем календарь преподавателя…" />}><Content searchParams={searchParams} /></Suspense>; }
async function Content({ searchParams }: { searchParams: Promise<{ month?: string; day?: string; mode?: "month" | "week" | "day" | "list" }> }) {
  await requireTeacherPage(); const params = await searchParams; const data = await getTeacherCalendar(params.month, params.mode, params.day);
  const serialized = { ...data, lessons: data.lessons.map((lesson) => ({ ...lesson, startsAt: lesson.startsAt.toISOString(), endsAt: lesson.endsAt.toISOString() })), personalTasks: data.personalTasks.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null, endsAt: task.endsAt?.toISOString() ?? null, reminders: task.reminders.map((reminder) => ({ scheduledAt: reminder.scheduledAt.toISOString() })) })), tasksWithoutDate: data.tasksWithoutDate.map((task) => ({ ...task, dueAt: null, endsAt: null, reminders: task.reminders.map((reminder) => ({ scheduledAt: reminder.scheduledAt.toISOString() })) })), submissions: data.submissions.map((item) => ({ ...item, submittedAt: item.submittedAt?.toISOString() ?? null })), homeworkDeadlines: data.homeworkDeadlines.map((item) => ({ ...item, deadline: item.deadline?.toISOString() ?? null })), tests: data.tests.map((item) => ({ ...item, closesAt: item.closesAt?.toISOString() ?? null })) };
  return <TeacherAppShell activeSection="calendar"><div className="teacher-workspace-page">{teacherHeader("УЧЕБНЫЕ И ЛИЧНЫЕ СОБЫТИЯ", "Календарь", "Занятия, проверка работ и ваши личные события.")}<TeacherCalendarContent data={serialized} /></div></TeacherAppShell>;
}
