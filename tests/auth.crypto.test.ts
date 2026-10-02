import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpaqueToken,
  createSessionExpiry,
  hashOpaqueToken,
  hashPassword,
  PASSWORD_MIN_LENGTH,
  verifyPassword
} from "../src/modules/auth/auth.crypto.js";

test("password hashing is salted and verifies only the original password", async () => {
  const password = "Correct horse battery staple 2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + "x", first), false);
  assert.equal(await verifyPassword(password, second), true);
});

test("password policy enforces the minimum supported length", async () => {
  await assert.rejects(
    () => hashPassword("a".repeat(PASSWORD_MIN_LENGTH - 1)),
    /Password length/
  );
});

test("opaque session tokens are random and stored as non-reversible hashes", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();

  assert.notEqual(first, second);
  assert.equal(first.length > 32, true);
  assert.equal(hashOpaqueToken(first).length, 64);
  assert.notEqual(hashOpaqueToken(first), first);
});

test("session expiry is 30 days from the supplied clock", () => {
  const now = new Date("2026-10-02T12:00:00.000Z");
  const expiry = createSessionExpiry(now);

  assert.equal(
    expiry.toISOString(),
    "2026-11-01T12:00:00.000Z"
  );
});
