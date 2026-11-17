import { Prisma } from "@/generated/prisma/client";

export type StudentGradeState =
  | "NO_PUBLISHED_STRUCTURE"
  | "NO_GRADES"
  | "AWAITING_PUBLICATION"
  | "PARTIAL"
  | "COMPLETE";

export type PublishedGradeValue = {
  score: string;
  publishedAt: Date;
  retakeId: string | null;
  retakeAttemptNo: number | null;
};

export type GradeWorkInput = {
  id: string;
  title: string;
  componentId: string;
  currentPublishedGrade: PublishedGradeValue | null;
};

export type GradeComponentInput = {
  id: string;
  name: string;
  maximumPoints: string;
  position: number;
};

export type GradeStructureInput = {
  id: string;
  version: number;
  publishedAt: Date;
  components: GradeComponentInput[];
  works: GradeWorkInput[];
  worksWithoutPublishedResult: number;
};

export type StudentGradeWork = {
  id: string;
  title: string;
  score: string | null;
  publishedAt: Date | null;
  isRetake: boolean;
  retakeAttemptNo: number | null;
};

export type StudentGradeComponent = {
  id: string;
  name: string;
  maximumPoints: string;
  publishedWorkCount: number;
  averageScore: string | null;
  earnedPoints: string;
  availablePoints: string;
  works: StudentGradeWork[];
};

export type StudentGradeStructure = {
  id: string;
  version: number;
  publishedAt: Date;
  state: StudentGradeState;
  components: StudentGradeComponent[];
  accumulatedPoints: string;
  availableMaximum: string;
  preliminaryPercent: string | null;
  worksWithoutPublishedResult: number;
};

export function currentStudentGradeState(structures: readonly StudentGradeStructure[]): StudentGradeState {
  return structures.at(-1)?.state ?? "NO_PUBLISHED_STRUCTURE";
}

export type StudentGradeQueryScope = {
  assessmentWhere: { groupId: string; courseId: { in: string[] } };
  gradeEntryWhere: { studentId: string; assessmentId: { in: string[] } };
};

/** Query constraints always come from the authenticated user's active membership. */
export function studentGradeQueryScope(studentId: string, groupId: string, courseIds: string[], assessmentIds: string[]): StudentGradeQueryScope {
  return {
    assessmentWhere: { groupId, courseId: { in: courseIds } },
    gradeEntryWhere: { studentId, assessmentId: { in: assessmentIds } },
  };
}

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function calculateStudentGradeStructure(input: GradeStructureInput): StudentGradeStructure {
  const orderedComponents = [...input.components].sort((left, right) => left.position - right.position);
  let accumulated = decimal("0");
  let available = decimal("0");
  let publishedWorkCount = 0;

  const components = orderedComponents.map((component): StudentGradeComponent => {
    const works = input.works.filter((work) => work.componentId === component.id);
    const gradedWorks = works.filter((work) => work.currentPublishedGrade !== null);
    const maximum = decimal(component.maximumPoints);
    const scores = gradedWorks.map((work) => decimal(work.currentPublishedGrade?.score ?? "0"));
    const average = scores.length
      ? scores.reduce((sum, score) => sum.plus(score), decimal("0")).div(scores.length)
      : null;
    const earned = average ? average.div(100).mul(maximum) : decimal("0");

    if (average) {
      accumulated = accumulated.plus(earned);
      available = available.plus(maximum);
      publishedWorkCount += scores.length;
    }

    return {
      id: component.id,
      name: component.name,
      maximumPoints: maximum.toString(),
      publishedWorkCount: gradedWorks.length,
      averageScore: average?.toString() ?? null,
      earnedPoints: earned.toString(),
      availablePoints: average ? maximum.toString() : "0",
      works: works.map((work): StudentGradeWork => {
        const grade = work.currentPublishedGrade;
        return {
          id: work.id,
          title: work.title,
          score: grade?.score ?? null,
          publishedAt: grade?.publishedAt ?? null,
          isRetake: grade?.retakeId !== null && grade?.retakeId !== undefined,
          retakeAttemptNo: grade?.retakeAttemptNo ?? null,
        };
      }),
    };
  });

  const hasWorksAwaitingPublication = input.worksWithoutPublishedResult > 0;
  const state: StudentGradeState = publishedWorkCount === 0
    ? hasWorksAwaitingPublication ? "AWAITING_PUBLICATION" : "NO_GRADES"
    : hasWorksAwaitingPublication ? "PARTIAL" : "COMPLETE";

  return {
    id: input.id,
    version: input.version,
    publishedAt: input.publishedAt,
    state,
    components,
    accumulatedPoints: accumulated.toString(),
    availableMaximum: available.toString(),
    preliminaryPercent: available.isZero() ? null : accumulated.div(available).mul(100).toString(),
    worksWithoutPublishedResult: input.worksWithoutPublishedResult,
  };
}
