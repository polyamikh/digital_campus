import { getTeacherCalendarExport } from "@/lib/teacher/teacher-workspace";

function escapeIcs(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function utc(value: Date) { return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function event(uid: string, title: string, start: Date, end: Date | null, description: string) {
  return ["BEGIN:VEVENT", `UID:${uid}@digital-campus`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(start)}`, ...(end ? [`DTEND:${utc(end)}`] : []), `SUMMARY:${escapeIcs(title)}`, `DESCRIPTION:${escapeIcs(description)}`, "END:VEVENT"].join("\r\n");
}
function moscowCalendarDate(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(value).replace(/-/g, ""); }

export async function GET(request: Request) {
  const data = await getTeacherCalendarExport(new URL(request.url).searchParams.get("semester") ?? undefined);
  const events = [
    ...data.lessons.map((item) => event(item.id, `${item.course.subject.name} · ${item.group?.code ?? "группа"} · ${item.kind === "EXAM" ? "экзамен" : "занятие"}`, item.startsAt, item.endsAt, item.room?.code ?? "Аудитория не указана")),
    ...data.tasks.filter((item) => item.dueAt).map((item) => item.hasDueTime ? event(item.id, item.title, item.dueAt!, item.endsAt, item.details ?? "Личное событие") : ["BEGIN:VEVENT", `UID:${item.id}@digital-campus`, `DTSTAMP:${utc(new Date())}`, `DTSTART;VALUE=DATE:${moscowCalendarDate(item.dueAt!)}`, `DTEND;VALUE=DATE:${moscowCalendarDate(new Date(item.dueAt!.getTime() + 86400000))}`, `SUMMARY:${escapeIcs(item.title)}`, `DESCRIPTION:${escapeIcs(item.details ?? "Личное событие")}`, "END:VEVENT"].join("\r\n")),
    ...data.reviews.filter((item) => item.submittedAt).map((item) => event(`review-${item.id}`, `Проверить: ${item.homework.title} · ${item.homework.group?.code ?? "группа"}`, item.submittedAt!, null, item.homework.course.subject.name)),
    ...data.homeworkDeadlines.filter((item) => item.deadline).map((item) => event(`deadline-${item.id}`, `Дедлайн: ${item.title} · ${item.group?.code ?? "группа"}`, item.deadline!, null, item.course.subject.name)),
  ];
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Digital Campus//Teacher Calendar//RU", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="digital-campus-teacher-${data.semester.toLowerCase()}.ics"`, "Cache-Control": "private, no-store" } });
}
