import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import StudentAppShell from "@/app/student-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { requireRole } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getCurrentStudentGroupAnnouncement } from "@/lib/campus/student-announcements";

export default function StudentGroupAnnouncementPage({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем объявление…" />}><Content params={params} /></Suspense>; }
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(Role.STUDENT).catch(() => null);
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));
  const { id } = await params;
  const [announcement, identity] = await Promise.all([
    getCurrentStudentGroupAnnouncement(id),
    prisma.user.findUnique({ where: { id: user.id }, select: { login: true, profile: { select: { displayName: true } } } }),
  ]);
  if (!announcement) notFound();
  return <StudentAppShell displayName={identity?.profile?.displayName ?? identity?.login ?? user.login} groupCode={announcement.group?.code ?? null} activeSection="notifications"><section className="profile-page-heading"><span className="profile-heading-kicker">ОБЪЯВЛЕНИЕ ДЛЯ ГРУППЫ {announcement.group?.code}</span><h1>{announcement.title}</h1><p>{announcement.course.subject.name} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Moscow" }).format(announcement.publishedAt)}</p></section><article className="teacher-data-card" style={{ whiteSpace: "pre-wrap" }}>{announcement.body}</article></StudentAppShell>;
}
