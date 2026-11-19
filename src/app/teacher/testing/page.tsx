import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import LogoutButton from "@/app/logout-button";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getCurrentTeacherTestingWorkspace } from "@/lib/testing/testing-service";
import TeacherTestingContent from "./teacher-testing-content";

export default function TeacherTestingPage() {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем тестирование…" />}><AuthenticatedTeacherTestingPage /></Suspense>;
}

async function AuthenticatedTeacherTestingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.TEACHER) redirect(homePathForRole(user.activeRole));
  const workspace = await getCurrentTeacherTestingWorkspace().catch(() => null);
  return <main className="role-placeholder-page testing-teacher-page">
    <div className="role-placeholder-grid" aria-hidden="true" />
    <header className="role-placeholder-top"><Link className="login-brand" href="/teacher">DIGITAL<br />CAMPUS</Link><LogoutButton /></header>
    <section className="testing-teacher-wrap">
      <Link className="testing-back-link" href="/teacher">← Кабинет преподавателя</Link>
      <span className="role-placeholder-kicker">ВНЕШНИЕ ПЛАТФОРМЫ · ЖУРНАЛ РЕЗУЛЬТАТОВ</span>
      <h1>Тестирование</h1>
      <p className="testing-teacher-intro">Создавайте тесты для своих дисциплин, фиксируйте результат после внешней платформы и публикуйте его в журнале.</p>
      {workspace ? <TeacherTestingContent {...workspace} /> : <p className="testing-teacher-error" role="alert">Не удалось загрузить тесты. Попробуйте ещё раз позже.</p>}
    </section>
  </main>;
}
