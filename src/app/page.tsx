import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getStudentHomeSchedule } from "@/lib/schedule/student-home-schedule";
import StudentHomeContent from "./student-home-content";
import StudentAppShell from "./student-app-shell";
import AuthRouteFallback from "./auth-route-fallback";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";

export default function Home() {
  return (
    <Suspense fallback={<AuthRouteFallback />}>
      <AuthenticatedStudentHome />
    </Suspense>
  );
}

async function AuthenticatedStudentHome() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));

  const [identity, schedule, photo] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { login: true, profile: { select: { displayName: true } } },
    }),
    getStudentHomeSchedule(user.id),
    getProfilePhotoMetadata(user.id),
  ]);
  const displayName = identity?.profile?.displayName || identity?.login || user.login;
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const studentSchedule = {
    todayDate: schedule.todayDate,
    lessons: schedule.lessons,
    timeWindowViolationCount: schedule.timeWindowViolationCount,
    membershipProblem: schedule.membershipProblem,
  };

  return (
    <StudentAppShell displayName={displayName} groupCode={schedule.groupCode} photoVersion={photo?.version ?? null} activeSection="home">
      <section className="hero" aria-labelledby="welcome-title">
        <h1 className="hero-title" id="welcome-title"><span>ПРИВЕТ,</span><span>{firstName.toLocaleUpperCase("ru-RU")}!</span></h1>
        <span className="hero-divider" aria-hidden="true" />
        <p className="hero-copy">Твой учебный день,<br />задачи и возможности —<br />в одном пространстве</p>
      </section>
      <StudentHomeContent schedule={studentSchedule} />
    </StudentAppShell>
  );
}
