import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getCurrentOfficialAnnouncement } from "@/lib/campus/official-announcements";
import { prisma } from "@/lib/prisma";
import StudentAppShell from "@/app/student-app-shell";
import TeacherAppShell from "@/app/teacher/teacher-app-shell";
import { acknowledgeOfficialAnnouncementAction } from "@/app/actions/official-announcements";
import AuthRouteFallback from "@/app/auth-route-fallback";

export default function OfficialAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем объявление…" />}><Content params={params} /></Suspense>;
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(Role.STUDENT, Role.TEACHER).catch(() => null); if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT && user.activeRole !== Role.TEACHER) redirect(homePathForRole(user.activeRole));
  const { id } = await params; const [announcement, profile] = await Promise.all([getCurrentOfficialAnnouncement(id), prisma.user.findUnique({ where: { id: user.id }, select: { login: true, profile: { select: { displayName: true } } } })]);
  if (!announcement) notFound();
  const content = <><section className="profile-page-heading"><span className="profile-heading-kicker">ОФИЦИАЛЬНОЕ ОБЪЯВЛЕНИЕ · ВЕРСИЯ {announcement.versionNumber}</span><h1>{announcement.title}</h1><p>{announcement.publishedAt ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Moscow" }).format(announcement.publishedAt) : ""}</p></section><article className="teacher-data-card" style={{ whiteSpace: "pre-wrap" }}>{announcement.body}</article>{announcement.requiresAcknowledgement ? <section className="teacher-data-card"><h2>Подтверждение ознакомления</h2>{announcement.acknowledgedAt ? <p role="status">Ознакомление подтверждено {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(announcement.acknowledgedAt)}.</p> : <form action={async () => { await acknowledgeOfficialAnnouncementAction(announcement.announcementId, announcement.versionId); }}><button className="coursework-primary">Подтвердить ознакомление</button></form>}</section> : null}</>;
  return user.activeRole === Role.STUDENT ? <StudentAppShell displayName={profile?.profile?.displayName ?? profile?.login ?? user.login} groupCode={null} activeSection="notifications">{content}</StudentAppShell> : <TeacherAppShell activeSection="notifications">{content}</TeacherAppShell>;
}
