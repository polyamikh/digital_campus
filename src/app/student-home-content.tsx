"use client";

import { useEffect, useState } from "react";
import { moscowDateKey } from "@/lib/schedule/moscow-time";
import { lessonCountsByMoscowDate, lessonsOnMoscowDate } from "@/lib/schedule/schedule-view";
import type { StudentHomeSchedule } from "@/lib/schedule/student-home-schedule";

const weekdays = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

const demoNotifications = [
  { title: "Обновление учебных материалов", detail: "Digital Marketing", tone: "cyan" },
  { title: "Напоминание о дедлайне", detail: "Анализ кампании · 18:00", tone: "pink" },
];

function getMoscowCalendarWeek(now: Date) {
  const [year, month, day] = moscowDateKey(now).split("-").map(Number);
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (todayUtc.getUTCDay() + 6) % 7;
  const monday = Date.UTC(year, month - 1, day - mondayOffset);
  const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
  });

  return {
    days: weekdays.map((weekday, index) => {
      const date = new Date(monday + index * 86_400_000);
      return {
        weekday,
        date: Number(dateFormatter.format(date)),
        dateKey: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
        isToday: index === mondayOffset,
      };
    }),
  };
}

function calendarDateAccessibleLabel(dateKey: string): string {
  if (!dateKey) return "Дата загружается";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
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

function CalendarWidget({
  lessons,
  selectedDate,
  onSelectDate,
}: {
  lessons: StudentHomeSchedule["lessons"];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateMoscowTime = () => setNow(new Date());
    updateMoscowTime();
    const interval = window.setInterval(updateMoscowTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const calendar = now ? getMoscowCalendarWeek(now) : null;
  const lessonCounts = lessonCountsByMoscowDate(lessons);
  const selected = new Date(`${selectedDate}T12:00:00.000Z`);
  const selectedLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    month: "long",
  }).format(selected);

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
        {selectedDate ? (
          <>
            <strong>{selected.getUTCDate()}</strong>
            <span>{selectedLabel}</span>
          </>
        ) : (
          <span className="calendar-loading">Загружаем дату…</span>
        )}
      </div>
      <div className="calendar-week" aria-label="Дни недели">
        {(calendar?.days ?? weekdays.map((weekday) => ({ weekday, date: null, dateKey: "", isToday: false }))).map((item) => (
          <button
            className={`calendar-day${item.isToday ? " is-today" : ""}${item.dateKey === selectedDate ? " is-selected" : ""}${(lessonCounts.get(item.dateKey) ?? 0) > 0 ? " has-events" : ""}`}
            type="button"
            aria-current={item.isToday ? "date" : undefined}
            aria-pressed={item.dateKey === selectedDate}
            aria-label={`${item.weekday}, ${calendarDateAccessibleLabel(item.dateKey)}${item.isToday ? ", сегодня" : ""}${(lessonCounts.get(item.dateKey) ?? 0) ? `, занятий: ${lessonCounts.get(item.dateKey)}` : ", занятий нет"}`}
            disabled={!item.dateKey}
            onClick={() => onSelectDate(item.dateKey)}
            key={item.weekday}
          >
            <span>{item.weekday}</span>
            <strong>{item.date ?? "—"}</strong>
            <span className="calendar-event-markers" aria-hidden="true">
              {Array.from({ length: Math.min(lessonCounts.get(item.dateKey) ?? 0, 3) }, (_, index) => (
                <i className={`event-marker-${index % 3}`} key={`${item.dateKey}-${index}`} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScheduleWidget({
  schedule,
  selectedDate,
}: {
  schedule: Omit<StudentHomeSchedule, "groupCode">;
  selectedDate: string;
}) {
  const selectedLessons = lessonsOnMoscowDate(schedule.lessons, selectedDate);
  const selectedDateValue = new Date(`${selectedDate}T12:00:00.000Z`);
  const selectedDateLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(selectedDateValue);
  const selectedWeekday = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    weekday: "long",
  }).format(selectedDateValue);
  const datePrefix = selectedDate === schedule.todayDate
    ? "Сегодня"
    : `${selectedWeekday.charAt(0).toLocaleUpperCase("ru-RU")}${selectedWeekday.slice(1)}`;

  return (
    <section className="home-schedule" aria-labelledby="schedule-title">
      <SectionTitle eyebrow="УЧЕБНЫЙ ДЕНЬ" title="Расписание" marker="АКТУАЛЬНОЕ" id="schedule-title" />
      <div className="schedule-date-line" aria-live="polite" aria-atomic="true"><span className="schedule-today-dot" />{datePrefix}, {selectedDateLabel}</div>
      {schedule.timeWindowViolationCount > 0 ? (
        <p className="schedule-data-warning" role="status">В расписании обнаружено записей вне утверждённых временных интервалов: {schedule.timeWindowViolationCount}. Данные показаны без изменений.</p>
      ) : null}
      <div className="home-lesson-list">
        {selectedLessons.map((lesson, index) => {
          const isExam = lesson.type === "Экзамен";
          const color = isExam ? "pink" : index % 2 === 0 ? "cyan" : "violet";
          const staffLabel = isExam ? "Экзаменатор" : "Преподаватель";
          const details = [lesson.teacherOrExaminer ? `${staffLabel}: ${lesson.teacherOrExaminer}` : null, lesson.room ? `Ауд. ${lesson.room}` : null].filter(Boolean);
          return (
          <article className={`home-lesson lesson-${color}`} key={lesson.id}>
            <div className="home-lesson-time"><strong>{lesson.startTime}</strong><span>{lesson.endTime}</span></div>
            <span className="home-lesson-rail" aria-hidden="true" />
            <div className="home-lesson-details">
              <span className="lesson-kind">{lesson.type.toLocaleUpperCase("ru-RU")}</span>
              <h3>{lesson.discipline}</h3>
              {details.length ? <p>{details.map((detail, detailIndex) => <span className="lesson-detail" key={detail}>{detail}{detailIndex < details.length - 1 ? " ·" : ""}</span>)}</p> : null}
            </div>
            <span className="lesson-corner" aria-hidden="true" />
          </article>
          );
        })}
        {schedule.membershipProblem ? (
          <p className="schedule-empty" role="status">{schedule.membershipProblem === "missing" ? "Не найдено активное учебное членство. Обратись в деканат, если это ошибка." : "Не удалось однозначно определить активную учебную группу. Данные расписания временно не показаны."}</p>
        ) : selectedLessons.length === 0 ? (
          <p className="schedule-empty">На выбранную дату занятий нет.</p>
        ) : null}
      </div>
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

export default function StudentHomeContent({ schedule }: { schedule: Omit<StudentHomeSchedule, "groupCode"> }) {
  const [selectedDate, setSelectedDate] = useState(schedule.todayDate);

  return (
    <>
      <div className="demo-status-line" role="note">
        <span className="demo-status-mark" />
        <span><strong>Демо-режим</strong><i />Расписание загружается из базы платформы и может содержать демонстрационные данные; остальные виджеты ниже — демонстрационные примеры.</span>
      </div>

      <div className="student-home-grid">
        <CalendarWidget lessons={schedule.lessons} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        <ScheduleWidget schedule={schedule} selectedDate={selectedDate} />
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
