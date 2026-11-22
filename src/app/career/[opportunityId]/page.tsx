import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getStudentCareerOpportunityDetail } from "@/lib/campus/career-service";
import { prisma } from "@/lib/prisma";
import AuthRouteFallback from "@/app/auth-route-fallback";
import CareerApplyForm from "./career-apply-form";

export default function CareerOpportunityPage({ params }: { params: Promise<{ opportunityId: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем возможность…" />}><Opportunity params={params} /></Suspense>; }
async function Opportunity({ params }: { params: Promise<{ opportunityId: string }> }) {
  const user = await currentUser(); if (!user) redirect("/login"); if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole as RoleType));
  const { opportunityId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(opportunityId)) notFound();
  const [item, profile] = await Promise.all([getStudentCareerOpportunityDetail(opportunityId), prisma.userProfile.findUnique({ where: { userId: user.id }, select: { displayName: true } })]);
  if (!item) notFound();
  return <StudentAppShell displayName={profile?.displayName ?? user.login} groupCode={null} activeSection="career"><div className="career-detail"><Link href="/career">← Все возможности</Link><article className="coursework-detail-panel"><span className="profile-heading-kicker">{item.category.name}{item.isDemo ? " · ДЕМО" : ""}</span><h1>{item.title}</h1><p className="coursework-meta">{item.organization}{item.location ? ` · ${item.location}` : ""}{item.direction ? ` · ${item.direction}` : ""}</p><p>{item.description}</p>{item.closesAt ? <p>Приём до {new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" }).format(item.closesAt)}</p> : null}{item.externalUrl ? <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="coursework-resource">Перейти на внешний источник <small>↗</small></a> : null}<CareerApplyForm opportunityId={item.id} /></article></div></StudentAppShell>;
}
