import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import AuthRouteFallback from "@/app/auth-route-fallback";
import DeanAppShell from "../../dean-app-shell";
import { getDeanStudentDetail } from "@/lib/dean/dean-workspace";

const fmt = (d: Date | null) => d ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(d) : "—";
export default function DeanStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  return <Suspense fallback={<AuthRouteFallback message="Загружаем карточку студента…" />}><Content params={params} /></Suspense>;
}

async function Content({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params; const student = await getDeanStudentDetail(studentId); if (!student) notFound();
  const membership = student.memberships[0];
  return <DeanAppShell active="/dean/students"><section className="dean-requests-heading"><span className="profile-heading-kicker">КАРТОЧКА СТУДЕНТА</span><h1>{student.profile?.displayName ?? student.login}</h1><p>{student.login} · {membership?.group.code ?? "Группа не указана"}</p></section><Link href="/dean/students">← К списку студентов</Link><section className="dean-workspace-panel"><h2>Профиль и обучение</h2><p>Email: {student.profile?.email ?? "Не указан"} · Телефон: {student.profile?.phone ?? "Не указан"}</p><p>Билет: {student.studentAcademicProfile?.studentNumber ?? "Не указан"} · Поступление: {student.studentAcademicProfile?.admissionYear ?? "—"} · Статус: {student.studentAcademicProfile?.academicStatus ?? "Не указан"}</p><p>Программа: {membership?.group.academicProgram?.name ?? "Не указана"}</p><p>Дисциплины группы: {membership?.group.courseLinks.map((item) => item.course.subject.name).join(", ") || "Нет назначенных дисциплин"}</p></section><section className="dean-workspace-panel"><h2>Опубликованные результаты</h2>{student.gradeEntries.length ? <ul>{student.gradeEntries.map((entry) => <li key={entry.assessment.title + entry.assessment.course.subject.name}>{entry.assessment.course.subject.name} · {entry.assessment.title}: {entry.currentRevision?.score.toString() ?? "—"}</li>)}</ul> : <p>Опубликованных оценок нет.</p>}</section><section className="dean-workspace-panel"><h2>Подтверждённые задолженности</h2>{student.confirmedDebts.length ? <ul>{student.confirmedDebts.map((debt) => <li key={debt.id}>{debt.course.subject.name} · подтверждена {fmt(debt.confirmedAt)}{debt.reason ? ` · ${debt.reason}` : ""}</li>)}</ul> : <p>Непогашенных подтверждённых задолженностей нет.</p>}</section><section className="dean-workspace-panel"><h2>Заявки</h2>{student.serviceRequests.length ? <ul>{student.serviceRequests.map((request) => <li key={request.id}><Link href={`/dean/requests#${request.id}`}>{request.title}</Link> · {request.state} · {fmt(request.submittedAt)} · срок {fmt(request.deadlineAt)}</li>)}</ul> : <p>Заявок нет.</p>}</section></DeanAppShell>;
}
