import { Suspense } from "react";
import AuthRouteFallback from "@/app/auth-route-fallback";
import TeacherAppShell from "../teacher-app-shell";
import TeacherAssistantContent from "./teacher-assistant-content";
import { getTeacherAssistantWorkspace } from "@/lib/teacher/teacher-assistant";
import { requireTeacherPage, teacherHeader } from "../teacher-route";
export default function TeacherAssistantPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем помощника преподавателя…" />}><Content searchParams={searchParams} /></Suspense>; }
async function Content({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) { await requireTeacherPage(); const params = await searchParams; const data = await getTeacherAssistantWorkspace(params.conversation); return <TeacherAppShell activeSection="assistant"><div className="teacher-workspace-page">{teacherHeader("ДЕТЕРМИНИРОВАННЫЕ ПОДСКАЗКИ", "AI-помощник", "Сводки формируются по вашим назначениям. Внешняя языковая модель не подключена.")}<TeacherAssistantContent data={data} /></div></TeacherAppShell>; }
