import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  createSessionForStore,
  readSessionFromStore,
  revokeSessionInStore,
  UnauthenticatedError,
  ForbiddenRoleError,
  SESSION_TTL_MS,
  type SessionRecord,
  type SessionStore,
  type AuthUser,
  hashSessionToken,
} from "./session-core";

export { SESSION_TTL_MS, UnauthenticatedError, ForbiddenRoleError, hashSessionToken } from "./session-core";
export type { AuthUser } from "./session-core";
export const SESSION_COOKIE_NAME = "dc_session";

const databaseSessionStore: SessionStore = {
  async hasActiveRole(userId, role) {
    const assignment = await prisma.userRole.findFirst({
      where: { userId, role, revokedAt: null, user: { isActive: true, activatedAt: { not: null } } },
      select: { id: true },
    });
    return assignment !== null;
  },
  async create(data) {
    await prisma.session.create({ data });
  },
  async findByTokenHash(tokenHash) {
    return prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            login: true,
            isActive: true,
            activatedAt: true,
            roles: { where: { revokedAt: null }, select: { role: true, revokedAt: true } },
          },
        },
      },
    }) as Promise<SessionRecord | null>;
  },
  async revoke(tokenHash, revokedAt) {
    await prisma.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt } });
  },
};

export async function createSession(
  userId: string,
  activeRole: RoleType,
  store: SessionStore = databaseSessionStore,
  now?: Date,
): Promise<{ token: string; expiresAt: Date }> {
  await connection();
  return createSessionForStore(userId, activeRole, store, now ?? new Date());
}

export async function readSession(
  token: string | null | undefined,
  store: SessionStore = databaseSessionStore,
  now?: Date,
): Promise<AuthUser | null> {
  await connection();
  return readSessionFromStore(token, store, now ?? new Date());
}

export async function revokeSession(
  token: string | null | undefined,
  store: SessionStore = databaseSessionStore,
  now?: Date,
): Promise<void> {
  await connection();
  await revokeSessionInStore(token, store, now ?? new Date());
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function currentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE_NAME)?.value);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requireRole(...allowedRoles: RoleType[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!allowedRoles.includes(user.activeRole)) throw new ForbiddenRoleError();
  return user;
}

/** Revokes the current server-side session before expiring its browser cookie. */
export async function logout(): Promise<void> {
  const jar = await cookies();
  await revokeSession(jar.get(SESSION_COOKIE_NAME)?.value);
  await clearSessionCookie();
}

/** Creates a freshly verified role session and revokes the current one atomically. */
export async function switchSessionRole(nextRole: RoleType): Promise<void> {
  if (!Object.values(Role).includes(nextRole)) throw new UnauthenticatedError();

  const jar = await cookies();
  const currentToken = jar.get(SESSION_COOKIE_NAME)?.value;
  const currentUser = await readSession(currentToken);
  if (!currentUser || !currentToken) throw new UnauthenticatedError();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const nextToken = randomBytes(32).toString("base64url");
  const oldTokenHash = hashSessionToken(currentToken);

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.userRole.findFirst({
      where: {
        userId: currentUser.id,
        role: nextRole,
        revokedAt: null,
        user: { isActive: true, activatedAt: { not: null } },
      },
      select: { id: true },
    });
    if (!assignment) throw new UnauthenticatedError();

    const revoked = await tx.session.updateMany({
      where: { tokenHash: oldTokenHash, userId: currentUser.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) throw new UnauthenticatedError();

    await tx.session.create({
      data: {
        tokenHash: hashSessionToken(nextToken),
        userId: currentUser.id,
        activeRole: nextRole,
        createdAt: now,
        expiresAt,
      },
    });
  });

  await setSessionCookie(nextToken, expiresAt);
}
