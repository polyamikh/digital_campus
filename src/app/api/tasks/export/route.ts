import { UnauthenticatedError, ForbiddenRoleError } from "@/lib/auth/session-core";
import { buildTaskCalendarIcs, currentMoscowMonth, validTaskMonthKey } from "@/lib/tasks/tasks-core";
import { getCurrentStudentTaskCalendar } from "@/lib/tasks/student-tasks";
import { moscowDateKey } from "@/lib/schedule/moscow-time";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requestedMonth = url.searchParams.get("month");
  const month = requestedMonth ?? currentMoscowMonth();
  if (!validTaskMonthKey(month)) return new Response("Некорректный месяц.", { status: 400 });
  try {
    const calendar = await getCurrentStudentTaskCalendar(month);
    const monthEvents = calendar.events.filter((event) => moscowDateKey(event.startsAt).startsWith(month));
    const ics = buildTaskCalendarIcs(monthEvents);
    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"digital-campus-tasks-" + month + ".ics\"",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Требуется вход в систему.", { status: 401 });
    if (error instanceof ForbiddenRoleError) return new Response("Экспорт доступен студенту.", { status: 403 });
    return new Response("Не удалось подготовить экспорт календаря.", { status: 500 });
  }
}
