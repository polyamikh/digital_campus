import { Suspense } from "react";
import { redirect } from "next/navigation";
import StudentAppShell from "../student-app-shell";
import AuthRouteFallback from "../auth-route-fallback";
import { getCurrentStudentProfile } from "@/lib/profile/student-profile";
import type { StudentProfileView } from "@/lib/profile/student-profile-core";
import ProfilePhotoControl from "./profile-photo-control";

export default function StudentProfilePage() {
  return (
    <Suspense fallback={<AuthRouteFallback message="Загружаем профиль…" />}>
      <AuthenticatedStudentProfile />
    </Suspense>
  );
}

async function AuthenticatedStudentProfile() {
  const result = await getCurrentStudentProfile();
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "forbidden") redirect(result.redirectTo);

  if (result.state === "missing" || result.state === "ambiguous-membership") {
    return (
      <StudentAppShell displayName="Студент" groupCode={null} activeSection="profile">
        <section className="profile-page-heading" aria-labelledby="profile-page-title">
          <span className="profile-heading-kicker">ЛИЧНЫЙ КАБИНЕТ</span>
          <h1 id="profile-page-title">Мой профиль</h1>
          <p>Основные сведения об учёбе и контактная информация.</p>
        </section>
        <section className="profile-empty-state" role="status">
          <span className="profile-empty-mark" aria-hidden="true">◉</span>
          <h2>{result.state === "missing" ? "Профиль пока недоступен" : "Не удалось определить учебную группу"}</h2>
          <p>{result.state === "missing" ? "Для этой учётной записи ещё не заполнены профильные данные." : "В профиле обнаружено несколько действующих назначений в группы. Обратитесь в деканат для уточнения данных."}</p>
        </section>
      </StudentAppShell>
    );
  }

  const { profile } = result;
  return (
    <StudentAppShell displayName={profile.displayName} groupCode={profile.groupCode} photoVersion={result.photoVersion} activeSection="profile">
      <section className="profile-page-heading" aria-labelledby="profile-page-title">
        <span className="profile-heading-kicker">ЛИЧНЫЙ КАБИНЕТ</span>
        <h1 id="profile-page-title">Мой профиль</h1>
        <p>Основные сведения об учёбе и контактная информация.</p>
      </section>
      <ProfileCard profile={profile} photoVersion={result.photoVersion} />
    </StudentAppShell>
  );
}

function ProfileCard({ profile, photoVersion }: { profile: StudentProfileView; photoVersion: number | null }) {
  const missing = "Не указано в демоданных";
  const rows = [
    { label: "Номер студенческого билета", value: profile.studentNumber ?? missing, accent: true },
    { label: "Электронная почта", value: profile.email ?? "Не указан", note: profile.demoEmailHidden ? "Технический демо-адрес скрыт и не используется для связи." : undefined },
    { label: "Телефон", value: profile.phone ?? "Не указан" },
    { label: "Институт", value: profile.instituteName ?? missing },
    { label: "Факультет", value: profile.facultyName ?? missing },
    { label: "Направление подготовки", value: profile.directionName ?? missing },
    { label: "Образовательная программа", value: profile.programName ?? missing },
    { label: "Учебная группа", value: profile.groupCode ?? missing, accent: true },
    { label: "Форма обучения", value: profile.studyMode ?? missing },
    { label: "Год поступления", value: profile.admissionYear?.toString() ?? missing },
    { label: "Академический статус", value: profile.academicStatus ?? missing, accent: true },
  ];

  return (
    <article className="student-profile-card" aria-labelledby="student-profile-name">
      <header className="student-profile-identity">
        <ProfilePhotoControl displayName={profile.displayName} photoVersion={photoVersion} />
        <div>
          <span className="profile-heading-kicker">СТУДЕНТ</span>
          <h2 id="student-profile-name">{profile.displayName}</h2>
          <p>{profile.groupCode ?? "Учебная группа не указана"}</p>
        </div>
        <span className="profile-demo-tag"><span />Демо-данные</span>
      </header>
      <dl className="student-profile-grid">
        {rows.map((row) => (
          <div className="student-profile-field" key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.accent ? "profile-value-accent" : undefined}>{row.value}</dd>
            {"note" in row && row.note ? <p className="profile-field-note">{row.note}</p> : null}
          </div>
        ))}
      </dl>
      <p className="profile-data-note">Сведения приведены для демонстрации платформы. Изменение профиля пока недоступно.</p>
    </article>
  );
}
