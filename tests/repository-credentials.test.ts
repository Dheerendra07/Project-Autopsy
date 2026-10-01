import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptRepositoryAccessToken,
  encryptRepositoryAccessToken
} from "../src/modules/repositories/repository-credentials.js";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("repository access credentials round-trip through authenticated encryption", () => {
  const token = "ghp_test_token_with_safe_symbols_1234";
  const encrypted = encryptRepositoryAccessToken(token, TEST_KEY);

  assert.notEqual(encrypted, token);
  assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(decryptRepositoryAccessToken(encrypted, TEST_KEY), token);
});

test("repository access credentials use randomized ciphertext", () => {
  const token = "same-secret";
  const first = encryptRepositoryAccessToken(token, TEST_KEY);
  const second = encryptRepositoryAccessToken(token, TEST_KEY);

  assert.notEqual(first, second);
  assert.equal(decryptRepositoryAccessToken(first, TEST_KEY), token);
  assert.equal(decryptRepositoryAccessToken(second, TEST_KEY), token);
});

test("tampered repository access credentials are rejected", () => {
  const encrypted = encryptRepositoryAccessToken("secret-value", TEST_KEY);
  const parts = encrypted.split(".");
  const ciphertext = parts.at(-1) ?? "";
  const replacement = (ciphertext.at(-1) ?? "A") === "A" ? "B" : "A";
  parts[3] = ciphertext.slice(0, -1) + replacement;

  assert.throws(
    () => decryptRepositoryAccessToken(parts.join("."), TEST_KEY),
    /could not be decrypted|payload is invalid/
  );
});

test("repository access credentials reject malformed encryption keys", () => {
  assert.throws(
    () => encryptRepositoryAccessToken("secret", "too-short"),
    /exactly 64 hexadecimal/
  );
});
