"use client";

import { useEffect, useState } from "react";

const weekdays = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

const lessons = [
  {
    start: "10:00",
    end: "11:30",
    title: "Digital Marketing",
    kind: "ЛЕКЦИЯ · ПРИМЕР",
    teacher: "Мария Волкова",
    room: "Аудитория — пример",
    color: "cyan",
  },
  {
    start: "12:10",
    end: "13:40",
    title: "Digital Marketing",
    kind: "СЕМИНАР · ПРИМЕР",
    teacher: "Мария Волкова",
    room: "Аудитория — пример",
    color: "violet",
  },
];

const demoNotifications = [
  { title: "Обновление учебных материалов", detail: "Digital Marketing", tone: "cyan" },
  { title: "Напоминание о дедлайне", detail: "Анализ кампании · 18:00", tone: "pink" },
];

function getMoscowCalendarWeek(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (todayUtc.getUTCDay() + 6) % 7;
  const monday = Date.UTC(year, month - 1, day - mondayOffset);
  const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
  });
  const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    month: "long",
  });

  return {
    day,
    monthName: monthFormatter.format(todayUtc),
    days: weekdays.map((weekday, index) => {
      const date = new Date(monday + index * 86_400_000);
      return {
        weekday,
        date: Number(dateFormatter.format(date)),
        isToday: index === mondayOffset,
      };
    }),
  };
}

function SectionTitle({
  eyebrow,
  title,
  marker,
  id,
}: {
  eyebrow: string;
  title: string;
  marker?: string;
  id?: string;
}) {
  return (
    <div className="home-section-title">
      <div>
        <span className="home-eyebrow">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
      </div>
      {marker ? <span className="home-section-marker">{marker}</span> : null}
    </div>
  );
}

function CalendarWidget() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateMoscowTime = () => setNow(new Date());
    updateMoscowTime();
    const interval = window.setInterval(updateMoscowTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const calendar = now ? getMoscowCalendarWeek(now) : null;

  return (
    <section className="home-calendar" aria-labelledby="calendar-title">
      <div className="calendar-heading">
        <div>
          <span className="home-eyebrow">ТВОЯ НЕДЕЛЯ</span>
          <h2 id="calendar-title">Календарь</h2>
        </div>
        <span className="calendar-orbit" aria-hidden="true">✳</span>
      </div>
      <div className="calendar-date" aria-live="polite">
        {calendar ? (
          <>
            <strong>{calendar.day}</strong>
            <span>{calendar.monthName}</span>
          </>
        ) : (
          <span className="calendar-loading">Загружаем дату…</span>
        )}
      </div>
      <div className="calendar-week" aria-label="Дни недели">
        {(calendar?.days ?? weekdays.map((weekday) => ({ weekday, date: null, isToday: false }))).map((item) => (
          <div className={`calendar-day${item.isToday ? " is-today" : ""}`} aria-current={item.isToday ? "date" : undefined} key={item.weekday}>
            <span>{item.weekday}</span>
            <strong>{item.date ?? "—"}</strong>
            {item.isToday ? <i aria-label="Сегодня" /> : null}
          </div>
        ))}
      </div>
      <div className="calendar-foot"><span className="calendar-live-dot" />Дата по Москве · UTC+3</div>
    </section>
  );
}

function ScheduleWidget() {
  return (
    <section className="home-schedule" aria-labelledby="schedule-title">
      <SectionTitle eyebrow="УЧЕБНЫЙ ДЕНЬ" title="Расписание" marker="ПРИМЕРЫ" id="schedule-title" />
      <div className="schedule-date-line"><span className="schedule-today-dot" />Демо-расписание на сегодня</div>
      <div className="home-lesson-list">
        {lessons.map((lesson) => (
          <article className={`home-lesson lesson-${lesson.color}`} key={`${lesson.start}-${lesson.kind}`}>
            <div className="home-lesson-time"><strong>{lesson.start}</strong><span>{lesson.end}</span></div>
            <span className="home-lesson-rail" aria-hidden="true" />
            <div className="home-lesson-details">
              <span className="lesson-kind">{lesson.kind}</span>
              <h3>{lesson.title}</h3>
              <p>{lesson.teacher}<span>·</span>{lesson.room}</p>
            </div>
            <span className="lesson-corner" aria-hidden="true" />
          </article>
        ))}
      </div>
      <p className="schedule-disclaimer">Время и аудитории условные. Данные не получены из университетской системы.</p>
    </section>
  );
}

function CampusAiWidget() {
  return (
    <section className="campus-ai" aria-labelledby="campus-ai-title">
      <div className="ai-art" aria-hidden="true">
        <span className="ai-orbit ai-orbit-one" />
        <span className="ai-orbit ai-orbit-two" />
        <span className="ai-core">✳</span>
        <span className="ai-pixel ai-pixel-one" />
        <span className="ai-pixel ai-pixel-two" />
        <span className="ai-pixel ai-pixel-three" />
      </div>
      <div className="ai-copy">
        <span className="home-eyebrow">ТВОЙ УЧЕБНЫЙ НАВИГАТОР</span>
        <h2 id="campus-ai-title">Campus <em>AI</em></h2>
        <p>Помощь с учёбой и планированием — в разработке.</p>
        <button className="ai-button" type="button" disabled aria-disabled="true">
          <span>В разработке</span><span aria-hidden="true">↗</span>
        </button>
      </div>
      <span className="ai-card-index" aria-hidden="true">CAMPUS / 01</span>
    </section>
  );
}

function PerformanceWidget() {
  return (
    <article className="mini-widget performance-widget">
      <div className="mini-widget-heading"><span className="mini-icon">↗</span><span className="home-eyebrow">УСПЕВАЕМОСТЬ</span><span className="mini-demo">ДЕМО</span></div>
      <div className="performance-content"><strong>87<small>/100</small></strong><span className="performance-ring" aria-hidden="true"><i /></span></div>
      <div className="sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <p className="mini-caption">Иллюстративный показатель</p>
    </article>
  );
}

function DeadlinesWidget() {
  return (
    <article className="mini-widget deadlines-widget">
      <div className="mini-widget-heading"><span className="mini-icon">◷</span><span className="home-eyebrow">ДЕДЛАЙНЫ</span><span className="mini-demo">ДЕМО</span></div>
      <div className="deadline-number"><strong>3</strong><span>ближайшие<br />задачи</span></div>
      <div className="deadline-track" role="img" aria-label="Три ближайшие задачи в демонстрационном примере"><i /><i /><i /></div>
      <p className="mini-caption">Одна отметка — одна задача</p>
    </article>
  );
}

function NotificationsWidget() {
  return (
    <article className="mini-widget notifications-widget">
      <div className="mini-widget-heading"><span className="mini-icon">♧</span><span className="home-eyebrow">УВЕДОМЛЕНИЯ</span><span className="mini-demo">ДЕМО</span></div>
      <div className="notification-body">
        <div className="notification-number"><strong>2</strong><span>новых<br />события</span></div>
        <ul className="notification-preview-list" aria-label="Примеры последних уведомлений">
          {demoNotifications.map((notification) => (
            <li className={`notification-preview preview-${notification.tone}`} key={notification.title}>
              <span className="preview-dot" aria-hidden="true" />
              <span><strong>{notification.title}</strong><small>{notification.detail}</small></span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export default function StudentHomeContent() {
  return (
    <>
      <div className="demo-status-line" role="note">
        <span className="demo-status-mark" />
        <span><strong>Демо-режим</strong><i />Календарь показывает дату по Москве; расписание и показатели ниже — примеры.</span>
      </div>

      <div className="student-home-grid">
        <CalendarWidget />
        <ScheduleWidget />
        <CampusAiWidget />
        <section className="mini-widgets" aria-label="Краткий обзор">
          <PerformanceWidget />
          <DeadlinesWidget />
          <NotificationsWidget />
        </section>
      </div>

      <footer className="page-footer"><span>DIGITAL CAMPUS <i>·</i> ELECTRIC BLUE CITY</span><span>ДЕМОНСТРАЦИОННЫЙ ВИЗУАЛЬНЫЙ ЭТАП</span></footer>
    </>
  );
}
