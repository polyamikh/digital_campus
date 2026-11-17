import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { homePathForRole } from "@/lib/auth/role-routes";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { getStudentScheduleForWeek, type StudentLessonDto } from "@/lib/schedule/student-home-schedule";
import { moscowDateKey } from "@/lib/schedule/moscow-time";
import { getWeekDateKeys, scheduleDayVisualState, selectedScheduleDay, shiftScheduleWeek, validScheduleDateKey } from "@/lib/schedule/schedule-week-core";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StudentSchedulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AuthRouteFallback message="Загружаем расписание…" />}>
      <AuthenticatedStudentSchedule searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthenticatedStudentSchedule({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));

  const now = new Date();
  const today = moscowDateKey(now);
  const query = await searchParams;
  const requestedWeek = validScheduleDateKey(query.week) ?? today;
  const days = getWeekDateKeys(requestedWeek);
  const weekStart = days[0] ?? today;
  const selectedDay = selectedScheduleDay(query.day, days, today);
  const schedule = await getStudentScheduleForWeek(user.id, new Date(`${weekStart}T12:00:00.000Z`), now);
  const student = await prisma.user.findUnique({
    where: { id: user.id },
    select: { login: true, profile: { select: { displayName: true } } },
  });
  const displayName = student?.profile?.displayName || student?.login || user.login;
  const photo = await getProfilePhotoMetadata(user.id);
  const weekEnd = days[6] ?? weekStart;
  const weekLabel = formatDayMonth(weekStart) === formatDayMonth(weekEnd)
    ? formatDayMonth(weekStart)
    : `${formatDayMonth(weekStart)} — ${formatDayMonth(weekEnd)}`;
  const previousWeek = shiftScheduleWeek(weekStart, -1);
  const nextWeek = shiftScheduleWeek(weekStart, 1);
  const todayWeek = getWeekDateKeys(today)[0] ?? today;

  return (
    <StudentAppShell displayName={displayName} groupCode={schedule.groupCode} photoVersion={photo?.version ?? null} activeSection="schedule">
      <section className="schedule-page-heading" aria-labelledby="schedule-page-title">
        <span className="profile-heading-kicker">УЧЕБНЫЙ ПРОЦЕСС</span>
        <h1 id="schedule-page-title">Расписание</h1>
        <p>Утверждённые занятия и экзамены вашей учебной группы.</p>
      </section>

      <section className="schedule-page-card" aria-label="Недельное расписание">
        <div className="schedule-toolbar">
          <div className="schedule-week-navigation" aria-label="Навигация по неделям">
            <Link className="schedule-nav-arrow" href={scheduleHref(previousWeek, shiftScheduleWeek(selectedDay, -1))} aria-label="Предыдущая неделя">←</Link>
            <h2 aria-live="polite">{weekLabel}</h2>
            <Link className="schedule-nav-arrow" href={scheduleHref(nextWeek, shiftScheduleWeek(selectedDay, 1))} aria-label="Следующая неделя">→</Link>
          </div>
          <Link className="schedule-today-button" href={scheduleHref(todayWeek, today)}>Сегодня</Link>
        </div>

        <div className="schedule-page-meta">
          <span>{schedule.groupCode ? `Группа ${schedule.groupCode}` : "Группа не определена"}</span>
          <span>Время указано по Москве</span>
        </div>

        {schedule.timeWindowViolationCount > 0 ? (
          <p className="schedule-data-warning" role="status">В этой неделе обнаружено записей вне утверждённых временных интервалов: {schedule.timeWindowViolationCount}. Данные показаны без изменений.</p>
        ) : null}

        {schedule.membershipProblem ? (
          <div className="schedule-page-empty" role="status">
            <strong>{schedule.membershipProblem === "missing" ? "Учебная группа не найдена" : "Не удалось определить группу"}</strong>
            <span>{schedule.membershipProblem === "missing" ? "Для аккаунта нет активного членства в учебной группе. Обратитесь в деканат, если это ошибка." : "Для аккаунта найдено несколько активных групп. Расписание временно скрыто до уточнения данных."}</span>
          </div>
        ) : (
          <div className="schedule-week-grid" aria-label="Расписание по дням недели">
            {days.map((day) => {
              const dayLessons = schedule.lessons.filter((lesson) => lesson.date === day);
              const { isSelected, isToday } = scheduleDayVisualState(day, today, selectedDay);
              return (
                <section className={`schedule-week-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`} key={day} aria-labelledby={`schedule-day-${day}`}>
                  <Link className="schedule-week-day-heading" href={scheduleHref(weekStart, day)} aria-current={isSelected ? "date" : undefined}>
                    <span>{weekdayName(day)}</span>
                    <strong id={`schedule-day-${day}`}>{dayNumber(day)}</strong>
                    {isToday ? <small>Сегодня</small> : <small aria-hidden="true">&nbsp;</small>}
                  </Link>
                  <div className="schedule-week-day-lessons">
                    {dayLessons.map((lesson, index) => <ScheduleLessonCard lesson={lesson} index={index} key={lesson.id} />)}
                    {dayLessons.length === 0 ? <p className="schedule-day-empty">Нет занятий</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </StudentAppShell>
  );
}

function ScheduleLessonCard({ lesson, index }: { lesson: StudentLessonDto; index: number }) {
  const isExam = lesson.type === "Экзамен";
  const tone = isExam ? "pink" : index % 2 === 0 ? "cyan" : "violet";
  const staffLabel = isExam ? "Экзаменатор" : "Преподаватель";
  return (
    <article className={`schedule-week-lesson lesson-${tone}`}>
      <div className="schedule-week-lesson-time"><strong>{lesson.startTime}</strong><span>{lesson.endTime}</span></div>
      <span className="lesson-kind">{lesson.type.toLocaleUpperCase("ru-RU")}</span>
      <h3>{lesson.discipline}</h3>
      {lesson.teacherOrExaminer ? <p>{staffLabel}: {lesson.teacherOrExaminer}</p> : null}
      {lesson.room ? <p>Ауд. {lesson.room}</p> : null}
    </article>
  );
}

function scheduleHref(week: string, day: string): string {
  return `/schedule?week=${encodeURIComponent(week)}&day=${encodeURIComponent(day)}`;
}

function dateAtUtcNoon(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function weekdayName(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" }).format(dateAtUtcNoon(value)).replace(".", "").toLocaleUpperCase("ru-RU");
}

function dayNumber(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "2-digit" }).format(dateAtUtcNoon(value));
}

function formatDayMonth(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" }).format(dateAtUtcNoon(value));
}
