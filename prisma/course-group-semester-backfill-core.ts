import { DEMO_OFFERING_SCHEDULE, stableDemoSeedId } from "./demo-schedule-layout";
import { DEMO_SPRING_OFFERINGS } from "./demo-spring-semester-plan";

export const COURSE_GROUP_SEMESTER_ACADEMIC_YEAR = "2026/2027";
export const DEMO_COURSE_GROUP_COUNT = DEMO_OFFERING_SCHEDULE.length + DEMO_SPRING_OFFERINGS.length;

export type CourseGroupSemesterAssignment = {
  id: string;
  courseId: string;
  groupId: string;
  groupCode: string;
  academicYear: string;
  semesterNumber: number;
  season: "autumn" | "spring";
};

export type ExistingCourseGroupSemester = Pick<CourseGroupSemesterAssignment,
  "id" | "courseId" | "groupId"> & {
    academicYear: string | null;
    semesterNumber: number | null;
  };

export type CourseGroupSemesterPlan = {
  updates: CourseGroupSemesterAssignment[];
  alreadyCorrect: CourseGroupSemesterAssignment[];
  conflicts: Array<{ expected: CourseGroupSemesterAssignment; actual: ExistingCourseGroupSemester }>;
  unknown: ExistingCourseGroupSemester[];
  missing: CourseGroupSemesterAssignment[];
  canApply: boolean;
};

const groupSemester: Record<string, { autumn: number; spring: number }> = {
  "ЦМ-26-1": { autumn: 1, spring: 2 },
  "ЦМ-26-2": { autumn: 1, spring: 2 },
  "ЦМ-25-2": { autumn: 3, spring: 4 },
};

export const DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS: readonly CourseGroupSemesterAssignment[] = [
  ...DEMO_OFFERING_SCHEDULE.map((offering) => ({
    id: stableDemoSeedId(`course-group:${offering.courseKey}:${offering.groupCode}`),
    courseId: stableDemoSeedId(`course:${offering.courseKey}`),
    groupId: stableDemoSeedId(`group:${offering.groupCode}`),
    groupCode: offering.groupCode,
    academicYear: COURSE_GROUP_SEMESTER_ACADEMIC_YEAR,
    semesterNumber: groupSemester[offering.groupCode]!.autumn,
    season: "autumn" as const,
  })),
  ...DEMO_SPRING_OFFERINGS.map((offering) => ({
    id: stableDemoSeedId(`course-group:spring:${offering.courseKey}:${offering.groupCode}`),
    courseId: stableDemoSeedId(`course:spring:${offering.courseKey}`),
    groupId: stableDemoSeedId(`group:${offering.groupCode}`),
    groupCode: offering.groupCode,
    academicYear: COURSE_GROUP_SEMESTER_ACADEMIC_YEAR,
    semesterNumber: groupSemester[offering.groupCode]!.spring,
    season: "spring" as const,
  })),
];

export function planCourseGroupSemesterBackfill(
  existingRows: readonly ExistingCourseGroupSemester[],
  assignments: readonly CourseGroupSemesterAssignment[] = DEMO_COURSE_GROUP_SEMESTER_ASSIGNMENTS,
): CourseGroupSemesterPlan {
  const expectedById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const rowsById = new Map<string, ExistingCourseGroupSemester[]>();
  for (const row of existingRows) rowsById.set(row.id, [...(rowsById.get(row.id) ?? []), row]);

  const updates: CourseGroupSemesterAssignment[] = [];
  const alreadyCorrect: CourseGroupSemesterAssignment[] = [];
  const conflicts: CourseGroupSemesterPlan["conflicts"] = [];
  const missing: CourseGroupSemesterAssignment[] = [];

  for (const expected of assignments) {
    const rows = rowsById.get(expected.id) ?? [];
    if (rows.length === 0) {
      missing.push(expected);
      continue;
    }
    if (rows.length !== 1) {
      conflicts.push({ expected, actual: rows[0]! });
      continue;
    }
    const actual = rows[0]!;
    const relationshipMatches = actual.courseId === expected.courseId && actual.groupId === expected.groupId;
    if (!relationshipMatches || (actual.academicYear === expected.academicYear && actual.semesterNumber === expected.semesterNumber)) {
      if (!relationshipMatches) conflicts.push({ expected, actual });
      else alreadyCorrect.push(expected);
      continue;
    }
    if (actual.academicYear === null && actual.semesterNumber === null) updates.push(expected);
    else conflicts.push({ expected, actual });
  }

  const unknown = existingRows.filter((row) => !expectedById.has(row.id));
  return {
    updates,
    alreadyCorrect,
    conflicts,
    unknown,
    missing,
    canApply: conflicts.length === 0 && unknown.length === 0 && missing.length === 0 && existingRows.length === assignments.length,
  };
}
