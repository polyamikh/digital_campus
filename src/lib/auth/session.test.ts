import assert from "node:assert/strict";
import { test } from "node:test";
import { Role, type Role as RoleType } from "@/generated/prisma/enums";
import {
  createSessionForStore,
  hashSessionToken,
  readSessionFromStore,
  revokeSessionInStore,
  SESSION_TTL_MS,
  type SessionRecord,
  type SessionStore,
} from "./session-core";

const now = new Date("2026-11-09T12:00:00.000Z");

function fakeStore(overrides: Partial<SessionRecord> = {}): SessionStore & { record: SessionRecord | null; tokenHash: string } {
  const store = {
    record: null as SessionRecord | null,
    async hasActiveRole(userId: string, role: RoleType) {
      return userId === "user-1" && role === Role.STUDENT && this.record?.user.roles.some((item) => item.role === role && item.revokedAt === null) !== false;
    },
    async create(data: { tokenHash: string; userId: string; activeRole: RoleType; createdAt: Date; expiresAt: Date }) {
      this.record = {
        id: "session-1",
        userId: data.userId,
        activeRole: data.activeRole,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        revokedAt: null,
        user: {
          id: data.userId,
          login: "sokolova.a_student",
          isActive: true,
          activatedAt: now,
          roles: [{ role: data.activeRole, revokedAt: null }],
        },
        ...overrides,
      };
      this.tokenHash = data.tokenHash;
    },
    tokenHash: "",
    async findByTokenHash(tokenHash: string) {
      return tokenHash === this.tokenHash ? this.record : null;
    },
    async revoke(tokenHash: string, revokedAt: Date) {
      if (tokenHash === this.tokenHash && this.record) this.record.revokedAt = revokedAt;
    },
  };
  return store;
}

test("creates opaque token and stores only its SHA-256 hash with fixed 12-hour expiry", async () => {
  const store = fakeStore();
  const session = await createSessionForStore("user-1", Role.STUDENT, store, now);
  assert.notEqual(session.token, store.tokenHash);
  assert.equal(store.tokenHash, hashSessionToken(session.token));
  assert.equal(session.expiresAt.getTime() - now.getTime(), SESSION_TTL_MS);
  assert.deepEqual(await readSessionFromStore(session.token, store, now), {
    id: "user-1",
    login: "sokolova.a_student",
    activeRole: Role.STUDENT,
  });
});

test("rejects expired and revoked sessions", async () => {
  const expiredStore = fakeStore({ expiresAt: new Date(now.getTime() - 1) });
  const expired = await createSessionForStore("user-1", Role.STUDENT, expiredStore, now);
  assert.equal(await readSessionFromStore(expired.token, expiredStore, now), null);

  const revokedStore = fakeStore();
  const revoked = await createSessionForStore("user-1", Role.STUDENT, revokedStore, now);
  await revokeSessionInStore(revoked.token, revokedStore, now);
  assert.equal(await readSessionFromStore(revoked.token, revokedStore, now), null);
});

test("rejects sessions for disabled users or revoked roles", async () => {
  const disabledStore = fakeStore({ user: { id: "user-1", login: "sokolova.a_student", isActive: false, activatedAt: now, roles: [{ role: Role.STUDENT, revokedAt: null }] } });
  const disabled = await createSessionForStore("user-1", Role.STUDENT, disabledStore, now);
  assert.equal(await readSessionFromStore(disabled.token, disabledStore, now), null);

  const roleStore = fakeStore({ user: { id: "user-1", login: "sokolova.a_student", isActive: true, activatedAt: now, roles: [{ role: Role.STUDENT, revokedAt: now }] } });
  const revokedRole = await createSessionForStore("user-1", Role.STUDENT, roleStore, now);
  assert.equal(await readSessionFromStore(revokedRole.token, roleStore, now), null);
});

test("does not create a session for a role that is not actively assigned", async () => {
  await assert.rejects(createSessionForStore("user-1", Role.DEAN, fakeStore(), now));
});
