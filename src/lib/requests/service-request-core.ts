import { getMoscowDayBounds, moscowDateKey } from "../schedule/moscow-time";

export const REQUEST_SLA_WORKING_DAYS = {
  STUDY_CERTIFICATE: 3,
  STUDY_PERIOD_CERTIFICATE: 3,
  GRADE_TRANSCRIPT: 3,
  ACADEMIC_QUESTION: 5,
  PERSONAL_DATA_CORRECTION: 5,
  OTHER: 5,
} as const;

export type ServiceRequestCategory = keyof typeof REQUEST_SLA_WORKING_DAYS;

export type NewServiceRequestInput = {
  category: ServiceRequestCategory;
  title: string;
  body: string;
};

const STANDARD_REQUEST_CONTENT: Record<Exclude<ServiceRequestCategory, "OTHER">, { title: string; body: string }> = {
  STUDY_CERTIFICATE: { title: "Справка об обучении", body: "Запрос на получение справки об обучении." },
  STUDY_PERIOD_CERTIFICATE: { title: "Справка о периоде обучения", body: "Запрос на получение справки о периоде обучения." },
  GRADE_TRANSCRIPT: { title: "Выписка с оценками", body: "Запрос на получение выписки с оценками." },
  ACADEMIC_QUESTION: { title: "Обращение по учебному вопросу", body: "Обращение по учебному вопросу. Подробности можно уточнить при обработке заявки." },
  PERSONAL_DATA_CORRECTION: { title: "Исправление персональных данных", body: "Запрос на проверку и исправление персональных данных." },
};

export type OfficialCalendarDay = {
  date: string;
  kind: "WORKING" | "NON_WORKING";
};

export type OfficialCalendarYear = {
  id: string;
  year: number;
  sourceName: string;
  sourceUrl: string;
  verifiedAt: Date | null;
  days: readonly OfficialCalendarDay[];
};

export type ServiceRequestSla = {
  slaWorkingDays: number;
  deadlineAt: Date;
  calendarIds: string[];
};

export type ServiceRequestCreationPlan = {
  request: {
    studentId: string;
    kind: null;
    category: ServiceRequestCategory;
    state: "SUBMITTED";
    title: string;
    body: string;
    submittedAt: Date;
    slaWorkingDays: number;
    deadlineAt: Date;
    version: 1;
  };
  initialHistory: {
    actorId: string;
    fromState: null;
    toState: "SUBMITTED";
    createdAt: Date;
  };
  calendarIds: string[];
};

export class ServiceRequestInputError extends Error {}
export class OfficialCalendarUnavailableError extends Error {}

const REQUEST_STATE_TRANSITIONS: Record<string, readonly string[]> = {
  SUBMITTED: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["READY_FOR_ISSUE", "COMPLETED", "REJECTED"],
  READY_FOR_ISSUE: ["COMPLETED", "REJECTED"],
  CLARIFICATION_REQUESTED: [],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransitionServiceRequest(fromState: string, toState: string): boolean {
  return REQUEST_STATE_TRANSITIONS[fromState]?.includes(toState) ?? false;
}

const categories = new Set<string>(Object.keys(REQUEST_SLA_WORKING_DAYS));

export function parseNewServiceRequestInput(value: unknown): NewServiceRequestInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceRequestInputError("Передайте данные заявки в допустимом формате.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.category !== "string" || !categories.has(input.category)) {
    throw new ServiceRequestInputError("Выберите одну из доступных категорий заявки.");
  }
  const category = input.category as ServiceRequestCategory;
  if (category === "OTHER") {
    if (typeof input.title !== "string" || !input.title.trim()) {
      throw new ServiceRequestInputError("Укажите название обращения.");
    }
    if (input.title.trim().length > 240) {
      throw new ServiceRequestInputError("Название обращения не должно превышать 240 символов.");
    }
    if (typeof input.body !== "string" || !input.body.trim()) {
      throw new ServiceRequestInputError("Опишите суть обращения.");
    }
    return { category, title: input.title.trim(), body: input.body.trim() };
  }

  const content = STANDARD_REQUEST_CONTENT[category];
  return { category, ...content };
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function assertVerifiedCalendar(calendar: OfficialCalendarYear | undefined, year: number): asserts calendar is OfficialCalendarYear {
  if (!calendar || calendar.year !== year || !calendar.verifiedAt || !calendar.sourceName.trim() || !calendar.sourceUrl.trim()) {
    throw new OfficialCalendarUnavailableError(`Не найден проверенный официальный производственный календарь за ${year} год.`);
  }
  const expectedDays = isLeapYear(year) ? 366 : 365;
  if (calendar.days.length !== expectedDays) {
    throw new OfficialCalendarUnavailableError(`Производственный календарь за ${year} год заполнен не полностью.`);
  }
}

/** SLA starts on the next working date and expires at the Moscow day-end of the Nth working date. */
export function calculateServiceRequestSla(
  submittedAt: Date,
  category: ServiceRequestCategory,
  calendars: readonly OfficialCalendarYear[],
): ServiceRequestSla {
  if (!Number.isFinite(submittedAt.getTime())) throw new ServiceRequestInputError("Некорректное время создания заявки.");

  const slaWorkingDays = REQUEST_SLA_WORKING_DAYS[category];
  const calendarsByYear = new Map(calendars.map((calendar) => [calendar.year, calendar]));
  const verifiedYears = new Set<number>();
  const usedCalendarIds = new Set<string>();
  const dayByDate = new Map<string, OfficialCalendarDay>();
  let dateKey = moscowDateKey(submittedAt);
  let remaining = slaWorkingDays;
  let iterations = 0;

  while (remaining > 0) {
    dateKey = shiftDateKey(dateKey, 1);
    const year = Number(dateKey.slice(0, 4));
    const calendar = calendarsByYear.get(year);
    if (!verifiedYears.has(year)) {
      assertVerifiedCalendar(calendar, year);
      verifiedYears.add(year);
      usedCalendarIds.add(calendar.id);
      for (const day of calendar.days) {
        if (dayByDate.has(day.date)) {
          throw new OfficialCalendarUnavailableError(`Обнаружена повторная дата ${day.date} в производственном календаре.`);
        }
        dayByDate.set(day.date, day);
      }
    }

    const day = dayByDate.get(dateKey);
    if (!day) throw new OfficialCalendarUnavailableError(`В официальном календаре отсутствует дата ${dateKey}.`);
    if (day.kind === "WORKING") remaining -= 1;
    iterations += 1;
    if (iterations > 370) throw new OfficialCalendarUnavailableError("Не удалось определить срок по производственному календарю.");
  }

  const representativeDate = new Date(`${dateKey}T12:00:00.000Z`);
  const endOfMoscowDay = new Date(getMoscowDayBounds(representativeDate).end.getTime() - 1);
  return { slaWorkingDays, deadlineAt: endOfMoscowDay, calendarIds: [...usedCalendarIds] };
}

/**
 * Resume an SLA after clarification using full working-day units. Working days
 * elapsed before the clarification remain consumed; the paused period is skipped.
 * An already-expired deadline stays expired instead of being reset.
 */
export function calculateResumedServiceRequestDeadline(
  submittedAt: Date,
  pausedAt: Date,
  resumedAt: Date,
  category: ServiceRequestCategory,
  originalDeadlineAt: Date | null,
  calendars: readonly OfficialCalendarYear[],
  previousPauses: readonly { requestedAt: Date; answeredAt: Date }[] = [],
): Date | null {
  if (![submittedAt, pausedAt, resumedAt].every((date) => Number.isFinite(date.getTime()))) {
    throw new ServiceRequestInputError("Некорректное время паузы SLA.");
  }
  if (resumedAt < pausedAt) throw new ServiceRequestInputError("Ответ на уточнение не может предшествовать запросу.");
  if (!originalDeadlineAt || pausedAt >= originalDeadlineAt) return originalDeadlineAt;

  const calendarsByYear = new Map(calendars.map((calendar) => [calendar.year, calendar]));
  const verifiedYears = new Set<number>();
  const dayByDate = new Map<string, OfficialCalendarDay>();
  let iterations = 0;
  const readDay = (dateKey: string): OfficialCalendarDay => {
    const year = Number(dateKey.slice(0, 4));
    const calendar = calendarsByYear.get(year);
    if (!verifiedYears.has(year)) {
      assertVerifiedCalendar(calendar, year);
      verifiedYears.add(year);
      for (const day of calendar.days) {
        if (dayByDate.has(day.date)) throw new OfficialCalendarUnavailableError(`Обнаружена повторная дата ${day.date} в производственном календаре.`);
        dayByDate.set(day.date, day);
      }
    }
    const day = dayByDate.get(dateKey);
    if (!day) throw new OfficialCalendarUnavailableError(`В официальном календаре отсутствует дата ${dateKey}.`);
    return day;
  };

  const countWorkingDaysAfter = (start: Date, end: Date): number => {
    let cursor = moscowDateKey(start);
    const endKey = moscowDateKey(end);
    let count = 0;
    let attempts = 0;
    while (cursor < endKey) {
      cursor = shiftDateKey(cursor, 1);
      if (readDay(cursor).kind === "WORKING") count += 1;
      attempts += 1;
      if (attempts > 800) throw new OfficialCalendarUnavailableError("Не удалось восстановить оставшийся срок по официальному календарю.");
    }
    return count;
  };

  let elapsedWorkingDays = countWorkingDaysAfter(submittedAt, pausedAt);
  let previouslyPausedWorkingDays = 0;
  for (const interval of previousPauses) {
    if (!Number.isFinite(interval.requestedAt.getTime()) || !Number.isFinite(interval.answeredAt.getTime()) || interval.answeredAt < interval.requestedAt) {
      throw new ServiceRequestInputError("Некорректная история паузы SLA.");
    }
    previouslyPausedWorkingDays += countWorkingDaysAfter(interval.requestedAt, interval.answeredAt);
  }
  elapsedWorkingDays = Math.max(0, elapsedWorkingDays - previouslyPausedWorkingDays);
  const remaining = Math.max(0, REQUEST_SLA_WORKING_DAYS[category] - elapsedWorkingDays);
  if (remaining === 0) return originalDeadlineAt;

  let cursor = moscowDateKey(resumedAt);
  let left = remaining;
  while (left > 0) {
    cursor = shiftDateKey(cursor, 1);
    if (readDay(cursor).kind === "WORKING") left -= 1;
    iterations += 1;
    if (iterations > 1200) throw new OfficialCalendarUnavailableError("Не удалось восстановить оставшийся срок по официальному календарю.");
  }
  const dayEnd = getMoscowDayBounds(new Date(`${cursor}T12:00:00.000Z`)).end;
  return new Date(dayEnd.getTime() - 1);
}

export function serviceRequestOwnerScope(studentId: string) {
  return { studentId } as const;
}

export function buildServiceRequestCreationPlan(
  studentId: string,
  input: NewServiceRequestInput,
  submittedAt: Date,
  sla: ServiceRequestSla,
): ServiceRequestCreationPlan {
  return {
    request: {
      studentId,
      kind: null,
      category: input.category,
      state: "SUBMITTED",
      title: input.title,
      body: input.body,
      submittedAt,
      slaWorkingDays: sla.slaWorkingDays,
      deadlineAt: sla.deadlineAt,
      version: 1,
    },
    initialHistory: {
      actorId: studentId,
      fromState: null,
      toState: "SUBMITTED",
      createdAt: submittedAt,
    },
    calendarIds: [...sla.calendarIds],
  };
}
