import { Suspense } from "react";
import Link from "next/link";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherSchedule } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherDate, teacherTime } from "../teacher-route";
import { moscowDateKey } from "@/lib/schedule/moscow-time";
import TeacherSubstitutionForm from "./teacher-substitution-form";
import { getDefaultAcademicSemester } from "@/lib/academic-calendar/academic-year-2026-2027";

export default function TeacherSchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем расписание…" />}><Content searchParams={searchParams} /></Suspense>; }

async function Content({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  await requireTeacherPage();
  const params = await searchParams;
  const data = await getTeacherSchedule(params.date);
  const days = Array.from({ length: 7 }, (_, index) => new Date(data.weekStart.getTime() + index * 86400000));
  const previousKey = moscowDateKey(new Date(data.weekStart.getTime() - 7 * 86400000));
  const nextKey = moscowDateKey(new Date(data.weekStart.getTime() + 7 * 86400000));
  const today = moscowDateKey(new Date());
  const weekLabel = `${teacherDate(data.weekStart)} — ${teacherDate(new Date(data.weekEnd.getTime() - 1))}`;
  return <TeacherAppShell activeSection="schedule"><div className="teacher-workspace-page">
    <section className="schedule-page-heading"><span className="profile-heading-kicker">УЧЕБНЫЙ ПРОЦЕСС</span><h1>Расписание</h1><p>Официальные занятия, экзамены и консультации по вашим назначениям.</p></section>
    <section className="schedule-page-card" aria-label="Недельное расписание">
      <div className="schedule-toolbar"><div className="schedule-week-navigation" aria-label="Навигация по неделям"><Link className="schedule-nav-arrow" href={`/teacher/schedule?date=${previousKey}`} aria-label="Предыдущая неделя">←</Link><h2 aria-live="polite">{weekLabel}</h2><Link className="schedule-nav-arrow" href={`/teacher/schedule?date=${nextKey}`} aria-label="Следующая неделя">→</Link></div><Link className="schedule-today-button" href={`/teacher/schedule?date=${today}`}>Сегодня</Link><a className="teacher-secondary-link" href={`/teacher/calendar/export?semester=${getDefaultAcademicSemester(new Date())}`}>Экспорт .ics</a></div>
      <div className="schedule-page-meta"><span>Все назначенные занятия · время по Москве</span></div>
      <div className="schedule-week-grid" aria-label="Расписание по дням недели">{days.map((day) => { const key = moscowDateKey(day); const lessons = data.lessons.filter((lesson) => moscowDateKey(lesson.startsAt) === key); const isToday = key === today; return <section className={`schedule-week-day${isToday ? " is-today" : ""}`} key={key} aria-labelledby={`teacher-schedule-${key}`}><div className="schedule-week-day-heading"><span>{new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Europe/Moscow" }).format(day)}</span><strong id={`teacher-schedule-${key}`}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" }).format(day)}</strong>{isToday ? <small>Сегодня</small> : <small aria-hidden="true">&nbsp;</small>}</div><div className="schedule-week-day-lessons">{lessons.map((lesson, index) => { const roleLabel = lesson.teacherId === data.teacherId ? "Преподаватель" : lesson.examinerId === data.teacherId ? "Экзаменатор" : "Замена"; let onlineUrl: string | null = null; try { const parsed = lesson.format ? new URL(lesson.format) : null; if (parsed?.protocol === "https:") onlineUrl = parsed.href; } catch { onlineUrl = null; } return <article className={`schedule-week-lesson lesson-${lesson.kind === "EXAM" ? "pink" : index % 2 === 0 ? "cyan" : "violet"}`} key={lesson.id}><div className="schedule-week-lesson-time"><strong>{teacherTime(lesson.startsAt)}</strong><span>{teacherTime(lesson.endsAt)}</span></div><span className="lesson-kind">{lesson.kind === "EXAM" ? "ЭКЗАМЕН" : "ЗАНЯТИЕ"}</span><h3>{lesson.course.subject.name}</h3><p>{lesson.group.code} · {lesson.room?.code ?? "Аудитория не указана"}</p><small>{roleLabel}</small>{onlineUrl ? <a href={onlineUrl} target="_blank" rel="noopener noreferrer">Подключиться ↗</a> : null}</article>; })}{!lessons.length ? <p className="schedule-day-empty">Нет занятий</p> : null}</div></section>; })}</div>
    </section>
    <section className="teacher-data-card teacher-schedule-request-panel"><details><summary>Запросить изменение</summary><p>Выберите занятие, предложите преподавателя на замену и укажите причину. Запрос поступит в деканат.</p><div className="teacher-schedule-request-list">{data.requestableLessons.map((lesson) => { const substitutes = data.substitutes.filter((item) => item.courseId === lesson.courseId && item.groupId === lesson.groupId); return substitutes.length ? <div className="teacher-schedule-request-item" key={lesson.id}><h3>{lesson.course.subject.name} · {lesson.group.code}</h3><p>{teacherDate(lesson.startsAt)} · {teacherTime(lesson.startsAt)}–{teacherTime(lesson.endsAt)}</p><TeacherSubstitutionForm lessonId={lesson.id} substitutes={substitutes}/></div> : null; })}{data.requestableLessons.length === 0 ? <p>Нет будущих занятий, для которых можно запросить замену.</p> : null}</div></details></section>
    <div className="teacher-schedule-secondary"><section className="teacher-data-card"><h2>Часы консультаций</h2><p>{data.officeHours ?? "Не указаны в профиле."}</p></section><section className="teacher-data-card"><h2>Мои запросы на изменения</h2>{data.requests.length ? <ul>{data.requests.map((request) => <li key={request.id}><strong>{request.lesson.course.subject.name} · {request.lesson.group.code}</strong><span>{request.kind} · {request.state}</span><small>{request.reason ?? "Причина не указана"}</small></li>)}</ul> : <p>Запросов на этой неделе нет.</p>}</section></div>
  </div></TeacherAppShell>;
}
