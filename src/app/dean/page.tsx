import { Suspense } from "react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";

export default function DeanHomePage() {
  return <Suspense fallback={<AuthRouteFallback />}><DeanRequestEntry /></Suspense>;
}

async function DeanRequestEntry(): Promise<ReactNode> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.DEAN) redirect(homePathForRole(user.activeRole));
  redirect("/dean/requests");
  return null;
}
