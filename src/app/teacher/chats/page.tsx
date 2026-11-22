import { Suspense } from "react";
import AuthRouteFallback from "@/app/auth-route-fallback";
import TeacherAppShell from "../teacher-app-shell";
import TeacherChatsContent from "./teacher-chats-content";
import { getTeacherChatWorkspace } from "@/lib/teacher/teacher-chat-service";
import { requireTeacherPage, teacherHeader } from "../teacher-route";
export default function TeacherChatsPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем чаты преподавателя…" />}><Content searchParams={searchParams} /></Suspense>; }
async function Content({ searchParams }: { searchParams: Promise<{ chat?: string }> }) { await requireTeacherPage(); const params = await searchParams; const data = await getTeacherChatWorkspace(params.chat); return <TeacherAppShell activeSection="chats"><div className="teacher-workspace-page">{teacherHeader("ОБЩЕНИЕ ПО НАЗНАЧЕНИЯМ", "Чаты", "Личные и групповые переписки доступны только участникам и преподавателям назначенных групп.")}<TeacherChatsContent data={data} /><p className="teacher-demo-note">Общий чат дисциплины не отображается, если его состав нельзя однозначно ограничить одной назначенной группой.</p></div></TeacherAppShell>; }
