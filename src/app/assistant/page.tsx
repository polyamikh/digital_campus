import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import AuthRouteFallback from "@/app/auth-route-fallback";
import AssistantContent from "./assistant-content";
import { getAssistantWorkspace } from "@/lib/campus/assistant-service";

export default function AssistantPage({ searchParams }: { searchParams: Promise<{ conversation?: string; mode?: string; new?: string }> }) {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем помощника…" />}><AssistantParams searchParams={searchParams} /></Suspense>;
}

async function AssistantParams({ searchParams }: { searchParams: Promise<{ conversation?: string; mode?: string; new?: string }> }) {
  const params = await searchParams;
  return <AuthenticatedAssistantPage conversationId={params.new === "1" ? undefined : params.conversation} forceNew={params.new === "1"} initialMode={params.mode === "CAREER_ASSISTANT" ? "CAREER_ASSISTANT" : "STUDY_PLANNER"} />;
}

async function AuthenticatedAssistantPage({ conversationId, forceNew, initialMode }: { conversationId?: string; forceNew: boolean; initialMode: "STUDY_PLANNER" | "CAREER_ASSISTANT" }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole as RoleType));
  const data = await getAssistantWorkspace(conversationId, forceNew);
  return <StudentAppShell displayName={data.displayName || user.login} groupCode={null} activeSection="ai">
    <section className="profile-page-heading"><span className="profile-heading-kicker">CAMPUS GUIDE</span><h1>Помощник кампуса</h1><p>Личная история диалогов для учебного планирования и карьерных вопросов.</p></section>
    <AssistantContent data={data} initialMode={data.selected?.mode === "CAREER_ASSISTANT" ? "CAREER_ASSISTANT" : initialMode} />
  </StudentAppShell>;
}
