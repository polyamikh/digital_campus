import { Suspense } from "react";
import Link from "next/link";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherProfile } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherHeader, teacherDate } from "../teacher-route";

export default function TeacherProfilePage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем профиль преподавателя…" />}><Content /></Suspense>; }

async function Content() {
  await requireTeacherPage(); const profile = await getTeacherProfile();
  return <TeacherAppShell activeSection="profile"><div className="teacher-workspace-page">
    {teacherHeader("ПРОФИЛЬ ПРЕПОДАВАТЕЛЯ", "Мой профиль", "Сведения загружены из вашего профиля и действующих назначений.")}
    <section className="teacher-profile-card"><div className="teacher-profile-avatar" aria-hidden="true">{profile.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU")}</div><div><span className="profile-heading-kicker">ПРЕПОДАВАТЕЛЬ</span><h2>{profile.displayName}</h2><p>Логин: {profile.login}</p></div></section>
    <div className="teacher-data-grid"><section className="teacher-data-card"><h2>Контакты</h2><dl><dt>Email</dt><dd>{profile.email ?? "Не указан"}</dd><dt>Телефон</dt><dd>{profile.phone ?? "Не указан"}</dd><dt>Часы консультаций</dt><dd>{profile.officeHours ?? "Не указаны в профиле"}</dd></dl><small>Эти данные доступны только в авторизованном кабинете.</small></section><section className="teacher-data-card"><h2>Действующие назначения</h2>{profile.assignments.length ? <ul>{profile.assignments.map((item) => <li key={item.id}><strong>{item.courseName}</strong><span>{item.groupCode}</span>{item.startsAt || item.endsAt ? <small>{item.startsAt ? teacherDate(item.startsAt) : "с начала назначения"} — {item.endsAt ? teacherDate(item.endsAt) : "без даты окончания"}</small> : null}</li>)}</ul> : <p>Активных назначений пока нет.</p>}</section></div>
    <p className="teacher-demo-note">Телефон, email и часы консультаций не редактируются здесь: используйте их только если они уже указаны в профиле.</p>
    <Link className="teacher-secondary-link" href="/teacher">← Кабинет преподавателя</Link>
  </div></TeacherAppShell>;
}
