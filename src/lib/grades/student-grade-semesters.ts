import {
  ACADEMIC_YEAR_2026_2027,
  getDefaultAcademicSemester,
  type AcademicSemester,
} from "@/lib/academic-calendar/academic-year-2026-2027";

export type StudentSemesterOption = {
  semesterNumber: number;
  label: string;
  season: AcademicSemester;
};

export type StudentCourseGroupSemester = {
  courseId: string;
  academicYear: string | null;
  semesterNumber: number | null;
};

export function semestersForAdmissionYear(admissionYear: number | null): StudentSemesterOption[] {
  if (admissionYear === 2026) {
    return [
      { semesterNumber: 1, label: `1-й семестр ${ACADEMIC_YEAR_2026_2027}`, season: "AUTUMN" },
      { semesterNumber: 2, label: `2-й семестр ${ACADEMIC_YEAR_2026_2027}`, season: "SPRING" },
    ];
  }
  if (admissionYear === 2025) {
    return [
      { semesterNumber: 3, label: `3-й семестр ${ACADEMIC_YEAR_2026_2027}`, season: "AUTUMN" },
      { semesterNumber: 4, label: `4-й семестр ${ACADEMIC_YEAR_2026_2027}`, season: "SPRING" },
    ];
  }
  return [];
}

export function resolveStudentSemester(
  options: readonly StudentSemesterOption[],
  requestedSemester: number | null,
  now: Date,
): StudentSemesterOption | null {
  const requested = options.find((option) => option.semesterNumber === requestedSemester);
  if (requested) return requested;
  const defaultSeason = getDefaultAcademicSemester(now);
  return options.find((option) => option.season === defaultSeason) ?? null;
}

/** Keeps a semester's course IDs scoped to the server-selected group and year. */
export function courseIdsForSemester(
  rows: readonly StudentCourseGroupSemester[],
  academicYear: string,
  semesterNumber: number,
): string[] {
  return [...new Set(rows
    .filter((row) => row.academicYear === academicYear && row.semesterNumber === semesterNumber)
    .map((row) => row.courseId))];
}
