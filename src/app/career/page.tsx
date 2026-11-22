import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getStudentCareerWorkspace } from "@/lib/campus/career-service";
import AuthRouteFallback from "@/app/auth-route-fallback";
import CareerContent from "./career-content";

export default function CareerPage() {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем возможности…" />}><CareerPageContent /></Suspense>;
}

async function CareerPageContent() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole as RoleType));
  const data = await getStudentCareerWorkspace();
  return <StudentAppShell displayName={data.displayName} groupCode={null} activeSection="career">
    <section className="profile-page-heading"><span className="profile-heading-kicker">КАРЬЕРНЫЙ ЦЕНТР</span><h1>Карьерные возможности</h1><p>Опубликованные предложения, собственные отклики, резюме и ближайшие мероприятия.</p></section>
    <CareerContent data={data} />
  </StudentAppShell>;
}
