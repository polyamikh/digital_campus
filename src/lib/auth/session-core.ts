import { createHash, randomBytes } from "node:crypto";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  login: string;
  activeRole: RoleType;
};

type SessionUserRecord = {
  id: string;
  login: string;
  isActive: boolean;
  activatedAt: Date | null;
  roles: Array<{ role: RoleType; revokedAt: Date | null }>;
};

export type SessionRecord = {
  id: string;
  userId: string;
  activeRole: RoleType;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user: SessionUserRecord;
};

export type SessionStore = {
  hasActiveRole(userId: string, role: RoleType): Promise<boolean>;
  create(data: { tokenHash: string; userId: string; activeRole: RoleType; createdAt: Date; expiresAt: Date }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revoke(tokenHash: string, revokedAt: Date): Promise<void>;
};

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenRoleError extends Error {
  constructor() {
    super("This role is not permitted");
    this.name = "ForbiddenRoleError";
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSessionForStore(
  userId: string,
  activeRole: RoleType,
  store: SessionStore,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  if (!Object.values(Role).includes(activeRole)) throw new UnauthenticatedError();
  if (!(await store.hasActiveRole(userId, activeRole))) throw new UnauthenticatedError();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await store.create({ tokenHash: hashSessionToken(token), userId, activeRole, createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function readSessionFromStore(
  token: string | null | undefined,
  store: SessionStore,
  now: Date,
): Promise<AuthUser | null> {
  if (!token || token.length > 128) return null;
  const session = await store.findByTokenHash(hashSessionToken(token));
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) return null;
  if (!session.user.isActive || !session.user.activatedAt) return null;
  if (!session.user.roles.some((role) => role.role === session.activeRole && role.revokedAt === null)) return null;
  return { id: session.user.id, login: session.user.login, activeRole: session.activeRole };
}

export async function revokeSessionInStore(
  token: string | null | undefined,
  store: SessionStore,
  now: Date,
): Promise<void> {
  if (!token || token.length > 128) return;
  await store.revoke(hashSessionToken(token), now);
}
