import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { moscowDateKey } from "@/lib/schedule/moscow-time";
import { currentMoscowMonth, taskMonthGrid, validTaskDateKey, validTaskMonthKey, type TaskCalendarMode } from "@/lib/tasks/tasks-core";
import { getCurrentStudentTaskCalendar } from "@/lib/tasks/student-tasks";
import TasksContent from "./tasks-content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StudentTasksPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем календарь задач…" />}><AuthenticatedStudentTasks searchParams={searchParams} /></Suspense>;
}

async function AuthenticatedStudentTasks({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));

  const query = await searchParams;
  const monthCandidate = typeof query.month === "string" ? query.month : currentMoscowMonth();
  const month = validTaskMonthKey(monthCandidate) ? monthCandidate : currentMoscowMonth();
  const mode: TaskCalendarMode = query.mode === "week" || query.mode === "day" || query.mode === "list" ? query.mode : "month";
  const now = new Date();
  const candidateDay = typeof query.day === "string" && validTaskDateKey(query.day) ? query.day : null;
  const monthGrid = taskMonthGrid(month);
  const selectedDate = candidateDay && (mode === "week" || mode === "day" || (mode === "list" ? candidateDay.startsWith(month) : monthGrid.includes(candidateDay)))
    ? candidateDay
    : mode !== "list" && monthGrid.includes(moscowDateKey(now))
      ? moscowDateKey(now)
      : month + "-01";
  const calendar = await getCurrentStudentTaskCalendar(month, now, mode, selectedDate).catch(() => null);
  const [identity, photo] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { login: true, profile: { select: { displayName: true } } } }),
    getProfilePhotoMetadata(user.id),
  ]);
  const displayName = identity?.profile?.displayName || identity?.login || user.login;

  if (!calendar) {
    return (
      <StudentAppShell displayName={displayName} groupCode={null} photoVersion={photo?.version ?? null} activeSection="tasks">
        <section className="tasks-heading"><span className="profile-heading-kicker">ЛИЧНОЕ ПЛАНИРОВАНИЕ</span><h1>Календарь задач</h1></section>
        <section className="tasks-empty tasks-error" role="alert"><span aria-hidden="true">!</span><h2>Не удалось загрузить календарь</h2><p>Попробуйте открыть раздел позже. Данные задач не изменены.</p></section>
      </StudentAppShell>
    );
  }

  const serialized = {
    ...calendar,
    events: calendar.events.map((event) => ({ ...event, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt?.toISOString() ?? null, reminderAt: event.reminderAt?.toISOString() ?? null })),
    tasksWithoutDate: calendar.tasksWithoutDate.map((task) => ({ ...task, dueAt: null, endsAt: null, reminderAt: task.reminderAt?.toISOString() ?? null })),
  };

  return (
    <StudentAppShell displayName={displayName} groupCode={calendar.groupCode} photoVersion={photo?.version ?? null} activeSection="tasks">
      <section className="tasks-heading" aria-labelledby="tasks-title">
        <div><span className="profile-heading-kicker">ЛИЧНОЕ ПЛАНИРОВАНИЕ</span><h1 id="tasks-title">Календарь задач</h1><p>Личные планы и учебные события вашей группы в одном календаре.</p></div>
        <a className="tasks-export-button" href={"/api/tasks/export?month=" + encodeURIComponent(month)}>Скачать .ics</a>
      </section>
      <TasksContent
        month={month}
        mode={mode}
        selectedDate={selectedDate}
        today={calendar.today}
        events={serialized.events}
        tasksWithoutDate={serialized.tasksWithoutDate}
        membershipProblem={calendar.membershipProblem}
        notificationPreferenceEnabled={calendar.notificationPreferenceEnabled}
      />
    </StudentAppShell>
  );
}
