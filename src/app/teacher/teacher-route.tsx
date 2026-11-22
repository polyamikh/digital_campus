import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";

export async function requireTeacherPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.TEACHER) redirect(homePathForRole(user.activeRole));
  return user;
}

export function teacherDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(value);
}

export function teacherDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" }).format(value);
}

export function teacherTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(value);
}

export function teacherHeader(kicker: string, title: string, description: string) {
  return <header className="teacher-page-heading"><span className="profile-heading-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></header>;
}
