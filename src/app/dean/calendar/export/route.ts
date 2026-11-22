import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session-core";
import { currentMoscowMonth, validTaskMonthKey, buildTaskCalendarIcs, type TaskCalendarEvent } from "@/lib/tasks/tasks-core";
import { getDeanCalendarMonth } from "@/lib/dean/dean-workspace";

export async function GET(request: Request): Promise<Response> {
  const requestedMonth = new URL(request.url).searchParams.get("month") ?? currentMoscowMonth();
  if (!validTaskMonthKey(requestedMonth)) return new Response("Некорректный месяц.", { status: 400 });
  try {
    const rows = await getDeanCalendarMonth(requestedMonth);
    const events: TaskCalendarEvent[] = [
      ...rows.lessons.map((row) => ({ id: `lesson-${row.id}`, sourceId: row.id, sourceType: "LESSON" as const, category: "STUDY" as const, title: `${row.kind === "EXAM" ? "Экзамен" : "Занятие"}: ${row.course.subject.name} · ${row.group.code}`, description: `${row.room?.code ?? "Аудитория не указана"}`, startsAt: row.startsAt, endsAt: row.endsAt, allDay: false, priority: null, state: "SCHEDULED", sourceLabel: "Расписание", href: "/dean/schedule", reminderAt: null })),
      ...rows.requests.filter((row) => row.deadlineAt).map((row) => ({ id: `request-${row.id}`, sourceId: row.id, sourceType: "ASSIGNED_TASK" as const, category: "WORK" as const, title: `Срок заявки: ${row.title}`, description: `Статус: ${row.state}`, startsAt: row.deadlineAt!, endsAt: null, allDay: true, priority: null, state: row.state, sourceLabel: "Заявки", href: `/dean/requests#${row.id}`, reminderAt: null })),
      ...rows.passes.map((row) => ({ id: `pass-${row.id}`, sourceId: row.id, sourceType: "ASSIGNED_TASK" as const, category: "WORK" as const, title: `Запрос пропуска · ${row.kind}`, description: `Статус: ${row.state}`, startsAt: row.submittedAt, endsAt: null, allDay: true, priority: null, state: row.state, sourceLabel: "Пропуска", href: `/dean/passes#${row.id}`, reminderAt: null })),
      ...rows.events.map((row) => ({ id: `career-${row.id}`, sourceId: row.id, sourceType: "ASSIGNED_TASK" as const, category: "STUDY" as const, title: row.title, description: row.location, startsAt: row.startsAt, endsAt: row.endsAt, allDay: false, priority: null, state: "PUBLISHED", sourceLabel: "Карьерное мероприятие", href: "/dean/career", reminderAt: null })),
    ];
    return new Response(buildTaskCalendarIcs(events), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="dean-calendar-${requestedMonth}.ics"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Требуется вход.", { status:  401 });
    if (error instanceof ForbiddenRoleError) return new Response("Экспорт доступен деканату.", { status: 403 });
    return new Response("Не удалось подготовить экспорт.", { status: 500 });
  }
}
