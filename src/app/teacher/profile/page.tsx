import { Suspense } from "react";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherProfile } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherDate } from "../teacher-route";
import ProfilePhotoControl from "@/app/profile/profile-photo-control";
import { getCurrentTeacherPhotoVersion } from "@/lib/profile/teacher-profile-photo";

export default function TeacherProfilePage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем профиль преподавателя…" />}><Content /></Suspense>; }

async function Content() {
  await requireTeacherPage();
  const [profile, photoVersion] = await Promise.all([getTeacherProfile(), getCurrentTeacherPhotoVersion()]);
  const fields = [
    { label: "Электронная почта", value: profile.email ?? "Не указана" },
    { label: "Телефон", value: profile.phone ?? "Не указан" },
    { label: "Часы консультаций", value: profile.officeHours ?? "Не указаны в профиле" },
  ];
  return <TeacherAppShell activeSection="profile"><div className="teacher-workspace-page teacher-profile-page">
    <section className="profile-page-heading" aria-labelledby="teacher-profile-title"><span className="profile-heading-kicker">ЛИЧНЫЙ КАБИНЕТ</span><h1 id="teacher-profile-title">Мой профиль</h1><p>Контакты, назначения и часы консультаций.</p></section>
    <article className="student-profile-card teacher-student-profile" aria-labelledby="teacher-profile-name">
      <header className="student-profile-identity"><ProfilePhotoControl displayName={profile.displayName} photoVersion={photoVersion}/><div><span className="profile-heading-kicker">ПРЕПОДАВАТЕЛЬ</span><h2 id="teacher-profile-name">{profile.displayName}</h2><p>Действующие назначения</p></div></header>
      <dl className="student-profile-grid">{fields.map((field) => <div className="student-profile-field" key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
        {profile.assignments.map((item) => <div className="student-profile-field" key={item.id}><dt>Дисциплина и группа</dt><dd className="profile-value-accent">{item.courseName} · {item.groupCode}</dd>{item.startsAt || item.endsAt ? <p className="profile-field-note">{item.startsAt ? teacherDate(item.startsAt) : "С начала назначения"} — {item.endsAt ? teacherDate(item.endsAt) : "без даты окончания"}</p> : null}</div>)}
      </dl>
    </article>
  </div></TeacherAppShell>;
}
