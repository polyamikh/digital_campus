import "server-only";

import { prisma } from "@/lib/prisma";
import type { Role as RoleType } from "@/generated/prisma/enums";
import { verifyPassword } from "./password";

export type AuthenticatedAccount = {
  id: string;
  login: string;
  roles: RoleType[];
};

/** Returns the same null result for unknown, inactive, unactivated, and invalid-password accounts. */
export async function authenticateCredentials(login: string, password: string): Promise<AuthenticatedAccount | null> {
  const user = await prisma.user.findUnique({
    where: { login: login.trim() },
    select: {
      id: true,
      login: true,
      passwordHash: true,
      isActive: true,
      activatedAt: true,
      roles: { where: { revokedAt: null }, select: { role: true, revokedAt: true } },
    },
  });

  if (!user || !user.isActive || !user.activatedAt || !user.passwordHash) return null;
  const validPassword = await verifyPassword(password, user.passwordHash);
  const roles = user.roles.filter((assignment) => assignment.revokedAt === null).map((assignment) => assignment.role);
  if (!validPassword || roles.length === 0) return null;

  return { id: user.id, login: user.login, roles };
}
