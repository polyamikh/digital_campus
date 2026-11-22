"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { lessonCountsByMoscowDate, lessonsOnMoscowDate } from "@/lib/schedule/schedule-view";
import type { StudentHomeSchedule } from "@/lib/schedule/student-home-schedule";

const weekdays = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
type ScheduleData = Omit<StudentHomeSchedule, "groupCode">;
type DashboardData = {
  todayTasks: Array<{ id: string; title: string; category: string; state: string; time: string | null }>;
  deadlines: Array<{ id: string; title: string; course: string; dueAt: string; href: string; kind: string }>;
  grades: { semester: string | null; courseCount: number; accumulated: number; available: number; unresolvedWorks: number } | null;
  events: Array<{ id: string; title: string; startsAt: string; location: string | null }>;
  opportunities: Array<{ id: string; title: string; organization: string; category: string }>;
  notifications: Array<{ id: string; title: string; category: string; createdAt: string; read: boolean }>;
  unavailable: { tasks: boolean; grades: boolean; deadlines: boolean; career: boolean; notifications: boolean };
};

function formatDay(dateKey: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function moscowWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return weekdays.map((weekday, index) => {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + index);
    return { weekday, date: value.getUTCDate(), dateKey: value.toISOString().slice(0, 10) };
  });
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function SectionHeading({ title, href, link = "Открыть" }: { title: string; href?: string; link?: string }) {
  return <div className="home-section-title"><h2>{title}</h2>{href ? <Link href={href}>{link}<span aria-hidden="true"> ↗</span></Link> : null}</div>;
}

function CalendarStrip({ schedule, selectedDate, selectDate }: { schedule: ScheduleData; selectedDate: string; selectDate: (value: string) => void }) {
  const days = useMemo(() => moscowWeek(schedule.todayDate), [schedule.todayDate]);
  const counts = lessonCountsByMoscowDate(schedule.lessons);
  return <section className="home-calendar" aria-label="Календарь учебной недели">
    <div className="home-calendar-heading"><div><span className="home-eyebrow">НЕДЕЛЯ</span><h3>{formatDay(schedule.todayDate, { month: "long", year: "numeric" })}</h3></div><Link href={`/schedule?week=${schedule.todayDate}&day=${selectedDate}`}>Все расписание <span aria-hidden="true">↗</span></Link></div>
    <div className="calendar-week" aria-label="Даты недели">
      {days.map((item) => <button className={`calendar-day${item.dateKey === schedule.todayDate ? " is-today" : ""}${item.dateKey === selectedDate ? " is-selected" : ""}`} type="button" key={item.dateKey} aria-pressed={item.dateKey === selectedDate} aria-current={item.dateKey === schedule.todayDate ? "date" : undefined} aria-label={`${item.weekday}, ${formatDay(item.dateKey)}${counts.get(item.dateKey) ? `, занятий: ${counts.get(item.dateKey)}` : ", занятий нет"}`} onClick={() => selectDate(item.dateKey)}>
        <span>{item.weekday}</span><strong>{item.date}</strong><i className="calendar-count">{counts.get(item.dateKey) ? counts.get(item.dateKey) : ""}</i>
      </button>)}
    </div>
  </section>;
}

function SchedulePanel({ schedule, selectedDate, selectDate }: { schedule: ScheduleData; selectedDate: string; selectDate: (value: string) => void }) {
  const lessons = lessonsOnMoscowDate(schedule.lessons, selectedDate);
  const dateTitle = selectedDate === schedule.todayDate ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00.000Z`));
  return <section className="home-panel home-schedule" aria-labelledby="home-schedule-title">
    <div className="home-panel-heading"><div><span className="home-eyebrow">УЧЕБНЫЙ ДЕНЬ</span><h2 id="home-schedule-title">Расписание</h2></div><span className="home-date-label">{dateTitle}, {formatDay(selectedDate)}</span></div>
    <CalendarStrip schedule={schedule} selectedDate={selectedDate} selectDate={selectDate} />
    {schedule.timeWindowViolationCount > 0 ? <p className="schedule-data-warning" role="status">Есть занятия вне утверждённых временных интервалов: {schedule.timeWindowViolationCount}. Данные не менялись.</p> : null}
    {schedule.membershipProblem ? <p className="home-empty">{schedule.membershipProblem === "missing" ? "Не найдено активное членство в учебной группе." : "Не удалось однозначно определить вашу учебную группу."}</p> : lessons.length ? <ol className="home-lesson-list">{lessons.map((lesson) => <li className={`home-lesson${lesson.type === "Экзамен" ? " lesson-exam" : ""}`} key={lesson.id}><time><strong>{lesson.startTime}</strong><span>{lesson.endTime}</span></time><span className="home-lesson-line" aria-hidden="true"/><div><span className="lesson-kind">{lesson.type}</span><h3>{lesson.discipline}</h3><p>{lesson.teacherOrExaminer ? `${lesson.type === "Экзамен" ? "Экзаменатор" : "Преподаватель"}: ${lesson.teacherOrExaminer}` : ""}{lesson.room ? `${lesson.teacherOrExaminer ? " · " : ""}Ауд. ${lesson.room}` : ""}</p></div></li>)}</ol> : <p className="home-empty">На выбранную дату занятий нет.</p>}
  </section>;
}

export default function StudentHomeContent({ schedule, dashboard, firstName }: { schedule: ScheduleData; dashboard: DashboardData; firstName: string }) {
  const [selectedDate, setSelectedDate] = useState(schedule.todayDate);
  const average = dashboard.grades && dashboard.grades.available > 0 ? dashboard.grades.accumulated / dashboard.grades.available * 100 : null;
  return <>
    <div className="student-home-grid">
      <div className="home-welcome-stack">
        <section className="hero home-welcome" aria-labelledby="welcome-title">
          <div className="home-welcome-main">
            <div><span className="home-eyebrow">СТУДЕНЧЕСКИЙ КАБИНЕТ</span><h1 className="hero-title" id="welcome-title"><span>Привет,</span><span>{firstName}!</span></h1></div>
            <span className="hero-divider" aria-hidden="true" />
            <p className="hero-copy">Твой учебный день,<br />задачи и возможности —<br />в одном пространстве.</p>
          </div>
        </section>
        <div className="home-summary-strip" aria-label="Краткая сводка">
          <div><span>СЕГОДНЯ</span><strong>{formatDay(schedule.todayDate, { weekday: "short", day: "numeric", month: "long" })}</strong></div>
          <div><span>ТЕКУЩИЙ СЕМЕСТР</span><strong>{dashboard.grades?.semester ?? "Данные недоступны"}</strong></div>
          <div><span>НАКОПЛЕНО</span><strong>{dashboard.grades?.available ? `${dashboard.grades.accumulated.toFixed(1).replace(".", ",")} / ${dashboard.grades.available.toFixed(1).replace(".", ",")}` : dashboard.unavailable.grades ? "Данные недоступны" : "Оценок пока нет"}</strong><small>{average === null ? "" : `Предварительно ${average.toFixed(2).replace(".", ",")}%`}</small></div>
        </div>
      </div>

      <section className="home-panel home-deadlines"><SectionHeading title="Ближайшие дедлайны" href="/homework"/>{dashboard.unavailable.deadlines ? <p className="home-empty">Не удалось загрузить сроки.</p> : dashboard.deadlines.length ? <ul className="home-deadline-list">{dashboard.deadlines.map((item) => <li key={item.id}><time>{dateTime(item.dueAt)}</time><Link href={item.href}><strong>{item.title}</strong><small>{item.course} · {item.kind}</small></Link></li>)}</ul> : <p className="home-empty">Ближайших дедлайнов пока нет.</p>}</section>

      <SchedulePanel schedule={schedule} selectedDate={selectedDate} selectDate={setSelectedDate}/>
      <section className="home-panel home-tasks"><SectionHeading title="Задачи на сегодня" href="/tasks"/><p className="home-panel-caption">Личные планы из вашего календаря</p>{dashboard.unavailable.tasks ? <p className="home-empty">Не удалось загрузить задачи.</p> : dashboard.todayTasks.length ? <ul className="home-compact-list">{dashboard.todayTasks.map((task) => <li key={task.id}><span className={`task-state-mark${task.state === "COMPLETED" ? " is-done" : ""}`} aria-hidden="true">{task.state === "COMPLETED" ? "✓" : ""}</span><span><strong>{task.title}</strong><small>{task.time ?? "Весь день"} · {task.category === "STUDY" ? "Учёба" : task.category === "WORK" ? "Работа" : "Личное"}</small></span></li>)}</ul> : <p className="home-empty">На сегодня личных задач нет.</p>}</section>
      <section className="home-panel home-events"><SectionHeading title="События кампуса" href="/career" link="Мероприятия"/>{dashboard.unavailable.career ? <p className="home-empty">Не удалось загрузить события.</p> : dashboard.events.length ? <ul className="home-event-list">{dashboard.events.map((event) => <li key={event.id}><time>{dateTime(event.startsAt)}</time><strong>{event.title}</strong><small>{event.location || "Место уточняется"}</small></li>)}</ul> : <p className="home-empty">Предстоящих мероприятий пока нет.</p>}</section>

      <section className="home-panel home-performance"><SectionHeading title="Успеваемость" href="/grades"/><div className="home-performance-score">{dashboard.unavailable.grades ? <strong>Нет данных</strong> : average === null ? <strong>Оценок пока нет</strong> : <><strong>{average.toFixed(2).replace(".", ",")}%</strong><span>предварительно по опубликованным компонентам</span></>}</div><div className="home-performance-meta"><span>{dashboard.grades?.courseCount ?? 0} дисциплин</span><span>{dashboard.grades?.unresolvedWorks ?? 0} работ ожидают публикации</span></div></section>
      <section className="home-panel home-career"><SectionHeading title="Карьерные возможности" href="/career"/>{dashboard.unavailable.career ? <p className="home-empty">Не удалось загрузить карьерные возможности.</p> : dashboard.opportunities.length ? <ul className="home-opportunities">{dashboard.opportunities.map((item) => <li key={item.id}><span className="home-opportunity-mark" aria-hidden="true">↗</span><span><strong>{item.title}</strong><small>{item.organization} · {item.category}</small></span><Link href={`/career/${item.id}`} aria-label={`Открыть: ${item.title}`}>↗</Link></li>)}</ul> : <p className="home-empty">Опубликованных возможностей пока нет.</p>}</section>
      <section className="home-ai-panel"><div className="home-ai-art" aria-hidden="true"><span/><span/><span/></div><span className="home-eyebrow">CAMPUS AI</span><h2>Помощь в учёбе и делах</h2><p>Детерминированные подсказки и навигация по данным, доступным платформе.</p><Link href="/assistant">Открыть помощника <span aria-hidden="true">↗</span></Link></section>
      <section className="home-panel home-notices"><SectionHeading title="Уведомления" href="/notifications"/>{dashboard.unavailable.notifications ? <p className="home-empty">Не удалось загрузить уведомления.</p> : dashboard.notifications.length ? <ul className="home-notice-list">{dashboard.notifications.map((notice) => <li key={notice.id} className={notice.read ? "" : "is-unread"}><span aria-hidden="true"/><div><strong>{notice.title}</strong><small>{notice.category.replaceAll("_", " ")} · {dateTime(notice.createdAt)}</small></div></li>)}</ul> : <p className="home-empty">Новых уведомлений нет.</p>}</section>
    </div>
    <footer className="page-footer"><span>DIGITAL CAMPUS · МГИМО</span><span>Демонстрационный концепт</span></footer>
  </>;
}
