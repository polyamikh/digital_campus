import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import LogoutButton from "@/app/logout-button";
import AuthRouteFallback from "@/app/auth-route-fallback";

export default function TeacherHomePage() {
  return (
    <Suspense fallback={<AuthRouteFallback />}>
      <AuthenticatedTeacherHome />
    </Suspense>
  );
}

async function AuthenticatedTeacherHome() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.TEACHER) redirect(homePathForRole(user.activeRole));

  return (
    <main className="role-placeholder-page">
      <div className="role-placeholder-grid" aria-hidden="true" />
      <header className="role-placeholder-top"><Link className="login-brand" href="/">DIGITAL<br />CAMPUS</Link><LogoutButton /></header>
      <section className="role-placeholder-card" aria-labelledby="teacher-title">
        <span className="role-placeholder-kicker">КАБИНЕТ TEACHER</span>
        <h1 id="teacher-title">Кабинет<br /><em>преподавателя</em></h1>
        <p>Раздел в разработке</p>
      </section>
    </main>
  );
}
