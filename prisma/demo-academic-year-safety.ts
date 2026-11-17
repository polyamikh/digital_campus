export const ACADEMIC_YEAR_APPLY_CONFIRMATION = "I_CONFIRM_DEMO_ACADEMIC_YEAR_PLAN";

export type AcademicYearScriptMode = "dry-run" | "apply";

export function isAssignableTeacher(user: {
  isActive: boolean;
  roles: ReadonlyArray<{ role: string; revokedAt: Date | null }>;
} | null | undefined): boolean {
  return Boolean(user?.isActive && user.roles.some((assignment) => assignment.role === "TEACHER" && assignment.revokedAt === null));
}

export function resolveAcademicYearMode(args: readonly string[]): AcademicYearScriptMode {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return "dry-run";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  throw new Error("Укажите только --dry-run (по умолчанию) или --apply.");
}

export function assertAcademicYearApplyConfirmed(mode: AcademicYearScriptMode, environment: Readonly<Record<string, string | undefined>>): void {
  if (mode === "apply" && environment.DIGITAL_CAMPUS_ACADEMIC_YEAR_APPROVED !== ACADEMIC_YEAR_APPLY_CONFIRMATION) {
    throw new Error(`Для записи установите DIGITAL_CAMPUS_ACADEMIC_YEAR_APPROVED=${ACADEMIC_YEAR_APPLY_CONFIRMATION}.`);
  }
}
