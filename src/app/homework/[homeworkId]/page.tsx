import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { getStudentHomeworkDetail } from "@/lib/coursework/coursework-service";
import HomeworkDetailContent from "../homework-detail-content";

export default function HomeworkDetailPage({ params }: { params: Promise<{ homeworkId: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем задание…" />}><Content params={params} /></Suspense>; }
async function Content({ params }: { params: Promise<{ homeworkId: string }> }) {
  const user = await currentUser(); if (!user) redirect("/login"); if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));
  const { homeworkId } = await params;
  const [detail, profile, photo] = await Promise.all([getStudentHomeworkDetail(homeworkId).catch(() => null), prisma.userProfile.findUnique({ where: { userId: user.id }, select: { displayName: true } }), getProfilePhotoMetadata(user.id)]);
  if (!detail) notFound();
  return <StudentAppShell displayName={profile?.displayName || user.login} groupCode={null} photoVersion={photo?.version ?? null} activeSection="homework"><Link className="coursework-back" href="/homework">← Домашние задания</Link><HomeworkDetailContent detail={detail} /></StudentAppShell>;
}
