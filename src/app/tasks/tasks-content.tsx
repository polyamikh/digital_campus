"use client";

import { useActionState, useCallback, useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { deletePersonalTaskAction, savePersonalTaskAction, setPersonalTaskCompletionAction } from "@/app/actions/tasks";
import { initialTaskActionState } from "@/lib/tasks/task-action-state";
import { filterTaskEvents, groupTaskEventsByDate, layoutTimedEvents, shiftTaskDate, shiftTaskMonth, taskMonthGrid, taskWeekGrid, toMoscowDateTimeLocal, type TaskCalendarEvent, type TaskCalendarMode, type TaskCategoryValue, type TaskDeadlineFilter, type TaskPriorityFilter, type TaskStatusFilter } from "@/lib/tasks/tasks-core";
import { moscowDateKey, moscowTime } from "@/lib/schedule/moscow-time";

type SerializedEvent = Omit<TaskCalendarEvent, "startsAt" | "endsAt" | "reminderAt"> & { startsAt: string; endsAt: string | null; reminderAt: string | null; version?: number };
type UndatedTask = { id: string; title: string; details: string | null; category: TaskCategoryValue; priority: "LOW" | "MEDIUM" | "HIGH"; state: "OPEN" | "COMPLETED"; version: number; dueAt: null; endsAt: null; hasDueTime: boolean; reminderAt: string | null };
type Props = { month: string; mode: TaskCalendarMode; selectedDate: string; today: string; events: SerializedEvent[]; tasksWithoutDate: UndatedTask[]; membershipProblem: "MISSING" | "AMBIGUOUS" | null; notificationPreferenceEnabled: boolean };
type EditorItem = TaskCalendarEvent | UndatedTask | null | "new";

const categories: Array<{ value: TaskCategoryValue; label: string; color: string }> = [
  { value: "STUDY", label: "Учёба", color: "#22C7E8" },
  { value: "WORK", label: "Работа", color: "#A78BFA" },
  { value: "PERSONAL", label: "Личное", color: "#F472B6" },
];
const priorityLabels = { HIGH: "Высокий", MEDIUM: "Средний", LOW: "Низкий" } as const;
const modes: Array<{ value: TaskCalendarMode; label: string }> = [
  { value: "month", label: "Месяц" }, { value: "week", label: "Неделя" }, { value: "day", label: "День" }, { value: "list", label: "Список" },
];
const monthLabel = (key: string) => new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(key + "-01T12:00:00Z"));
const dateLabel = (key: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) => new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: "UTC" }).format(new Date(key + "T12:00:00Z"));
const categoryLabel = (category: TaskCategoryValue) => categories.find((item) => item.value === category)?.label ?? "Личное";
const categoryColor = (category: TaskCategoryValue) => categories.find((item) => item.value === category)?.color ?? "#F472B6";

function addClockMinutes(value: string, delta: number): string {
  const [hour, minute] = value.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + delta);
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

export default function TasksContent(props: Props) {
  const router = useRouter();
  const selectedDate = props.selectedDate;
  const [status, setStatus] = useState<TaskStatusFilter>("ALL");
  const [priority, setPriority] = useState<TaskPriorityFilter>("ALL");
  const [deadline, setDeadline] = useState<TaskDeadlineFilter>("ALL");
  const [enabledCategories, setEnabledCategories] = useState<TaskCategoryValue[]>(["STUDY", "WORK", "PERSONAL"]);
  const [editor, setEditor] = useState<EditorItem>(null);
  const [editorDefaults, setEditorDefaults] = useState<{ date: string; time: string; allDay: boolean }>({ date: props.selectedDate, time: "09:00", allDay: true });
  const [isPending, startTransition] = useTransition();
  const events = useMemo(() => props.events.map((event) => ({ ...event, startsAt: new Date(event.startsAt), endsAt: event.endsAt ? new Date(event.endsAt) : null, reminderAt: event.reminderAt ? new Date(event.reminderAt) : null })), [props.events]);
  const filtered = useMemo(() => filterTaskEvents(events, { status, priority, deadline, categories: enabledCategories, now: new Date() }), [events, status, priority, deadline, enabledCategories]);
  const byDate = groupTaskEventsByDate(filtered);
  const monthDates = useMemo(() => taskMonthGrid(props.month), [props.month]);
  const weekDates = useMemo(() => taskWeekGrid(selectedDate), [selectedDate]);

  const pushView = (mode: TaskCalendarMode, date: string) => router.push(`/tasks?month=${date.slice(0, 7)}&day=${date}&mode=${mode}`);
  const navigate = (direction: -1 | 1) => {
    if (props.mode === "week") return pushView("week", shiftTaskDate(selectedDate, direction * 7));
    if (props.mode === "day") return pushView("day", shiftTaskDate(selectedDate, direction));
    const targetMonth = shiftTaskMonth(props.month, direction);
    return pushView(props.mode, targetMonth + "-01");
  };
  const openNew = (date = selectedDate, time?: string) => {
    setEditorDefaults({ date, time: time ?? "09:00", allDay: time === undefined });
    setEditor("new");
  };
  const onSaved = useCallback(() => { setEditor(null); router.refresh(); }, [router]);

  const rangeTitle = props.mode === "month" ? monthLabel(props.month)
    : props.mode === "week" ? `${dateLabel(weekDates[0]!, { day: "numeric", month: "short" })} — ${dateLabel(weekDates[6]!, { day: "numeric", month: "long", year: "numeric" })}`
      : props.mode === "day" ? dateLabel(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        : `События · ${monthLabel(props.month)}`;

  return <div className="tasks-page">
    <div className="tasks-toolbar">
      <div className="tasks-mode-switch" role="tablist" aria-label="Режим календаря">
        {modes.map((mode) => <a key={mode.value} role="tab" aria-selected={props.mode === mode.value} aria-current={props.mode === mode.value ? "page" : undefined} className={props.mode === mode.value ? "is-active" : ""} href={`/tasks?month=${props.month}&day=${selectedDate}&mode=${mode.value}`}>{mode.label}</a>)}
      </div>
      <button className="tasks-primary-button" type="button" onClick={() => openNew()}><span aria-hidden="true">＋</span> Новое событие</button>
    </div>

    {props.membershipProblem && <div className="tasks-notice" role="status">{props.membershipProblem === "MISSING" ? "Для вашего аккаунта не найдена действующая учебная группа." : "Для аккаунта найдено несколько действующих учебных групп; учебные события временно скрыты."}</div>}

    <section className="tasks-calendar-workspace" aria-label="Календарь событий">
      <header className="tasks-calendar-toolbar">
        <div className="tasks-calendar-navigation"><button type="button" aria-label="Предыдущий период" onClick={() => navigate(-1)}>‹</button><button type="button" aria-label="Следующий период" onClick={() => navigate(1)}>›</button><button className="tasks-today-button" type="button" onClick={() => pushView(props.mode, props.today)}>Сегодня</button><h2>{rangeTitle}</h2></div>
      </header>
      <div className="tasks-filter-row">
        <div className="tasks-category-filters" aria-label="Фильтр категорий">
          {categories.map((category) => {
            const active = enabledCategories.includes(category.value);
            return <button type="button" key={category.value} aria-pressed={active} className={active ? "is-active" : ""} style={{ "--task-category-color": category.color } as CSSProperties} onClick={() => setEnabledCategories((current) => active ? current.filter((value) => value !== category.value) : [...current, category.value])}><i />{category.label}</button>;
          })}
        </div>
        <TaskFilters status={status} priority={priority} deadline={deadline} onStatus={setStatus} onPriority={setPriority} onDeadline={setDeadline} />
      </div>

      {props.mode === "month" && <MonthView month={props.month} dates={monthDates} events={filtered} selectedDate={selectedDate} today={props.today} onSelect={(date) => pushView("month", date)} onNew={openNew} onEdit={(event) => setEditor(event)} />}
      {props.mode === "week" && <TimeView dates={weekDates} events={filtered} mode="week" selectedDate={selectedDate} today={props.today} onSelect={(date) => pushView("day", date)} onNew={openNew} onEdit={(event) => setEditor(event)} />}
      {props.mode === "day" && <TimeView dates={[selectedDate]} events={filtered} mode="day" selectedDate={selectedDate} today={props.today} onSelect={() => undefined} onNew={openNew} onEdit={(event) => setEditor(event)} />}
      {props.mode === "list" && <ListView groups={byDate} tasksWithoutDate={props.tasksWithoutDate.filter((task) => enabledCategories.includes(task.category))} onEdit={(event) => setEditor(event)} onNew={openNew} onRefresh={() => router.refresh()} busy={isPending} startTransition={startTransition} />}
    </section>

    {props.mode === "month" && <section className="tasks-selected-day"><header><div><span className="profile-heading-kicker">ВЫБРАННЫЙ ДЕНЬ</span><h2>{dateLabel(selectedDate)}</h2></div><button type="button" className="tasks-secondary-button" onClick={() => openNew(selectedDate)}>＋ Добавить</button></header>{(() => { const dayEvents = filtered.filter((event) => moscowDateKey(event.startsAt) === selectedDate); return dayEvents.length ? <div className="tasks-selected-events">{dayEvents.map((event) => <EventCard key={event.id} event={event} onEdit={() => setEditor(event)} onRefresh={() => router.refresh()} busy={isPending} startTransition={startTransition} />)}</div> : <div className="tasks-empty-inline">На выбранную дату событий нет.</div>; })()}</section>}

    {editor !== null && <TaskEditor key={editor === "new" ? `new-${editorDefaults.date}-${editorDefaults.time}-${editorDefaults.allDay}` : "edit"} item={editor === "new" ? null : editor} defaultDate={editorDefaults.date} defaultTime={editorDefaults.time} defaultAllDay={editorDefaults.allDay} notificationPreferenceEnabled={props.notificationPreferenceEnabled} onClose={() => setEditor(null)} onSaved={onSaved} />}
  </div>;
}

function TaskFilters({ status, priority, deadline, onStatus, onPriority, onDeadline }: { status: TaskStatusFilter; priority: TaskPriorityFilter; deadline: TaskDeadlineFilter; onStatus: (value: TaskStatusFilter) => void; onPriority: (value: TaskPriorityFilter) => void; onDeadline: (value: TaskDeadlineFilter) => void }) {
  return <div className="tasks-filters"><label>Статус<select value={status} onChange={(event) => onStatus(event.target.value as TaskStatusFilter)}><option value="ALL">Все задачи</option><option value="OPEN">Активные</option><option value="COMPLETED">Выполненные</option></select></label><label>Приоритет<select value={priority} onChange={(event) => onPriority(event.target.value as TaskPriorityFilter)}><option value="ALL">Любой приоритет</option><option value="HIGH">Высокий</option><option value="MEDIUM">Средний</option><option value="LOW">Низкий</option></select></label><label>Срок<select value={deadline} onChange={(event) => onDeadline(event.target.value as TaskDeadlineFilter)}><option value="ALL">Любой срок</option><option value="UPCOMING">Предстоящие</option><option value="OVERDUE">Просроченные</option></select></label></div>;
}

function MonthView({ month, dates, events, selectedDate, today, onSelect, onNew, onEdit }: { month: string; dates: string[]; events: TaskCalendarEvent[]; selectedDate: string; today: string; onSelect: (date: string) => void; onNew: (date: string, time?: string) => void; onEdit: (event: TaskCalendarEvent) => void }) {
  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return <div className="tasks-month-view">
    <div className="tasks-month-grid tasks-month-grid-full">{weekDays.map((day) => <span className="tasks-weekday" key={day}>{day}</span>)}
      {dates.map((date) => {
        const dayEvents = events.filter((event) => moscowDateKey(event.startsAt) === date);
        return <div key={date} role="group" aria-label={dateLabel(date)} className={`tasks-month-cell${date.slice(0, 7) !== month ? " is-outside" : ""}${date === today ? " is-today" : ""}${date === selectedDate ? " is-selected" : ""}`} onDoubleClick={() => onNew(date)}>
          <button className="tasks-month-cell-date" type="button" aria-current={date === today ? "date" : undefined} aria-label={`Показать ${dateLabel(date)}`} onClick={() => onSelect(date)}>{Number(date.slice(-2))}</button>
          <button className="tasks-month-cell-add" type="button" aria-label={`Новое событие: ${dateLabel(date)}`} onClick={() => onNew(date)}>＋</button>
          <div className="tasks-month-events">{dayEvents.slice(0, 3).map((event) => <EventChip key={event.id} event={event} onEdit={() => onEdit(event)} />)}{dayEvents.length > 3 && <button className="tasks-more-events" type="button" onClick={() => onSelect(date)}>Ещё {dayEvents.length - 3}</button>}</div>
        </div>;
      })}
    </div>
    <div className="tasks-calendar-legend">{categories.map((category) => <span key={category.value}><i style={{ backgroundColor: category.color }} />{category.label}</span>)}</div>
  </div>;
}

function EventChip({ event, onEdit }: { event: TaskCalendarEvent; onEdit: () => void }) {
  const timeText = event.allDay ? "Весь день" : moscowTime(event.startsAt) + (event.endsAt ? `–${moscowTime(event.endsAt)}` : "");
  const className = `tasks-event-chip category-${event.category.toLowerCase()}${event.state === "COMPLETED" ? " is-completed" : ""}`;
  if (event.sourceType === "PERSONAL_TASK") return <button type="button" className={className} title={`${timeText} · ${event.title}`} onClick={onEdit}><span>{timeText}</span><strong>{event.title}</strong></button>;
  const content = <><span>{timeText}</span><strong>{event.title}</strong></>;
  return event.href ? <a className={className} title={`${timeText} · ${event.title}`} href={event.href}>{content}</a> : <span className={className} title={`${timeText} · ${event.title}`}>{content}</span>;
}

function TimeView({ dates, events, mode, selectedDate, today, onSelect, onNew, onEdit }: { dates: string[]; events: TaskCalendarEvent[]; mode: "week" | "day"; selectedDate: string; today: string; onSelect: (date: string) => void; onNew: (date: string, time?: string) => void; onEdit: (event: TaskCalendarEvent) => void }) {
  const hours = Array.from({ length: 24 }, (_, index) => index);
  return <div className={`tasks-time-view ${mode === "day" ? "is-day" : "is-week"}`}>
    <div className="tasks-time-scroll"><div className="tasks-time-grid" style={{ "--task-day-count": dates.length } as CSSProperties}>
      <div className="tasks-time-gutter"><div className="tasks-time-gutter-head" />{hours.map((hour) => <span key={hour} style={{ top: `${88 + hour * 48}px` }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
      {dates.map((date) => {
        const dayEvents = events.filter((event) => moscowDateKey(event.startsAt) === date);
        const allDayEvents = dayEvents.filter((event) => event.allDay);
        const timedEvents = layoutTimedEvents(dayEvents, 0, 24, 48);
        return <section className={`tasks-time-day${date === selectedDate ? " is-selected" : ""}${date === today ? " is-today" : ""}`} key={date}>
          <header className="tasks-time-day-head"><button type="button" onClick={() => onSelect(date)}><small>{dateLabel(date, { weekday: "short" })}</small><strong>{Number(date.slice(-2))}</strong></button></header>
          <div className="tasks-all-day-lane">{allDayEvents.slice(0, 2).map((event) => <EventChip key={event.id} event={event} onEdit={() => onEdit(event)} />)}{allDayEvents.length > 2 && <span>+{allDayEvents.length - 2}</span>}</div>
          <div className="tasks-time-track">
            {Array.from({ length: 48 }, (_, index) => {
              const hour = Math.floor(index / 2); const minute = index % 2 ? 30 : 0; const clock = `${String(hour).padStart(2, "0")}:${minute ? "30" : "00"}`;
              return <button key={clock} type="button" className="tasks-time-slot" style={{ top: `${index * 24}px` }} aria-label={`Создать событие ${dateLabel(date)} в ${clock}`} onClick={() => onNew(date, clock)} />;
            })}
            {hours.map((hour) => <span key={hour} className="tasks-hour-line" style={{ top: `${hour * 48}px` }} />)}
            {timedEvents.map(({ event, topPx, heightPx, leftPercent, widthPercent }) => <div key={event.id} className={`tasks-timed-event category-${event.category.toLowerCase()}${event.state === "COMPLETED" ? " is-completed" : ""}`} style={{ top: topPx, height: heightPx, left: `${leftPercent}%`, width: `calc(${widthPercent}% - 3px)`, "--task-category-color": categoryColor(event.category) } as CSSProperties}><EventChip event={event} onEdit={() => onEdit(event)} /></div>)}
          </div>
        </section>;
      })}
    </div></div>
    {events.length === 0 && <div className="tasks-time-empty">В этом периоде событий нет. Нажмите на свободное время, чтобы добавить событие.</div>}
    <div className="tasks-calendar-legend">{categories.map((category) => <span key={category.value}><i style={{ backgroundColor: category.color }} />{category.label}</span>)}</div>
  </div>;
}

function ListView({ groups, tasksWithoutDate, onEdit, onNew, onRefresh, busy, startTransition }: { groups: Array<{ date: string; events: TaskCalendarEvent[] }>; tasksWithoutDate: UndatedTask[]; onEdit: (event: TaskCalendarEvent) => void; onNew: (date: string, time?: string) => void; onRefresh: () => void; busy: boolean; startTransition: (callback: () => void) => void }) {
  return <div className="tasks-list-view">
    {groups.length ? groups.map((group) => <section className="tasks-list-date" key={group.date}><header><h3>{dateLabel(group.date)}</h3><button type="button" onClick={() => onNew(group.date)}>＋</button></header><div>{group.events.map((event) => <EventCard key={event.id} event={event} onEdit={() => onEdit(event)} onRefresh={onRefresh} busy={busy} startTransition={startTransition} />)}</div></section>) : <div className="tasks-empty"><h3>Событий пока нет</h3><p>Добавьте личное, рабочее или учебное событие.</p><button type="button" onClick={() => onNew(moscowDateKey(new Date()))}>Новое событие</button></div>}
    {tasksWithoutDate.length > 0 && <section className="tasks-list-date"><header><h3>Без даты</h3></header>{tasksWithoutDate.map((task) => <div className="tasks-event tasks-personal" key={task.id}><div><strong>{task.title}</strong><small>{categoryLabel(task.category)} · {priorityLabels[task.priority]}</small></div><button type="button" onClick={() => onEdit({ ...task, sourceId: task.id, sourceType: "PERSONAL_TASK", startsAt: new Date(), endsAt: null, allDay: true, description: task.details, href: null, reminderAt: task.reminderAt ? new Date(task.reminderAt) : null, sourceLabel: "Личная задача" })}>Изменить</button></div>)}</section>}
  </div>;
}

function EventCard({ event, onEdit, onRefresh, busy, startTransition }: { event: TaskCalendarEvent; onEdit: () => void; onRefresh: () => void; busy: boolean; startTransition: (callback: () => void) => void }) {
  const [error, setError] = useState<string | null>(null);
  const personal = event.sourceType === "PERSONAL_TASK";
  const timeText = event.allDay ? "Весь день" : moscowTime(event.startsAt) + (event.endsAt ? `–${moscowTime(event.endsAt)}` : "");
  const form = () => { const data = new FormData(); data.set("taskId", event.sourceId); data.set("version", String(event.version ?? 1)); return data; };
  const update = (action: (data: FormData) => Promise<{ ok: boolean; error: string | null }>, data: FormData) => startTransition(() => { void action(data).then((result) => { setError(result.error); if (result.ok) onRefresh(); }); });
  return <article className={`tasks-event-card category-${event.category.toLowerCase()}${event.state === "COMPLETED" ? " is-completed" : ""}`} style={{ "--task-category-color": categoryColor(event.category) } as CSSProperties}>
    <span className="tasks-event-card-time">{timeText}</span><div className="tasks-event-card-content"><div className="tasks-event-title-row"><strong>{event.title}</strong>{personal && event.priority && <span className={`tasks-priority priority-${event.priority.toLowerCase()}`}>{priorityLabels[event.priority]}</span>}</div>{event.description && <p>{event.description}</p>}<small>{categoryLabel(event.category)} · {event.sourceLabel}{event.reminderAt ? ` · Напоминание ${moscowTime(event.reminderAt)}` : ""}</small></div>
    {personal ? <div className="tasks-event-actions"><button type="button" disabled={busy} onClick={() => { const data = form(); data.set("completed", event.state !== "COMPLETED" ? "true" : "false"); update(setPersonalTaskCompletionAction, data); }}>{event.state === "COMPLETED" ? "Вернуть" : "Выполнить"}</button><button type="button" disabled={busy} onClick={onEdit}>Изменить</button><button type="button" className="is-danger" disabled={busy} onClick={() => { if (window.confirm("Удалить событие?")) update(deletePersonalTaskAction, form()); }}>Удалить</button></div> : event.href ? <a className="tasks-event-link" href={event.href}>Открыть раздел ↗</a> : <span className="tasks-readonly">Только просмотр</span>}
    {error && <p className="tasks-inline-error" role="alert">{error}</p>}
  </article>;
}

function TaskEditor({ item, defaultDate, defaultTime, defaultAllDay, notificationPreferenceEnabled, onClose, onSaved }: { item: TaskCalendarEvent | UndatedTask | null; defaultDate: string; defaultTime: string; defaultAllDay: boolean; notificationPreferenceEnabled: boolean; onClose: () => void; onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(savePersonalTaskAction, initialTaskActionState);
  const [allDay, setAllDay] = useState(() => item && "sourceType" in item ? item.allDay : defaultAllDay);
  const [category, setCategory] = useState<TaskCategoryValue>(() => item?.category ?? "PERSONAL");
  const [date, setDate] = useState(() => item && "sourceType" in item ? moscowDateKey(item.startsAt) : defaultDate);
  const [startTime, setStartTime] = useState(() => item && "sourceType" in item && !item.allDay ? moscowTime(item.startsAt) : defaultTime);
  const [endTime, setEndTime] = useState(() => item && "sourceType" in item && item.endsAt ? moscowTime(item.endsAt) : item && "sourceType" in item && !item.allDay ? "" : addClockMinutes(defaultTime, 60));
  const [reminder, setReminder] = useState(() => item?.reminderAt ? toMoscowDateTimeLocal(new Date(item.reminderAt)) : "");
  const [priority, setPriority] = useState(() => item?.priority ?? "MEDIUM");
  const onSave = useCallback(() => onSaved(), [onSaved]);
  useEffect(() => { if (state.successId) onSave(); }, [state.successId, onSave]);
  const taskId = item && "sourceId" in item ? item.sourceId : item?.id ?? "";
  const version = item && "version" in item ? item.version : 1;
  const title = item?.title ?? "";
  const details = item && "description" in item ? item.description ?? "" : item?.details ?? "";
  return <div className="tasks-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="tasks-editor" role="dialog" aria-modal="true" aria-labelledby="task-editor-title"><div className="tasks-editor-head"><div><span className="profile-heading-kicker">ЛИЧНЫЙ ПЛАН</span><h2 id="task-editor-title">{item ? "Изменить событие" : "Новое событие"}</h2></div><button type="button" aria-label="Закрыть" onClick={onClose}>×</button></div><form action={formAction}>
    <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="version" value={String(version)} />
    <label>Название<input name="title" required maxLength={240} defaultValue={title} autoFocus /></label>
    <label>Категория<select name="category" value={category} onChange={(event) => setCategory(event.target.value as TaskCategoryValue)}><option value="STUDY">Учёба</option><option value="WORK">Работа</option><option value="PERSONAL">Личное</option></select></label>
    <label className="tasks-all-day-toggle"><input type="checkbox" name="allDay" value="true" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />Весь день</label>
    <label>Дата<input type="date" name="dueDate" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
    {!allDay && <div className="tasks-form-row"><label>Начало<input type="time" name="startTime" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label><label>Окончание<input type="time" name="endTime" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label></div>}
    {allDay && <><input type="hidden" name="startTime" value="" /><input type="hidden" name="endTime" value="" /></>}
    <label>Описание <span>(необязательно)</span><textarea name="details" maxLength={5000} rows={3} defaultValue={details} /></label>
    <label>Приоритет<select name="priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="HIGH">Высокий</option><option value="MEDIUM">Средний</option><option value="LOW">Низкий</option></select></label>
    <label>Напоминание<input type="datetime-local" name="remindAt" value={reminder} onChange={(event) => setReminder(event.target.value)} disabled={!notificationPreferenceEnabled} />{!notificationPreferenceEnabled && <small>В настройках отключена категория уведомлений «Задачи».</small>}</label>
    <p className="tasks-reminder-note">Напоминание сохраняется в существующей очереди. Автоматическая отправка пока не подключена.</p>
    {state.error && <p className="tasks-inline-error" role="alert">{state.error}</p>}
    <div className="tasks-editor-actions"><button type="button" className="tasks-secondary-button" onClick={onClose}>Отмена</button><button type="submit" className="tasks-primary-button" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить событие"}</button></div>
  </form></section></div>;
}
