export type SubmissionFormat = "TEXT" | "FILE" | "LINK";
export type CourseworkStatus = "AVAILABLE" | "TO_SUBMIT" | "UNDER_REVIEW" | "REVISION_REQUIRED" | "CHECKED" | "OVERDUE";
export const MAX_COURSEWORK_FILE_BYTES = 20 * 1024 * 1024;
export type CourseComponentOption = { courseId: string; groupIds: string[]; componentId: string; componentName: string };

export function splitFormMetadataAndFiles(source: FormData, fileField = "file") {
  const metadata = new FormData();
  const files: File[] = [];
  source.forEach((value, key) => {
    if (typeof value === "string") metadata.append(key, value);
    else if (key === fileField && value.size > 0) files.push(value);
  });
  return { metadata, files };
}

export function selectUniqueAssessmentComponents(options: CourseComponentOption[], courseId: string, groupId: string): CourseComponentOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (option.courseId !== courseId || !option.groupIds.includes(groupId) || seen.has(option.componentId)) return false;
    seen.add(option.componentId);
    return true;
  });
}

export function studentMaterialScope(groupId: string) { return { state: "PUBLISHED" as const, publishedAt: { not: null }, audiences: { some: { groupId } } }; }
export function studentHomeworkScope(groupId: string) { return { course: { groups: { some: { groupId } } }, OR: [{ groupId }, { groupId: null, assessment: { is: { groupId } } }] }; }
export function isSafeCourseworkObjectKey(key: string) { return /^(materials|submissions)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|txt|jpg|png|webp)$/i.test(key); }

export function validExternalUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.href.length > 2000) return null;
    return url.toString();
  } catch { return null; }
}

export function allowedFormats(flags: { allowText: boolean; allowFile: boolean; allowLink: boolean }): SubmissionFormat[] {
  return [flags.allowText ? "TEXT" : null, flags.allowFile ? "FILE" : null, flags.allowLink ? "LINK" : null].filter((item): item is SubmissionFormat => item !== null);
}

export function submissionStatus(input: { published: boolean; deadline: Date | null; now: Date; state: string | null }): CourseworkStatus {
  if (!input.published) return "AVAILABLE";
  if (input.state === "UNDER_REVIEW") return "UNDER_REVIEW";
  if (input.state === "REVISION_REQUIRED") return "REVISION_REQUIRED";
  if (input.state === "CHECKED") return "CHECKED";
  if (input.deadline && input.deadline < input.now && input.state !== "UNDER_REVIEW") return "OVERDUE";
  return "TO_SUBMIT";
}

export function validHomeworkSubmission(input: { text: unknown; link: unknown; hasFile: boolean; allowText: boolean; allowLink: boolean; allowFile: boolean }): { ok: true; format: SubmissionFormat; text?: string; link?: string } | { ok: false; reason: string } {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const link = validExternalUrl(input.link);
  const selected = Number(Boolean(text)) + Number(Boolean(link)) + Number(input.hasFile);
  if (selected !== 1) return { ok: false, reason: "Отправьте один ответ: текст, файл или ссылку." };
  if (text) return input.allowText && text.length <= 20000 ? { ok: true, format: "TEXT", text } : { ok: false, reason: "Текстовый ответ не разрешён или слишком длинный." };
  if (link) return input.allowLink ? { ok: true, format: "LINK", link } : { ok: false, reason: "Ссылочный ответ не разрешён." };
  return input.allowFile ? { ok: true, format: "FILE" } : { ok: false, reason: "Загрузка файла не разрешена." };
}

export function validateCourseworkUpload(bytes: Uint8Array, mimeHint: string | undefined, maxBytes = 20 * 1024 * 1024): { ok: true; mimeType: string; extension: string } | { ok: false; reason: string } {
  if (!bytes.length || bytes.length > maxBytes) return { ok: false, reason: "Файл пустой или превышает размер 20 МБ." };
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const pdf = starts(0x25, 0x50, 0x44, 0x46, 0x2d);
  const png = starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const jpeg = starts(0xff, 0xd8, 0xff);
  const webp = starts(0x52, 0x49, 0x46, 0x46) && bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  const plainText = (mimeHint === "text/plain") && bytes.subarray(0, Math.min(bytes.length, 512)).every((byte) => byte === 9 || byte === 10 || byte === 13 || byte >= 32);
  if (pdf) return { ok: true, mimeType: "application/pdf", extension: "pdf" };
  if (png) return { ok: true, mimeType: "image/png", extension: "png" };
  if (jpeg) return { ok: true, mimeType: "image/jpeg", extension: "jpg" };
  if (webp) return { ok: true, mimeType: "image/webp", extension: "webp" };
  if (plainText) return { ok: true, mimeType: "text/plain", extension: "txt" };
  return { ok: false, reason: "Поддерживаются PDF, TXT, JPG, PNG и WebP." };
}

export function homeworkCalendarProjectionId(homeworkId: string): { sourceType: "HOMEWORK"; sourceId: string } {
  return { sourceType: "HOMEWORK", sourceId: homeworkId };
}

export function publishedHomeworkNoticeKey(homeworkId: string, version: number): string {
  return `homework:${homeworkId}:published:v${version}`;
}

export function calculateHomeworkGradePercent(score: number, maximum: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(maximum) || maximum <= 0 || score < 0 || score > 100) return null;
  return score / 100 * maximum;
}
