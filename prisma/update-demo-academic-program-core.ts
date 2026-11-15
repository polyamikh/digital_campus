import {
  DEMO_ACADEMIC_PROGRAM,
  LEGACY_DEMO_INSTITUTE_NAME,
  type ExistingDemoProgram,
} from "./demo-profile-fill-core";

export type InstituteCorrection = "update" | "already-correct";

export function planDemoInstituteCorrection(
  target: ExistingDemoProgram | null,
  possibleConflicts: ExistingDemoProgram[],
): InstituteCorrection {
  if (!target || target.id !== DEMO_ACADEMIC_PROGRAM.id || target.code !== DEMO_ACADEMIC_PROGRAM.code) {
    throw new Error("The expected demo academic program was not found; no data was changed.");
  }
  if (possibleConflicts.some((program) => program.id !== target.id)) {
    throw new Error("Another academic program conflicts with the target demo program; no data was changed.");
  }

  const expectedRest = { ...DEMO_ACADEMIC_PROGRAM, instituteName: target.instituteName };
  if (Object.entries(expectedRest).some(([key, value]) => target[key as keyof ExistingDemoProgram] !== value)) {
    throw new Error("The target program has unexpected values; no data was changed.");
  }
  if (target.instituteName === DEMO_ACADEMIC_PROGRAM.instituteName) return "already-correct";
  if (target.instituteName !== LEGACY_DEMO_INSTITUTE_NAME) {
    throw new Error("The institute value is neither the approved old nor new value; no data was changed.");
  }
  return "update";
}
