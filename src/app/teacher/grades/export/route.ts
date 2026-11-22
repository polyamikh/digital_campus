import { getTeacherGradebook } from "@/lib/teacher/teacher-workspace";
function csv(value: string) { const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value; return `"${safe.replace(/"/g, '""')}"`; }
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const data = await getTeacherGradebook(params.get("course") ?? undefined, params.get("group") ?? undefined);
  const lines = [["Студент", "Группа", "Дисциплина", "Работа", "Компонент", "Опубликованный результат", "Черновик"]];
  for (const assessment of data.assessments) for (const entry of assessment.entries) lines.push([entry.studentName, data.selected?.groupCode ?? "", data.selected?.courseName ?? "", assessment.title, assessment.component.name, entry.score ?? "", entry.pendingScore ?? ""]);
  const body = "\uFEFF" + lines.map((row) => row.map((value) => csv(String(value))).join(";")).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="teacher-gradebook.csv"', "Cache-Control": "private, no-store" } });
}
