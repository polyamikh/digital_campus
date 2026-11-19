"use client";

import { useMemo, useState } from "react";
import { testingTabForStatus, type TestingStatus } from "@/lib/testing/testing-core";

type TestView = {
  id: string; title: string; courseName: string; teacherName: string; externalUrl: string | null;
  opensAt: string | null; closesAt: string | null; attemptLimit: number | null; attemptsUsed: number;
  attempts: Array<{ attemptNo: number; state: string; submittedAt: string | null; publishedAt: string | null }>;
  result: string | null; status: TestingStatus;
};

const statusLabels: Record<TestingStatus, string> = {
  AVAILABLE: "Доступен", UPCOMING: "Скоро откроется", COMPLETED: "Завершён", OVERDUE: "Просрочен", ATTEMPTS_EXHAUSTED: "Попытки использованы", DRAFT: "Черновик",
};

function formatDate(value: string | null) {
  if (!value) return "Без срока";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function TestingContent({ tests, membershipState, now }: { tests: TestView[]; membershipState: string; now: string }) {
  const [tab, setTab] = useState<"available" | "completed" | "overdue">("available");
  const [course, setCourse] = useState("all");
  const instant = new Date(now);
  const courses = [...new Set(tests.map((item) => item.courseName))].sort((a, b) => a.localeCompare(b, "ru"));
  const summary = useMemo(() => ({
    available: tests.filter((item) => item.status === "AVAILABLE").length,
    completed: tests.filter((item) => item.status === "COMPLETED").length,
    overdue: tests.filter((item) => item.status === "OVERDUE").length,
  }), [tests]);
  const filtered = tests.filter((item) => testingTabForStatus(item.status) === tab && (course === "all" || item.courseName === course));

  return <main className="testing-page" id="main-content">
    <header className="testing-heading"><div><span className="profile-heading-kicker">КОНТРОЛЬ ЗНАНИЙ</span><h1>Тестирование</h1><p>Внешние тесты и результаты, опубликованные преподавателем.</p></div></header>
    <section className="testing-summary" aria-label="Сводка по тестам">
      <SummaryCard label="Доступные" value={summary.available} accent="cyan" />
      <SummaryCard label="Завершённые" value={summary.completed} accent="pink" />
      <SummaryCard label="Просроченные" value={summary.overdue} accent="violet" />
    </section>
    <section className="testing-controls" aria-label="Фильтры тестов">
      <div className="testing-tabs" role="tablist" aria-label="Статус теста">
        {([ ["available", "Доступные"], ["completed", "Завершённые"], ["overdue", "Просроченные"] ] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <label className="testing-course-filter">Дисциплина<select value={course} onChange={(event) => setCourse(event.target.value)}><option value="all">Все дисциплины</option>{courses.map((name) => <option key={name}>{name}</option>)}</select></label>
    </section>
    {membershipState !== "READY" ? <section className="testing-empty" role={membershipState === "ERROR" ? "alert" : "status"}><span aria-hidden="true">!</span><h2>{membershipState === "ERROR" ? "Не удалось загрузить тесты" : membershipState === "AMBIGUOUS" ? "Не удалось определить учебную группу" : "Учебная группа не найдена"}</h2><p>{membershipState === "ERROR" ? "Попробуйте открыть раздел позже. Данные тестов не изменены." : "Список тестов доступен после проверки действующего членства в группе."}</p></section> : filtered.length === 0 ? <section className="testing-empty" role="status"><span aria-hidden="true">✓</span><h2>{tab === "available" ? "Нет доступных тестов" : tab === "completed" ? "Завершённых тестов пока нет" : "Просроченных тестов нет"}</h2><p>{course === "all" ? "Когда преподаватель назначит тест для вашей группы, он появится здесь." : "Для выбранной дисциплины тестов в этой вкладке нет."}</p></section> : <section className="testing-list" aria-label="Тесты">
      {filtered.map((item) => {
        const canStart = item.status === "AVAILABLE" && (item.attemptLimit === null || item.attemptsUsed < item.attemptLimit);
        const startsLater = item.opensAt && new Date(item.opensAt) > instant;
        return <article className="testing-card" key={item.id}>
          <div className="testing-card-top"><span className={`testing-status status-${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span><span className="testing-course">{item.courseName}</span></div>
          <h2>{item.title}</h2>
          <p className="testing-teacher">Преподаватель: {item.teacherName}</p>
          <dl className="testing-meta"><div><dt>Срок</dt><dd>{formatDate(item.closesAt)}</dd></div><div><dt>Попытки</dt><dd>{item.attemptsUsed}{item.attemptLimit === null ? " / без ограничения" : ` / ${item.attemptLimit}`}</dd></div></dl>
          {startsLater ? <p className="testing-note">Тест откроется {formatDate(item.opensAt)}.</p> : null}
          {item.result !== null ? <p className="testing-result">Опубликованный результат <strong>{item.result} / 100</strong></p> : item.status === "COMPLETED" ? <p className="testing-note">Попытка отправлена. Результат появится после публикации преподавателем.</p> : null}
          <div className="testing-card-actions">{canStart && item.externalUrl ? <a className="testing-start" href={item.externalUrl} target="_blank" rel="noopener noreferrer">Пройти тест <span aria-hidden="true">↗</span></a> : canStart ? <span className="testing-note">Внешняя ссылка пока не указана.</span> : item.status === "ATTEMPTS_EXHAUSTED" ? <span className="testing-note">Новые попытки недоступны.</span> : null}</div>
        </article>;
      })}
    </section>}
  </main>;
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return <article className={`testing-summary-card accent-${accent}`}><span>{label}</span><strong>{value}</strong></article>;
}
