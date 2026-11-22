import { getTeacherGroups } from "@/lib/teacher/teacher-workspace";
function csv(value: string) { const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value; return `"${safe.replace(/"/g, '""')}"`; }
export async function GET() {
  const { groups } = await getTeacherGroups();
  const lines = [["Группа", "Студент", "Статус", "Опубликованные работы"]];
  for (const group of groups) for (const student of group.students) lines.push([group.code, student.name, student.academicStatus ?? "", String(student.publishedWorkCount)]);
  const body = "\uFEFF" + lines.map((row) => row.map(csv).join(";")).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="teacher-groups.csv"', "Cache-Control": "private, no-store" } });
}
