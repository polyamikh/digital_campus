"use client";

import { useState, useTransition } from "react";
import { applyCareerAction } from "@/app/actions/career";

export default function CareerApplyForm({ opportunityId }: { opportunityId: string }) {
  const [error, setError] = useState(""); const [done, setDone] = useState(false); const [busy, startTransition] = useTransition();
  return <form className="campus-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); form.set("opportunityId", opportunityId); startTransition(async () => { const result = await applyCareerAction(form); if (result.ok) setDone(true); else setError(result.error ?? "Не удалось отправить отклик."); }); }}><label>Сопроводительное письмо<textarea name="coverLetter" maxLength={3000} rows={5} /></label><button className="coursework-primary" disabled={busy || done}>{done ? "Отклик отправлен" : busy ? "Отправляем…" : "Отправить отклик"}</button>{error ? <p role="alert" className="campus-feedback">{error}</p> : null}{done ? <p role="status" className="campus-feedback">Отклик сохранён в разделе «Мои отклики».</p> : null}</form>;
}
