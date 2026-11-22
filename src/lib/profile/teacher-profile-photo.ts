import "server-only";

import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";
import { getProfilePhotoMetadata } from "./profile-photo-store";

export async function getCurrentTeacherPhotoVersion() {
  const teacher = await requireRole(Role.TEACHER);
  return (await getProfilePhotoMetadata(teacher.id))?.version ?? null;
}
