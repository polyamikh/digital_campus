export type TeacherGradeDraftInput = { assessmentId: string; studentId: string; score: number; reason: string };

export function parseTeacherGradeDrafts(rows: readonly { assessmentId: unknown; studentId: unknown; score: unknown; reason: unknown }[]): { ok: true; rows: TeacherGradeDraftInput[] } | { ok: false; error: string } {
  if (!rows.length || rows.length > 500) return { ok: false, error: "Выберите оценки для сохранения." };
  const seen = new Set<string>();
  const parsed: TeacherGradeDraftInput[] = [];
  for (const row of rows) {
    if (typeof row.assessmentId !== "string" || typeof row.studentId !== "string" || !/^[0-9a-f-]{36}$/i.test(row.assessmentId) || !/^[0-9a-f-]{36}$/i.test(row.studentId)) return { ok: false, error: "Некорректные ссылки на работу или студента." };
    const score = typeof row.score === "number" ? row.score : typeof row.score === "string" && row.score.trim() ? Number(row.score) : Number.NaN;
    if (!Number.isFinite(score) || score < 0 || score > 100 || Math.round(score * 100) !== score * 100) return { ok: false, error: "Оценка должна быть числом от 0 до 100 с точностью до сотых." };
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    if (reason.length > 1000) return { ok: false, error: "Причина слишком длинная." };
    const key = row.assessmentId + ":" + row.studentId;
    if (seen.has(key)) return { ok: false, error: "В запросе повторяется одна и та же оценка." };
    seen.add(key); parsed.push({ assessmentId: row.assessmentId, studentId: row.studentId, score, reason });
  }
  return { ok: true, rows: parsed };
}

export function validateAssessmentStructureInput(raw: unknown): { ok: true; components: Array<{ name: string; maximumPoints: number; position: number }>; reason: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.length > 5000) return { ok: false, error: "Укажите структуру оценивания." };
  const rows = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  if (rows.length < 3 || rows.length > 5) return { ok: false, error: "Структура должна содержать от 3 до 5 компонентов." };
  const components: Array<{ name: string; maximumPoints: number; position: number }> = [];
  const names = new Set<string>();
  for (const [position, row] of rows.entries()) {
    const parts = row.split("|").map((part) => part.trim());
    const name = parts[0] ?? ""; const maximumPoints = Number(parts[1]);
    if (parts.length !== 2 || !name || name.length > 160 || !Number.isFinite(maximumPoints) || maximumPoints <= 0 || maximumPoints > 100 || Math.round(maximumPoints * 100) !== maximumPoints * 100) return { ok: false, error: "Используйте формат «Название | максимум» с положительными максимумами." };
    const normalized = name.toLocaleLowerCase("ru-RU");
    if (names.has(normalized)) return { ok: false, error: "Названия компонентов должны быть уникальными." };
    names.add(normalized); components.push({ name, maximumPoints, position });
  }
  if (Math.round(components.reduce((sum, item) => sum + item.maximumPoints, 0) * 100) !== 10000) return { ok: false, error: "Сумма максимальных баллов компонентов должна составлять 100." };
  return { ok: true, components, reason: "" };
}
