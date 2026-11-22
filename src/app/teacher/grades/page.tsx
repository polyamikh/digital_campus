import { Suspense } from "react";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherGradebook } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherHeader } from "../teacher-route";
import TeacherGradesContent from "./teacher-grades-content";

export default function TeacherGradesPage({ searchParams }: { searchParams: Promise<{ course?: string; group?: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем журнал оценок…" />}><Content searchParams={searchParams} /></Suspense>; }
async function Content({ searchParams }: { searchParams: Promise<{ course?: string; group?: string }> }) {
  await requireTeacherPage(); const params = await searchParams; const data = await getTeacherGradebook(params.course, params.group);
  return <TeacherAppShell activeSection="grades"><div className="teacher-workspace-page">{teacherHeader("ЕДИНЫЙ ЖУРНАЛ", "Журнал оценок", "Работы, компоненты и опубликованные ревизии по вашим действующим дисциплинам.")}<TeacherGradesContent {...data} /></div></TeacherAppShell>;
}
