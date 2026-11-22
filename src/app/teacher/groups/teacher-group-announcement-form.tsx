"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeacherGroupAnnouncementAction } from "@/app/actions/teacher";
export default function TeacherGroupAnnouncementForm({ groupId, courses }: { groupId: string; courses: Array<{ courseId: string; name: string }> }) {
  const [busy, startTransition] = useTransition(); const [message, setMessage] = useState(""); const router = useRouter();
  return <details className="teacher-announcement-composer"><summary>Объявление группе</summary><form action={(formData) => startTransition(async () => { formData.set("groupId", groupId); const result = await createTeacherGroupAnnouncementAction(formData); setMessage(result.ok ? "Объявление опубликовано; группа получит уведомление." : result.error ?? "Не удалось опубликовать."); if (result.ok) router.refresh(); })}><label>Дисциплина<select name="courseId" required>{courses.map((course) => <option key={course.courseId} value={course.courseId}>{course.name}</option>)}</select></label><label>Заголовок<input name="title" required maxLength={240} /></label><label>Текст<textarea name="body" required maxLength={5000} rows={3} /></label><button className="teacher-small-button" disabled={busy}>{busy ? "Публикуем…" : "Опубликовать группе"}</button>{message ? <small role="status">{message}</small> : null}</form></details>;
}
