import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getCurrentTeacherMaterials } from "@/lib/coursework/coursework-service";
import TeacherMaterialsContent from "./teacher-materials-content";
import TeacherAppShell from "../teacher-app-shell";

export default function TeacherMaterialsPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем материалы…" />}><Content /></Suspense>; }
async function Content() {
  const user = await currentUser(); if (!user) redirect("/login"); if (user.activeRole !== Role.TEACHER) redirect(homePathForRole(user.activeRole));
  const workspace = await getCurrentTeacherMaterials().catch(() => null);
  return <TeacherAppShell activeSection="materials"><div className="role-placeholder-page coursework-teacher-page"><section className="coursework-teacher-wrap"><Link className="coursework-back" href="/teacher">← Кабинет преподавателя</Link><header className="coursework-heading"><span>УЧЕБНАЯ БИБЛИОТЕКА</span><h1>Материалы</h1><p>Организуйте материалы по дисциплинам, группам и темам.</p></header>{workspace ? <TeacherMaterialsContent {...workspace} /> : <p role="alert">Не удалось загрузить материалы. Попробуйте позже.</p>}</section></div></TeacherAppShell>;
}
