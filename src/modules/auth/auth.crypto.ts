import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const SESSION_TTL_DAYS = 30;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEM = 64 * 1024 * 1024;

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error("Password length is outside the supported range.");
  }

  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEM
  })) as Buffer;

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url")
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltPart = parts[4];
  const hashPart = parts[5];

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !saltPart ||
    !hashPart ||
    n < 16_384 ||
    n > 65_536 ||
    r < 1 ||
    r > 16 ||
    p < 1 ||
    p > 8
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;

  try {
    salt = Buffer.from(saltPart, "base64url");
    expected = Buffer.from(hashPart, "base64url");
  } catch {
    return false;
  }

  if (salt.length < 16 || expected.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  try {
    const actual = (await scrypt(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: SCRYPT_MAX_MEM
    })) as Buffer;

    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionExpiry(now = new Date()): Date {
  return new Date(
    now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000
  );
}

export function safeEqualString(
  expected: string,
  received: string
): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
