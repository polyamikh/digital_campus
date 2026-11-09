import { Role, type Role as RoleType } from "@/generated/prisma/enums";

export function homePathForRole(role: RoleType): string {
  switch (role) {
    case Role.STUDENT:
      return "/";
    case Role.TEACHER:
      return "/teacher";
    case Role.DEAN:
      return "/dean";
  }
}
