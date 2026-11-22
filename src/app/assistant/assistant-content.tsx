"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendAssistantMessageAction } from "@/app/actions/assistant";
import type { CampusAssistantMode } from "@/lib/campus/campus-core";

type Data = { conversations: Array<{ id: string; mode: string | null; title: string | null; updatedAt: Date }>; selected: { id: string; mode: string | null; title: string | null } | null; messages: Array<{ id: string; role: string; content: string; createdAt: Date }> };
export default function AssistantContent({ data, initialMode }: { data: Data; initialMode: CampusAssistantMode }) {
  const router = useRouter(); const [mode, setMode] = useState<CampusAssistantMode>(initialMode); const [question, setQuestion] = useState(""); const [error, setError] = useState(""); const [busy, startTransition] = useTransition();
  const submit = (value?: string) => {
    const text = (value ?? question).trim(); if (!text || busy) return;
    const payload = new FormData(); payload.set("mode", mode); payload.set("question", text); if (data.selected) payload.set("conversationId", data.selected.id);
    setQuestion(""); setError("");
    startTransition(async () => { const result = await sendAssistantMessageAction(payload); if (result.ok && result.conversationId) router.push(`/assistant?conversation=${encodeURIComponent(result.conversationId)}`); else setError(result.error ?? "Не удалось получить ответ."); });
  };
  const suggestions = mode === "STUDY_PLANNER" ? ["Какие ближайшие учебные даты мне учесть?", "Где найти домашние задания?", "Как спланировать подготовку к ближайшему дедлайну?"] : ["Как улучшить резюме?", "Какие мои навыки совпадают с опубликованными возможностями?", "С чего начать поиск стажировки?"];
  return <section className="campus-assistant-layout">
    <aside className="campus-assistant-history"><div className="campus-assistant-history-head"><h2>Диалоги</h2><Link href={`/assistant?mode=${mode}&new=1`}>＋ Новый</Link></div>{data.conversations.length ? data.conversations.map((item) => <Link key={item.id} className={`campus-assistant-thread${item.id === data.selected?.id ? " is-active" : ""}`} href={`/assistant?conversation=${encodeURIComponent(item.id)}`}><span>{item.mode === "CAREER_ASSISTANT" ? "Карьера" : "Учёба"}</span><strong>{item.title || "Новый диалог"}</strong><time>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeZone: "Europe/Moscow" }).format(item.updatedAt)}</time></Link>) : <p className="coursework-meta">История появится после первого сообщения.</p>}</aside>
    <div className="campus-assistant-main"><div className="campus-assistant-toolbar" role="group" aria-label="Режим помощника"><button type="button" aria-pressed={mode === "STUDY_PLANNER"} onClick={() => { setMode("STUDY_PLANNER"); router.push("/assistant?mode=STUDY_PLANNER&new=1"); }}>Study Planner</button><button type="button" aria-pressed={mode === "CAREER_ASSISTANT"} onClick={() => { setMode("CAREER_ASSISTANT"); router.push("/assistant?mode=CAREER_ASSISTANT&new=1"); }}>Career Assistant</button></div><div className="campus-assistant-disclaimer">Локальный помощник использует только разрешённые данные вашего аккаунта. Внешняя языковая модель не подключена; ответы формируются по правилам и опубликованным данным.</div>
      <div className="campus-assistant-messages" aria-live="polite">{data.messages.map((message) => <article className={`campus-assistant-message ${message.role === "USER" ? "is-user" : "is-assistant"}`} key={message.id}><span>{message.role === "USER" ? "Вы" : "Навигатор кампуса"}</span><p>{message.content}</p><time>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(message.createdAt)}</time></article>)}{!data.messages.length ? <div className="campus-assistant-welcome"><span className="profile-heading-kicker">{mode === "STUDY_PLANNER" ? "ПЛАНИРОВАНИЕ УЧЁБЫ" : "КАРЬЕРНЫЙ ПЛАН"}</span><h2>{mode === "STUDY_PLANNER" ? "Чем помочь с учёбой?" : "С чего начнём карьерный план?"}</h2><p>Выберите подсказку или сформулируйте свой вопрос.</p><div className="campus-assistant-prompts">{suggestions.map((item) => <button key={item} type="button" onClick={() => submit(item)} disabled={busy}>{item}</button>)}</div></div> : null}{busy ? <p role="status" className="coursework-meta">Подготавливаем ответ…</p> : null}{error ? <p role="alert" className="campus-feedback">{error}</p> : null}</div>
      <form className="campus-assistant-compose" onSubmit={(event) => { event.preventDefault(); submit(); }}><label className="visually-hidden" htmlFor="assistant-question">Ваш вопрос</label><textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} maxLength={2000} placeholder="Напишите вопрос…" disabled={busy} /><button className="coursework-primary" disabled={busy || !question.trim()}>Отправить</button><small>Не отправляйте пароли, медицинские сведения или данные других людей.</small></form>
    </div>
  </section>;
}
