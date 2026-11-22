import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session-core";
import { getDeanAnalytics } from "@/lib/dean/dean-workspace";

function csv(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }
export async function GET(request: Request) {
  const url = new URL(request.url); const groupId = url.searchParams.get("groupId") || undefined; const courseId = url.searchParams.get("courseId") || undefined; const studentId = url.searchParams.get("studentId") || undefined;
  try {
    const data = await getDeanAnalytics(groupId, courseId, studentId);
    const lines = [["Показатель", "Значение"], ["Опубликованные оценки", String(data.publishedGradeCount)], ["Средний опубликованный балл", data.averagePublishedScore === null ? "Нет данных" : data.averagePublishedScore.toFixed(2)], ["Непогашенные подтверждённые долги", String(data.unresolvedDebtCount)], ...Object.entries(data.attendanceCounts).map(([key, value]) => [`Посещаемость ${key}`, String(value)]), ...Object.entries(data.submissionStates).map(([key, value]) => [`Сдачи ${key}`, String(value)])];
    lines.push([], ["Студент", "Группа", "Дисциплина", "Компонент", "Работа", "Опубликованный балл"]);
    for (const row of data.results) lines.push([row.studentName, row.groupCode, row.courseName, row.componentName, row.assessmentTitle, row.score]);
    lines.push([], ["Подтверждённая задолженность", "Студент", "Группа", "Дата подтверждения"]);
    for (const debt of data.debts) lines.push([debt.course.subject.name, debt.student.profile?.displayName ?? debt.student.login, debt.student.memberships[0]?.group.code ?? "", new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeZone: "Europe/Moscow" }).format(debt.confirmedAt)]);
    return new Response("\uFEFF" + lines.map((row) => row.map(csv).join(";")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=dean-academic-analytics.csv", "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Требуется вход.", { status: 401 });
    if (error instanceof ForbiddenRoleError) return new Response("Экспорт доступен деканату.", { status: 403 });
    return new Response("Не удалось подготовить экспорт.", { status: 500 });
  }
}
