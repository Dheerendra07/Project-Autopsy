import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";
import { env } from "../../config/env.js";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function resolveKey(rawKey?: string | null): Buffer {
  const value = rawKey?.trim() || "";
  if (!value) {
    throw new Error(
      "Repository credential encryption is not configured on this service."
    );
  }

  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(
      "Repository credential encryption key must be exactly 64 hexadecimal characters."
    );
  }

  return Buffer.from(value, "hex");
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string, label: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new Error(`Stored repository credential ${label} is invalid.`);
  }
}

export function encryptRepositoryAccessToken(
  accessToken: string,
  rawKey = env.REPOSITORY_CREDENTIAL_ENCRYPTION_KEY
): string {
  const token = accessToken.trim();

  if (!token || /[\\r\\n\\t\\0]/.test(token)) {
    throw new Error("Repository access credential is invalid.");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKey(rawKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    encode(iv),
    encode(authTag),
    encode(ciphertext)
  ].join(".");
}

export function decryptRepositoryAccessToken(
  encryptedValue: string,
  rawKey = env.REPOSITORY_CREDENTIAL_ENCRYPTION_KEY
): string {
  const parts = encryptedValue.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored repository credential format is invalid.");
  }

  const iv = decode(parts[1] ?? "", "initialization vector");
  const authTag = decode(parts[2] ?? "", "authentication tag");
  const ciphertext = decode(parts[3] ?? "", "ciphertext");

  if (
    iv.length !== IV_BYTES ||
    authTag.length !== AUTH_TAG_BYTES ||
    ciphertext.length === 0
  ) {
    throw new Error("Stored repository credential payload is invalid.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, resolveKey(rawKey), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Stored repository credential could not be decrypted."
    );
  }
}
