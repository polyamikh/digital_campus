import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getTeacherHomeworkWorkspace } from "@/lib/coursework/coursework-service";
import TeacherHomeworkContent from "./teacher-homework-content";
import TeacherAppShell from "../teacher-app-shell";

export default function TeacherHomeworkPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем домашние задания…" />}><Content /></Suspense>; }
async function Content() {
  const user = await currentUser(); if (!user) redirect("/login"); if (user.activeRole !== Role.TEACHER) redirect(homePathForRole(user.activeRole));
  const workspace = await getTeacherHomeworkWorkspace().catch(() => null);
  return <TeacherAppShell activeSection="homework"><div className="role-placeholder-page coursework-teacher-page"><section className="coursework-teacher-wrap"><Link className="coursework-back" href="/teacher">← Кабинет преподавателя</Link><header className="coursework-heading"><span>ЗАДАНИЯ · ПРОВЕРКА · ЕДИНЫЙ ЖУРНАЛ</span><h1>Домашние задания</h1><p>Публикуйте задания, проверяйте работы и отдельно открывайте оценки студентам.</p></header>{workspace ? <TeacherHomeworkContent {...workspace} /> : <p role="alert">Не удалось загрузить задания. Попробуйте позже.</p>}</section></div></TeacherAppShell>;
}
