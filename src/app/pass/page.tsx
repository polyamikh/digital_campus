import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import StudentAppShell from "@/app/student-app-shell";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { getStudentPassWorkspace } from "@/lib/campus/pass-service";
import { moscowDateKey } from "@/lib/schedule/moscow-time";
import AuthRouteFallback from "@/app/auth-route-fallback";
import PassRequestControls from "./pass-request-controls";

const labels: Record<string, string> = { SUBMITTED: "Отправлен запрос", IN_REVIEW: "На рассмотрении", APPROVED: "Одобрен", ISSUED: "Выдан", REJECTED: "Отклонён", CANCELLED: "Отменён" };
const dateTime = (value: Date) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Moscow" }).format(value);

export default function PassPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем статус запроса…" />}><AuthenticatedPassPage /></Suspense>; }

async function AuthenticatedPassPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole as RoleType));
  const data = await getStudentPassWorkspace(); const today = moscowDateKey(new Date());
  const requestedToday = data.requests.some((item) => item.kind === "TEMPORARY_DEMO_QR" && moscowDateKey(item.submittedAt) === today);
  const latest = data.requests[0];
  return <StudentAppShell displayName={data.displayName} groupCode={null} activeSection="pass">
    <section className="profile-page-heading"><span className="profile-heading-kicker">СЕРВИС ДЕКАНАТА</span><h1>Забыл пропуск?</h1><p>Отправьте короткий запрос и следите за его статусом здесь.</p></section>
    <section className="coursework-page pass-page" aria-label="Запрос пропуска">
      <article className="coursework-detail-panel pass-request-panel"><div><span className="profile-heading-kicker">БЫСТРЫЙ ЗАПРОС</span><h2>{latest && !["ISSUED", "REJECTED", "CANCELLED"].includes(latest.state) ? labels[latest.state] : "Нужна помощь с пропуском?"}</h2><p>Деканат рассмотрит запрос. Временный QR-пропуск — демонстрационная функция и не обеспечивает реальный доступ в университет.</p></div><PassRequestControls requestedToday={requestedToday} /><small>Не более одного запроса на временный пропуск за московский календарный день. Статус обновится после решения сотрудника.</small></article>
      <section className="coursework-group"><div className="coursework-card-heading"><h2>История запросов</h2><span>{data.requests.length}</span></div>{data.requests.length ? <div className="coursework-teacher-list">{data.requests.map((item) => <article id={`pass-request-${item.id}`} className="coursework-card" key={item.id}><div className="coursework-card-heading"><span>{item.kind === "TEMPORARY_DEMO_QR" ? "Временный демо-пропуск" : "Замена пропуска"}</span><span className="coursework-status">{labels[item.state] ?? item.state}</span></div><p className="coursework-meta">Подано {dateTime(item.submittedAt)}{item.processedBy ? ` · обработал ${item.processedBy.profile?.displayName ?? item.processedBy.login}` : ""}</p>{item.decisionReason ? <p>{item.decisionReason}</p> : null}{item.temporaryPass ? <p>Демо-запись выдана {dateTime(item.temporaryPass.issuedAt)} и действительна до {dateTime(item.temporaryPass.expiresAt)}{item.temporaryPass.revokedAt ? " · отозвана" : item.temporaryPass.expiresAt <= new Date() ? " · срок истёк" : ""}. Она не является средством реального доступа.</p> : null}<ol className="campus-history">{item.history.map((entry) => <li key={entry.id}>{dateTime(entry.createdAt)} — {labels[entry.toState] ?? entry.toState}{entry.note ? ` · ${entry.note}` : ""}{entry.actor.profile?.displayName ? ` · ${entry.actor.profile.displayName}` : ""}</li>)}</ol></article>)}</div> : <div className="coursework-empty"><h2>Запросов пока нет</h2><p>Выберите нужное действие выше. История появится после отправки.</p></div>}</section>
    </section>
  </StudentAppShell>;
}
