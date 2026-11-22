export type CampusAssistantMode = "STUDY_PLANNER" | "CAREER_ASSISTANT";

export function safeCampusUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.href.length > 2000) return null;
    return url.toString();
  } catch { return null; }
}

export function directChatKey(userA: string, userB: string): string | null {
  if (!userA || !userB || userA === userB) return null;
  return [userA, userB].sort().join(":");
}

export function chatDisplayTitle(input: {
  name: string | null;
  kind: "DIRECT" | "GROUP" | "COURSE" | string;
  peerName?: string | null;
  courseName?: string | null;
  groupCode?: string | null;
}): string {
  const storedName = input.name?.trim();
  const looksTechnical = !!storedName && (
    /^(?:group|course|direct|chat)[-_][a-z0-9-]{8,}$/i.test(storedName)
    || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(storedName)
  );
  if (storedName && !looksTechnical) return storedName;
  if (input.kind === "DIRECT" && input.peerName?.trim()) return input.peerName.trim();
  if (input.courseName?.trim()) return input.courseName.trim();
  if (input.groupCode?.trim()) return `Группа ${input.groupCode.trim()}`;
  return input.kind === "DIRECT" ? "Личная переписка" : "Учебный чат";
}

export function studentChatVisibilityScope(groupIds: string[]) {
  const OR: Array<Record<string, unknown>> = [{ kind: "DIRECT" }];
  if (groupIds.length) OR.push(
    { kind: "GROUP", groupId: { in: groupIds } },
    { kind: "COURSE", course: { groups: { some: { groupId: { in: groupIds } } } } },
  );
  return { OR };
}

export function careerMatch(skills: string[], requirements: string): { matched: string[]; score: number } {
  const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}+#.]+/gu, " ").trim();
  const text = ` ${normalize(requirements)} `;
  const unique = [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))];
  const matched = unique.filter((skill) => {
    const normalized = normalize(skill);
    return normalized.length >= 2 && text.includes(` ${normalized} `);
  });
  return { matched, score: unique.length ? Math.round(matched.length * 100 / unique.length) : 0 };
}

export function validateCareerResumeInput(input: { headline: unknown; summary: unknown; skills: unknown }): { ok: true; headline: string | null; summary: string | null; skills: string[] } | { ok: false; error: string } {
  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (headline.length > 200 || summary.length > 5000) return { ok: false, error: "Проверьте длину заголовка и описания." };
  if (typeof input.skills !== "string") return { ok: false, error: "Укажите навыки в текстовом поле." };
  const skills = [...new Set(input.skills.split(/[\n,;]/).map((skill) => skill.trim()).filter(Boolean))];
  if (skills.length > 30 || skills.some((skill) => skill.length > 100)) return { ok: false, error: "Можно указать до 30 навыков длиной до 100 символов." };
  return { ok: true, headline: headline || null, summary: summary || null, skills };
}

export function parseCareerEntries(value: unknown): { ok: true; entries: Array<{ kind: "EXPERIENCE" | "PROJECT"; title: string; organization: string | null; description: string | null; position: number }> } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "Проверьте раздел опыта и проектов." };
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 20) return { ok: false, error: "Можно добавить не более 20 записей опыта и проектов." };
  const entries: Array<{ kind: "EXPERIENCE" | "PROJECT"; title: string; organization: string | null; description: string | null; position: number }> = [];
  for (const [position, line] of lines.entries()) {
    const [kindValue, titleValue, organizationValue, descriptionValue] = line.split("|").map((part) => part.trim());
    if ((kindValue !== "ОПЫТ" && kindValue !== "ПРОЕКТ") || !titleValue || titleValue.length > 200 || (organizationValue?.length ?? 0) > 200 || (descriptionValue?.length ?? 0) > 5000) return { ok: false, error: "Используйте формат: ОПЫТ или ПРОЕКТ | Название | Организация | Описание." };
    entries.push({ kind: kindValue === "ОПЫТ" ? "EXPERIENCE" : "PROJECT", title: titleValue, organization: organizationValue || null, description: descriptionValue || null, position });
  }
  return { ok: true, entries };
}

export function answerCampusAssistant(input: {
  mode: CampusAssistantMode;
  question: string;
  upcomingItems: Array<{ title: string; date: string }>;
  skills: string[];
  opportunityTitles: string[];
}): string {
  const question = input.question.toLocaleLowerCase("ru-RU");
  if (input.mode === "STUDY_PLANNER") {
    if (!input.upcomingItems.length) return "В доступных мне данных пока нет ближайших занятий или опубликованных дедлайнов. Проверьте разделы «Расписание» и «Домашние задания» — я использую только сведения вашей группы.";
    const items = input.upcomingItems.slice(0, 5).map((item) => `• ${item.date} — ${item.title}`).join("\n");
    const intro = /экзам|срок|дедлайн|задан|домаш/i.test(question) ? "Вот ближайшие учебные даты из вашего расписания и опубликованных заданий:" : "Вот ближайшие учебные даты, которые можно учесть при планировании:";
    return `${intro}\n${items}\n\nЭто автоматическая выборка из данных вашей группы, а не решение преподавателя.`;
  }
  if (!input.skills.length) return "Добавьте навыки в разделе «Карьерные возможности → Конструктор резюме». После этого я смогу показать совпадения с опубликованными возможностями. Ответы формируются по ключевым словам, без внешней языковой модели.";
  if (!input.opportunityTitles.length) return `В резюме указано ${input.skills.slice(0, 6).join(", ")}. Сейчас нет опубликованных возможностей для сравнения. Раздел обновится, когда карьерный центр добавит актуальные записи.`;
  return `Ваши навыки: ${input.skills.slice(0, 8).join(", ")}. Доступные записи для самостоятельной проверки: ${input.opportunityTitles.slice(0, 5).join("; ")}. Сопоставление здесь детерминированное и основано на ключевых словах; это не оценка работодателя и не ответ языковой модели.`;
}

export function passCanTransition(from: string, to: string): boolean {
  const allowed: Record<string, string[]> = {
    SUBMITTED: ["IN_REVIEW", "APPROVED", "REJECTED"],
    IN_REVIEW: ["APPROVED", "REJECTED"],
    APPROVED: ["ISSUED", "REJECTED"],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function formatUnreadCount(count: number): string {
  return count > 99 ? "99+" : String(Math.max(0, count));
}
