export const REQUEST_CATEGORY_LABELS = {
  STUDY_CERTIFICATE: "Справка об обучении",
  STUDY_PERIOD_CERTIFICATE: "Справка о периоде обучения",
  GRADE_TRANSCRIPT: "Выписка с оценками",
  ACADEMIC_QUESTION: "Обращение по учебному вопросу",
  PERSONAL_DATA_CORRECTION: "Исправление персональных данных",
  OTHER: "Другое",
} as const;

export const REQUEST_STATE_LABELS = {
  SUBMITTED: "Отправлена",
  IN_REVIEW: "На рассмотрении",
  CLARIFICATION_REQUESTED: "Нужно уточнение",
  READY_FOR_ISSUE: "Готова к выдаче",
  COMPLETED: "Выполнена",
  REJECTED: "Отклонена",
  CANCELLED: "Отменена",
} as const;

export type RequestCategoryValue = keyof typeof REQUEST_CATEGORY_LABELS;
export type RequestStateValue = keyof typeof REQUEST_STATE_LABELS;

export type StudentRequestView = {
  id: string;
  category: RequestCategoryValue;
  state: RequestStateValue;
  title: string;
  submittedAt: string;
  deadlineAt: string | null;
  completedAt: string | null;
};

export type RequestFilters = {
  category: RequestCategoryValue | "ALL";
  state: RequestStateValue | "ALL";
};

export function requestSummary(requests: readonly StudentRequestView[]) {
  return {
    active: requests.filter((request) => !["COMPLETED", "REJECTED", "CANCELLED"].includes(request.state)).length,
    completed: requests.filter((request) => request.state === "COMPLETED").length,
    rejected: requests.filter((request) => request.state === "REJECTED").length,
  };
}

export function filterStudentRequests(requests: readonly StudentRequestView[], filters: RequestFilters): StudentRequestView[] {
  return requests.filter((request) =>
    (filters.category === "ALL" || request.category === filters.category)
    && (filters.state === "ALL" || request.state === filters.state));
}

export function requestCategoryLabel(category: RequestCategoryValue): string {
  return REQUEST_CATEGORY_LABELS[category];
}

export function requestCategoryRequiresDetails(category: RequestCategoryValue): boolean {
  return category === "OTHER";
}

export function requestStateLabel(state: RequestStateValue): string {
  return REQUEST_STATE_LABELS[state];
}
