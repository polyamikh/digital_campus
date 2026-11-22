"use client";

import Link from "next/link";
import { useState } from "react";
import { submissionStatus } from "@/lib/coursework/coursework-core";

type Item = { id: string; title: string; instructions: string; criteria: string | null; deadline: Date | null; courseName: string; teacherName: string; allowText: boolean; allowFile: boolean; allowLink: boolean; state: string | null; grade: string | null; feedback: string | null; revision: { submittedAt: Date | null } | null };
const tabs = [{ id: "TO_SUBMIT", label: "К выполнению" }, { id: "UNDER_REVIEW", label: "На проверке" }, { id: "CHECKED", label: "Завершённые" }, { id: "OVERDUE", label: "Просроченные" }];
function statusLabel(status: string) { return status === "UNDER_REVIEW" ? "На проверке" : status === "REVISION_REQUIRED" ? "Нужна доработка" : status === "CHECKED" ? "Проверено" : status === "OVERDUE" ? "Срок прошёл" : "К выполнению"; }
function dateLabel(value: Date | null) { return value ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Без срока"; }
export default function HomeworkListContent({ state, groupCode, items }: { state: "READY" | "MISSING" | "AMBIGUOUS"; groupCode: string | null; items: Item[] }) {
  const [tab, setTab] = useState("TO_SUBMIT"); const now = new Date();
  const prepared = items.map((item) => ({ ...item, status: submissionStatus({ published: true, deadline: item.deadline ? new Date(item.deadline) : null, now, state: item.state }) }));
  const counts = { TO_SUBMIT: prepared.filter((item) => item.status === "TO_SUBMIT" || item.status === "REVISION_REQUIRED").length, UNDER_REVIEW: prepared.filter((item) => item.status === "UNDER_REVIEW").length, CHECKED: prepared.filter((item) => item.status === "CHECKED").length, OVERDUE: prepared.filter((item) => item.status === "OVERDUE").length };
  const visible = prepared.filter((item) => tab === "TO_SUBMIT" ? item.status === "TO_SUBMIT" || item.status === "REVISION_REQUIRED" : item.status === tab);
  return <section className="coursework-page"><header className="coursework-heading"><span>{groupCode ? `УЧЕБНАЯ ГРУППА · ${groupCode}` : "УЧЕБНЫЕ ЗАДАНИЯ"}</span><h1>Домашние задания</h1><p>Задания ваших дисциплин, ответы и обратная связь преподавателей.</p></header>
    <div className="coursework-summary"><article><span>Доступные</span><strong>{counts.TO_SUBMIT}</strong></article><article><span>Завершённые</span><strong>{counts.CHECKED}</strong></article><article><span>Просрочено</span><strong>{counts.OVERDUE}</strong></article></div>
    <nav className="coursework-tabs" aria-label="Статус заданий">{tabs.map((item) => <button type="button" className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)} key={item.id}>{item.label}<span>{counts[item.id as keyof typeof counts]}</span></button>)}</nav>
    {state !== "READY" ? <div className="coursework-empty"><h2>{state === "AMBIGUOUS" ? "Не удалось определить группу" : "Учебная группа не найдена"}</h2><p>Задания будут доступны после определения активной группы.</p></div> : !visible.length ? <div className="coursework-empty"><h2>В этом списке пока пусто</h2><p>Когда появятся задания или работы, они будут показаны здесь.</p></div> : <div className="coursework-grid">{visible.map((item) => <article className="coursework-card" key={item.id}><div className="coursework-card-heading"><span className={`coursework-status status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span><small>{dateLabel(item.deadline)}</small></div><h2>{item.title}</h2><p className="coursework-meta">{item.courseName} · {item.teacherName}</p><p>{item.instructions}</p>{item.criteria ? <details><summary>Критерии оценивания</summary><p>{item.criteria}</p></details> : null}<div className="coursework-meta">Ответ: {[item.allowText && "текст", item.allowFile && "файл", item.allowLink && "ссылка"].filter(Boolean).join(", ")}</div>{item.grade ? <strong className="coursework-grade">Опубликованный результат: {item.grade} / 100</strong> : null}<Link className="coursework-resource" href={`/homework/${item.id}`}>Открыть задание →</Link></article>)}</div>}
  </section>;
}
