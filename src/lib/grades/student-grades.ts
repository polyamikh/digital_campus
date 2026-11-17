import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";
import { prisma } from "@/lib/prisma";
import {
  calculateStudentGradeStructure,
  currentStudentGradeState,
  studentGradeQueryScope,
  type GradeStructureInput,
  type PublishedGradeValue,
  type StudentGradeStructure,
  type StudentGradeState,
} from "./student-grades-core";
import {
  ACADEMIC_YEAR_2026_2027,
} from "@/lib/academic-calendar/academic-year-2026-2027";
import { courseIdsForSemester, resolveStudentSemester, semestersForAdmissionYear, type StudentSemesterOption } from "./student-grade-semesters";

export type StudentGrades = {
  groupCode: string | null;
  membershipState: "READY" | "MISSING" | "AMBIGUOUS" | "ACADEMIC_PROFILE_MISSING" | "UNSUPPORTED_ADMISSION_YEAR";
  admissionYear: number | null;
  semesterOptions: StudentSemesterOption[];
  selectedSemester: StudentSemesterOption | null;
  courses: StudentCourseGrades[];
};

export type StudentCourseGrades = {
  id: string;
  name: string;
  structures: StudentGradeStructure[];
  currentStructureVersion: number | null;
  state: StudentGradeState;
  finalGradeClosure: { closedAt: Date; version: number } | null;
  confirmedAcademicDebts: Array<{ id: string; confirmedAt: Date; resolvedAt: Date | null; reason: string | null }>;
};

export async function getCurrentStudentGrades(requestedSemester: number | null = null, now = new Date()): Promise<StudentGrades> {
  const student = await requireRole(Role.STUDENT);
  const [memberships, academicProfile] = await Promise.all([
    prisma.groupMembership.findMany({
      where: activeMembershipWhere(student.id, now),
      select: { groupId: true, group: { select: { code: true } } },
      take: 2,
    }),
    prisma.studentAcademicProfile.findUnique({ where: { userId: student.id }, select: { admissionYear: true } }),
  ]);
  const admissionYear = academicProfile?.admissionYear ?? null;
  const semesterOptions = semestersForAdmissionYear(admissionYear);
  const selectedSemester = resolveStudentSemester(semesterOptions, requestedSemester, now);

  if (memberships.length !== 1) {
    return {
      groupCode: null,
      membershipState: memberships.length === 0 ? "MISSING" : "AMBIGUOUS",
      admissionYear,
      semesterOptions,
      selectedSemester,
      courses: [],
    };
  }

  if (admissionYear === null) {
    return { groupCode: memberships[0].group.code, membershipState: "ACADEMIC_PROFILE_MISSING", admissionYear, semesterOptions, selectedSemester, courses: [] };
  }
  if (semesterOptions.length === 0 || !selectedSemester) {
    return { groupCode: memberships[0].group.code, membershipState: "UNSUPPORTED_ADMISSION_YEAR", admissionYear, semesterOptions, selectedSemester, courses: [] };
  }

  const groupId = memberships[0].groupId;
  const courseGroupRows = await prisma.$queryRaw<Array<{ courseId: string; academicYear: string | null; semesterNumber: number | null }>>(Prisma.sql`
    SELECT "courseId", "academicYear", "semesterNumber"
    FROM "CourseGroup"
    WHERE "groupId" = ${groupId}::uuid AND "academicYear" = ${ACADEMIC_YEAR_2026_2027}
  `);
  const courseIds = courseIdsForSemester(courseGroupRows, ACADEMIC_YEAR_2026_2027, selectedSemester.semesterNumber);
  if (courseIds.length === 0) {
    return { groupCode: memberships[0].group.code, membershipState: "READY", admissionYear, semesterOptions, selectedSemester, courses: [] };
  }

  const [courseRows, structures, closures, debts] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, subject: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.assessmentStructureVersion.findMany({
      where: { courseId: { in: courseIds }, publishedAt: { not: null } },
      orderBy: [{ courseId: "asc" }, { version: "asc" }],
      select: {
        id: true,
        courseId: true,
        version: true,
        publishedAt: true,
        weights: {
          orderBy: { position: "asc" },
          select: { componentId: true, componentName: true, maximumPoints: true, position: true },
        },
      },
    }),
    prisma.finalGradeClosure.findMany({
      where: { studentId: student.id, courseId: { in: courseIds } },
      select: { courseId: true, closedAt: true, version: true },
    }),
    prisma.confirmedAcademicDebt.findMany({
      where: { studentId: student.id, courseId: { in: courseIds } },
      orderBy: { confirmedAt: "desc" },
      select: { id: true, courseId: true, confirmedAt: true, resolvedAt: true, reason: true },
    }),
  ]);

  const structureIds = structures.map((structure) => structure.id);
  const baseScope = studentGradeQueryScope(student.id, groupId, courseIds, []);
  const courseAssessments = structureIds.length === 0 ? [] : await prisma.assessment.findMany({
    where: {
      ...baseScope.assessmentWhere,
      structureVersionId: { in: structureIds },
      state: "PUBLISHED",
      publishedAt: { not: null },
    },
    orderBy: [{ courseId: "asc" }, { publishedAt: "asc" }],
    select: {
      id: true,
      courseId: true,
      groupId: true,
      structureVersionId: true,
      componentId: true,
      title: true,
      publishedAt: true,
    },
  });
  const scopedAssessmentIds = courseAssessments.map((assessment) => assessment.id);
  const scope = studentGradeQueryScope(student.id, groupId, courseIds, scopedAssessmentIds);
  // The relation filter ensures that only the current, published revision is fetched.
  const publishedGradeEntries = scopedAssessmentIds.length === 0 ? [] : await prisma.gradebookEntry.findMany({
    where: {
      ...scope.gradeEntryWhere,
      currentRevision: { is: { state: "PUBLISHED", publishedAt: { not: null } } },
    },
    select: {
      assessmentId: true,
      currentRevision: {
        select: { score: true, publishedAt: true, retakeId: true, retake: { select: { attemptNo: true } } },
      },
    },
  });

  const gradesByAssessment = new Map<string, PublishedGradeValue>();
  for (const entry of publishedGradeEntries) {
    const revision = entry.currentRevision;
    if (!revision?.publishedAt) continue;
    gradesByAssessment.set(entry.assessmentId, {
      score: revision.score.toString(),
      publishedAt: revision.publishedAt,
      retakeId: revision.retakeId,
      retakeAttemptNo: revision.retake?.attemptNo ?? null,
    });
  }

  const courseById = new Map(courseRows.map((course) => [course.id, course]));
  const structuresByCourse = new Map<string, StudentGradeStructure[]>();
  for (const structure of structures) {
    if (!structure.publishedAt) throw new Error("Published assessment structure is missing its publication timestamp.");
    const assessments = courseAssessments.filter((assessment) =>
      assessment.courseId === structure.courseId && assessment.structureVersionId === structure.id);
    const works: GradeStructureInput["works"] = assessments.map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      componentId: assessment.componentId,
      currentPublishedGrade: gradesByAssessment.get(assessment.id) ?? null,
    }));
    const worksWithoutPublishedResult = assessments.filter((assessment) => !gradesByAssessment.has(assessment.id)).length;
    const result = calculateStudentGradeStructure({
      id: structure.id,
      version: structure.version,
      publishedAt: structure.publishedAt,
      components: structure.weights.map((weight) => ({
        id: weight.componentId,
        name: weight.componentName,
        maximumPoints: weight.maximumPoints.toString(),
        position: weight.position,
      })),
      works,
      worksWithoutPublishedResult,
    });
    structuresByCourse.set(structure.courseId, [...(structuresByCourse.get(structure.courseId) ?? []), result]);
  }

  const closureByCourse = new Map(closures.map((closure) => [closure.courseId, closure]));
  const debtsByCourse = new Map<string, StudentCourseGrades["confirmedAcademicDebts"]>();
  for (const debt of debts) {
    debtsByCourse.set(debt.courseId, [...(debtsByCourse.get(debt.courseId) ?? []), {
      id: debt.id,
      confirmedAt: debt.confirmedAt,
      resolvedAt: debt.resolvedAt,
      reason: debt.reason,
    }]);
  }

  const courses = courseIds.flatMap((courseId): StudentCourseGrades[] => {
    const course = courseById.get(courseId);
    if (!course) return [];
    const courseStructures = structuresByCourse.get(courseId) ?? [];
    const currentStructure = courseStructures.at(-1) ?? null;
    return [{
      id: course.id,
      name: course.subject.name,
      structures: courseStructures,
      currentStructureVersion: currentStructure?.version ?? null,
      state: currentStudentGradeState(courseStructures),
      finalGradeClosure: closureByCourse.get(courseId) ?? null,
      confirmedAcademicDebts: debtsByCourse.get(courseId) ?? [],
    }];
  });

  return { groupCode: memberships[0].group.code, membershipState: "READY", admissionYear, semesterOptions, selectedSemester, courses };
}

export function formatGradeValue(value: string | null): string | null {
  if (value === null) return null;
  return new Prisma.Decimal(value).toFixed(2);
}
