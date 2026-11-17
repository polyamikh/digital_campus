import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import AuthRouteFallback from "@/app/auth-route-fallback";
import StudentAppShell from "@/app/student-app-shell";
import { ForbiddenRoleError, UnauthenticatedError, currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { getCurrentStudentGrades } from "@/lib/grades/student-grades";
import GradesContent from "./grades-content";

type GradesSearchParams = Promise<{ semester?: string | string[] }>;

export default function StudentGradesPage({ searchParams }: { searchParams: GradesSearchParams }) {
  return (
    <Suspense fallback={<AuthRouteFallback message="Загружаем успеваемость…" />}>
      <AuthenticatedStudentGrades searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthenticatedStudentGrades({ searchParams }: { searchParams: GradesSearchParams }) {
  const query = await searchParams;
  const requestedSemester = typeof query.semester === "string" && /^[1-4]$/.test(query.semester)
    ? Number(query.semester)
    : null;
  const identity = await currentUser();
  if (!identity) redirect("/login");
  if (identity.activeRole !== Role.STUDENT) redirect(homePathForRole(identity.activeRole as RoleType));

  let loaded: Awaited<ReturnType<typeof loadGradesPageData>> | null = null;
  try {
    loaded = await loadGradesPageData(identity.id, identity.login, requestedSemester);
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenRoleError) redirect(homePathForRole(identity.activeRole));
  }

  if (!loaded) {
    return (
      <StudentAppShell displayName={identity.login} groupCode={null} activeSection="grades">
        <GradesPageHeading />
        <section className="grades-empty grades-error" role="alert">
          <span className="grades-empty-mark" aria-hidden="true">!</span>
          <h2>Не удалось загрузить успеваемость</h2>
          <p>Попробуйте открыть раздел позже. Ваши данные не изменены.</p>
        </section>
      </StudentAppShell>
    );
  }

  const { grades, displayName, photoVersion } = loaded;
  return (
    <StudentAppShell displayName={displayName} groupCode={grades.groupCode} photoVersion={photoVersion} activeSection="grades">
      <GradesPageHeading />
      {grades.membershipState !== "READY" ? (
        <section className="grades-empty" role="status">
          <span className="grades-empty-mark" aria-hidden="true">▥</span>
          <h2>{membershipErrorTitle(grades.membershipState)}</h2>
          <p>{membershipErrorDescription(grades.membershipState)}</p>
        </section>
      ) : (
        <>
          {grades.selectedSemester ? <SemesterSwitcher options={grades.semesterOptions} selectedSemesterNumber={grades.selectedSemester.semesterNumber} /> : null}
          <GradesContent key={grades.selectedSemester?.semesterNumber ?? "none"} courses={grades.courses} />
        </>
      )}
    </StudentAppShell>
  );
}

async function loadGradesPageData(userId: string, login: string, requestedSemester: number | null) {
    const [grades, profile, photo] = await Promise.all([
      getCurrentStudentGrades(requestedSemester),
      prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } }),
      getProfilePhotoMetadata(userId),
    ]);
  return {
    grades,
    displayName: profile?.displayName || login,
    photoVersion: photo?.version ?? null,
  };
}

function membershipErrorTitle(state: string): string {
  if (state === "MISSING") return "Учебная группа не найдена";
  if (state === "AMBIGUOUS") return "Не удалось определить группу";
  if (state === "ACADEMIC_PROFILE_MISSING") return "Не указан год поступления";
  return "Семестры для учебного плана не настроены";
}

function membershipErrorDescription(state: string): string {
  if (state === "MISSING") return "Для аккаунта нет действующего членства в учебной группе.";
  if (state === "AMBIGUOUS") return "Для аккаунта найдено несколько действующих групп. Данные оценок скрыты до уточнения членства.";
  if (state === "ACADEMIC_PROFILE_MISSING") return "Для аккаунта не заполнен год поступления, необходимый для выбора семестров.";
  return "Для этого года поступления пока не настроены доступные семестры.";
}

function SemesterSwitcher({
  options,
  selectedSemesterNumber,
}: {
  options: Array<{ semesterNumber: number; label: string }>;
  selectedSemesterNumber: number;
}) {
  return (
    <nav className="grades-semester-switcher" aria-label="Выбор семестра">
      {options.map((option) => (
        <Link
          aria-current={option.semesterNumber === selectedSemesterNumber ? "page" : undefined}
          className={`grades-semester-option${option.semesterNumber === selectedSemesterNumber ? " is-selected" : ""}`}
          href={`/grades?semester=${option.semesterNumber}`}
          key={option.semesterNumber}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

function GradesPageHeading() {
  return (
    <section className="profile-page-heading grades-page-heading" aria-labelledby="grades-page-title">
      <span className="profile-heading-kicker">УЧЕБНЫЙ ПРОЦЕСС</span>
      <h1 id="grades-page-title">Успеваемость</h1>
      <p>Опубликованные результаты и их вклад в дисциплины.</p>
    </section>
  );
}
