"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moscowDateKey, moscowTime } from "@/lib/schedule/moscow-time";
import { shiftTaskDate } from "@/lib/tasks/tasks-core";

type Lesson = Awaited<ReturnType<typeof import("@/lib/teacher/teacher-workspace").getTeacherHome>>["lessons"][number];
const weekdays = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
const formatDate = (date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) => new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
function weekDates(start: string) { return weekdays.map((weekday, i) => ({ weekday, dateKey: shiftTaskDate(start, i) })); }

export default function TeacherHomeSchedule({ lessons, weekStart, today }: { lessons: Lesson[]; weekStart: string; today: string }) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => today >= weekStart && today <= shiftTaskDate(weekStart, 6) ? today : weekStart);
  const [detail, setDetail] = useState<Lesson | null>(null);
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    lessons.forEach((lesson) => map.set(moscowDateKey(lesson.startsAt), (map.get(moscowDateKey(lesson.startsAt)) ?? 0) + 1));
    return map;
  }, [lessons]);
  const selectedLessons = lessons.filter((lesson) => moscowDateKey(lesson.startsAt) === selectedDate);
  const move = (delta: -1 | 1) => { const next = shiftTaskDate(weekStart, delta * 7); setSelectedDate(next); router.push(`/teacher?week=${next}`); };
  const dayTitle = selectedDate === today ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`));
  return <>
    <div className="home-panel-heading"><div><span className="home-eyebrow">УЧЕБНАЯ НЕДЕЛЯ</span><h2>Расписание</h2></div><Link href="/teacher/schedule">Всё расписание ↗</Link></div>
    <section className="home-calendar" aria-label="Календарь учебной недели">
      <div className="home-calendar-heading"><div><span className="home-eyebrow">НЕДЕЛЯ</span><h3>{formatDate(weekStart, { month: "long", year: "numeric" })}</h3></div><div className="teacher-home-week-nav"><button type="button" aria-label="Предыдущая неделя" onClick={() => move(-1)}>‹</button><button type="button" aria-label="Следующая неделя" onClick={() => move(1)}>›</button></div></div>
      <div className="calendar-week" aria-label="Даты недели">{days.map(({ weekday, dateKey }) => <button className={`calendar-day${dateKey === today ? " is-today" : ""}${dateKey === selectedDate ? " is-selected" : ""}`} type="button" key={dateKey} aria-pressed={dateKey === selectedDate} aria-current={dateKey === today ? "date" : undefined} aria-label={`${weekday}, ${formatDate(dateKey)}${counts.get(dateKey) ? `, занятий: ${counts.get(dateKey)}` : ", занятий нет"}`} onClick={() => setSelectedDate(dateKey)}><span>{weekday}</span><strong>{Number(dateKey.slice(-2))}</strong><i className="calendar-count">{counts.get(dateKey) || ""}</i></button>)}</div>
    </section>
    <div className="home-panel-heading teacher-home-day-heading"><span className="home-date-label">{dayTitle}, {formatDate(selectedDate)}</span></div>
    {selectedLessons.length ? <ol className="home-lesson-list">{selectedLessons.map((lesson) => <li className={`home-lesson${lesson.kind === "EXAM" ? " lesson-exam" : ""}`} key={lesson.id}><time><strong>{moscowTime(lesson.startsAt)}</strong><span>{moscowTime(lesson.endsAt)}</span></time><span className="home-lesson-line" aria-hidden="true"/><button type="button" className="teacher-home-lesson-detail" onClick={() => setDetail(lesson)}><span className="lesson-kind">{lesson.kind === "EXAM" ? "Экзамен" : "Занятие"}</span><h3>{lesson.course.subject.name}</h3><p>{lesson.group?.code ?? "Группа не указана"} · {lesson.room?.code ?? "Аудитория не указана"}</p></button></li>)}</ol> : <p className="home-empty">На выбранную дату занятий нет.</p>}
    {detail && <div className="tasks-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="tasks-editor teacher-home-lesson-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-lesson-detail-title"><div className="tasks-editor-head"><div><span className="profile-heading-kicker">{detail.kind === "EXAM" ? "ЭКЗАМЕН" : "ЗАНЯТИЕ"}</span><h2 id="teacher-lesson-detail-title">{detail.course.subject.name}</h2></div><button type="button" aria-label="Закрыть" onClick={() => setDetail(null)}>×</button></div><dl><div><dt>Группа</dt><dd>{detail.group?.code ?? "Не указана"}</dd></div><div><dt>Дата</dt><dd>{formatDate(moscowDateKey(detail.startsAt), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd></div><div><dt>Время</dt><dd>{moscowTime(detail.startsAt)}–{moscowTime(detail.endsAt)}</dd></div><div><dt>Аудитория</dt><dd>{detail.room?.code ?? "Не указана"}</dd></div><div><dt>Формат</dt><dd>{detail.format ?? "Не указан"}</dd></div></dl><div className="tasks-editor-actions"><Link className="tasks-primary-button" href="/teacher/schedule">Открыть расписание</Link><button type="button" className="tasks-secondary-button" onClick={() => setDetail(null)}>Закрыть</button></div></section></div>}
  </>;
}
