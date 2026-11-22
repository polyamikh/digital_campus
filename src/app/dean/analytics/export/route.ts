import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session-core";
import { getDeanAnalytics } from "@/lib/dean/dean-workspace";

function csv(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }
export async function GET(request: Request) {
  const url = new URL(request.url); const groupId = url.searchParams.get("groupId") || undefined; const courseId = url.searchParams.get("courseId") || undefined;
  try {
    const data = await getDeanAnalytics(groupId, courseId);
    const lines = [["Показатель", "Значение"], ["Опубликованные работы", String(data.publishedGradeCount)], ["Средний опубликованный балл", data.averagePublishedScore === null ? "Нет данных" : data.averagePublishedScore.toFixed(2)], ["Непогашенные подтверждённые долги", String(data.unresolvedDebtCount)], ...Object.entries(data.attendanceCounts).map(([key, value]) => [`Посещаемость ${key}`, String(value)]), ...Object.entries(data.submissionStates).map(([key, value]) => [`Сдачи ${key}`, String(value)])];
    return new Response("\uFEFF" + lines.map((row) => row.map(csv).join(";")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=dean-academic-analytics.csv", "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Требуется вход.", { status: 401 });
    if (error instanceof ForbiddenRoleError) return new Response("Экспорт доступен деканату.", { status: 403 });
    return new Response("Не удалось подготовить экспорт.", { status: 500 });
  }
}
