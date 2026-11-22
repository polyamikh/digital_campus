import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getStudentChatWorkspace } from "@/lib/campus/chat-service";
import { prisma } from "@/lib/prisma";
import ChatsContent from "./chats-content";

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ chat?: string; q?: string }> }) {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем чаты…" />}><ChatsParams searchParams={searchParams} /></Suspense>;
}

async function ChatsParams({ searchParams }: { searchParams: Promise<{ chat?: string; q?: string }> }) {
  const params = await searchParams;
  return <AuthenticatedChatsPage chatId={params.chat} query={params.q} />;
}

async function AuthenticatedChatsPage({ chatId, query }: { chatId?: string; query?: string }) {
  const user = await currentUser(); if (!user) redirect("/login"); if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole as RoleType));
  const [data, profile] = await Promise.all([getStudentChatWorkspace(chatId, query), prisma.userProfile.findUnique({ where: { userId: user.id }, select: { displayName: true } })]);
  return <StudentAppShell displayName={profile?.displayName || user.login} groupCode={null} activeSection="chats"><section className="profile-page-heading"><span className="profile-heading-kicker">ОБЩЕНИЕ ПО УЧЁБЕ</span><h1>Чаты</h1><p>Переписки, доступные по вашим текущим связям с группой и дисциплинами.</p></section><ChatsContent data={data} currentUserId={user.id} /></StudentAppShell>;
}
