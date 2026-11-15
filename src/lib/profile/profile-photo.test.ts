import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Role } from "@/generated/prisma/enums";
import { detectProfilePhotoFormat, MAX_PROFILE_PHOTO_BYTES, requireStudentPhotoOwner } from "./profile-photo-core";
import { deleteProfilePhoto, getProfilePhotoMetadata, readProfilePhoto, saveProfilePhoto } from "./profile-photo-store-core";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test("detects real JPG, PNG and WebP signatures and rejects a mismatched MIME type", () => {
  assert.equal(detectProfilePhotoFormat(jpeg, "image/jpeg").extension, "jpg");
  assert.equal(detectProfilePhotoFormat(png, "image/png").extension, "png");
  assert.equal(detectProfilePhotoFormat(webp, "image/webp").extension, "webp");
  assert.throws(() => detectProfilePhotoFormat(png, "image/jpeg"), /не совпадает/);
  assert.throws(() => detectProfilePhotoFormat(new TextEncoder().encode("<svg/>")), /Поддерживаются/);
});

test("rejects empty and over-limit uploads", () => {
  assert.throws(() => detectProfilePhotoFormat(new Uint8Array()), /непустое/);
  assert.throws(() => detectProfilePhotoFormat(new Uint8Array(MAX_PROFILE_PHOTO_BYTES + 1)), /5 МБ/);
});

test("only an authenticated student identity can own a profile photo", () => {
  assert.equal(requireStudentPhotoOwner({ id: "alice", activeRole: Role.STUDENT }), "alice");
  assert.throws(() => requireStudentPhotoOwner(null), /Student session required/);
  assert.throws(() => requireStudentPhotoOwner({ id: "teacher", activeRole: Role.TEACHER }), /Student session required/);
});

test("stores/replaces a photo privately and isolates files by authenticated user ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "dc-profile-photo-"));
  try {
    assert.equal(await getProfilePhotoMetadata("alice-id", root), null);
    const first = await saveProfilePhoto("alice-id", png, "image/png", root);
    assert.equal(first.mimeType, "image/png");
    assert.deepEqual((await readProfilePhoto("alice-id", root))?.bytes, Buffer.from(png));
    assert.equal(await readProfilePhoto("sofia-id", root), null);

    const replacement = await saveProfilePhoto("alice-id", jpeg, "image/jpeg", root);
    assert.equal(replacement.mimeType, "image/jpeg");
    assert.deepEqual((await readProfilePhoto("alice-id", root))?.bytes, Buffer.from(jpeg));
    assert.notEqual(first.fileName, replacement.fileName);
    assert.equal(await deleteProfilePhoto("alice-id", root), true);
    assert.equal(await getProfilePhotoMetadata("alice-id", root), null);
    assert.equal(await readProfilePhoto("alice-id", root), null);
    assert.equal(await readProfilePhoto("sofia-id", root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deleting a missing photo is a safe no-op", async () => {
  const root = await mkdtemp(join(tmpdir(), "dc-profile-photo-empty-"));
  try {
    assert.equal(await deleteProfilePhoto("alice-id", root), false);
    assert.equal(await getProfilePhotoMetadata("alice-id", root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
