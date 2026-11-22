"use client";

import { useState, useTransition } from "react";
import { requestStudentPassAction } from "@/app/actions/pass";

export default function PassRequestControls({ requestedToday }: { requestedToday: boolean }) {
  const [pending, startTransition] = useTransition(); const [message, setMessage] = useState("");
  const request = (kind: "TEMPORARY_DEMO_QR" | "REPLACEMENT") => startTransition(async () => { const result = await requestStudentPassAction(kind); setMessage(result.ok ? result.created ? "Запрос отправлен в деканат." : "Запрос на сегодня уже зарегистрирован." : result.error ?? "Не удалось отправить запрос."); });
  return <div className="pass-controls"><button className="coursework-primary" type="button" onClick={() => request("TEMPORARY_DEMO_QR")} disabled={pending || requestedToday}>{requestedToday ? "Запрос на сегодня уже отправлен" : "Запросить временный демо-пропуск"}</button><button className="coursework-secondary" type="button" onClick={() => request("REPLACEMENT")} disabled={pending}>Запросить замену пропуска</button>{pending ? <p role="status">Отправляем запрос…</p> : null}{message ? <p role="status">{message}</p> : null}</div>;
}
