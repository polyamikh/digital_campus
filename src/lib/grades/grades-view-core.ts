import type { StudentGradeState, StudentGradeStructure } from "./student-grades-core";

export type GradeCourseForView = {
  id: string;
  name: string;
  structures: StudentGradeStructure[];
  currentStructureVersion: number | null;
  state: StudentGradeState;
  finalGradeClosure: { closedAt: Date; version: number } | null;
  confirmedAcademicDebts: Array<{ id: string; confirmedAt: Date; resolvedAt: Date | null; reason: string | null }>;
};

export function selectedGradeCourse(courses: readonly GradeCourseForView[], selectedId: string | null): GradeCourseForView | null {
  return courses.find((course) => course.id === selectedId) ?? courses[0] ?? null;
}

export function formatGradePoints(value: string): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value));
}

export function formatGradePercent(value: string | null): string | null {
  if (value === null) return null;
  return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}%`;
}

export function gradeStateLabel(state: StudentGradeState): string {
  switch (state) {
    case "NO_PUBLISHED_STRUCTURE": return "Нет опубликованной структуры";
    case "NO_GRADES": return "Нет опубликованных оценок";
    case "AWAITING_PUBLICATION": return "Ожидается публикация оценок";
    case "PARTIAL": return "Опубликованы не все результаты";
    case "COMPLETE": return "Результаты опубликованы";
  }
}
