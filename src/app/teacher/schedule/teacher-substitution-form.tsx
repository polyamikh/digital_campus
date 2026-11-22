"use client";
import { useState, useTransition } from "react";
import { createTeacherSubstitutionRequestAction } from "@/app/actions/teacher";
export default function TeacherSubstitutionForm({ lessonId, substitutes }: { lessonId: string; substitutes: Array<{ id: string; name: string }> }) {
  const [busy, startTransition] = useTransition(); const [message, setMessage] = useState("");
  return <form className="teacher-substitution-form" onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); startTransition(async () => { const result = await createTeacherSubstitutionRequestAction(formData); setMessage(result.ok ? "Запрос отправлен деканату и ожидает решения." : result.error ?? "Не удалось отправить запрос."); }); }}><input type="hidden" name="lessonId" value={lessonId} /><label>Запросить замену<select name="substituteId" required defaultValue=""><option value="" disabled>Выберите преподавателя</option>{substitutes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Причина<textarea name="reason" required minLength={3} maxLength={2000} rows={2} /></label><button className="teacher-small-button" disabled={busy}>{busy ? "Отправляем…" : "Отправить деканату"}</button>{message ? <small role="status">{message}</small> : null}</form>;
}
