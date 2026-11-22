import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { getStudentHomeworkList } from "@/lib/coursework/coursework-service";
import HomeworkListContent from "./homework-list-content";

export default function HomeworkPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем домашние задания…" />}><Content /></Suspense>; }
async function Content() {
  const user = await currentUser(); if (!user) redirect("/login"); if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));
  const [data, profile, photo] = await Promise.all([getStudentHomeworkList(), prisma.userProfile.findUnique({ where: { userId: user.id }, select: { displayName: true } }), getProfilePhotoMetadata(user.id)]);
  return <StudentAppShell displayName={profile?.displayName || user.login} groupCode={data.groupCode} photoVersion={photo?.version ?? null} activeSection="homework"><HomeworkListContent {...data} /></StudentAppShell>;
}
