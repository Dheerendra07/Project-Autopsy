import { timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";

function safeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isRuntimeTelemetryAuthorized(
  authorizationHeader: string | undefined,
  headerKey: string | undefined,
  configuredKey: string | undefined = env.RUNTIME_TELEMETRY_INGEST_KEY
): boolean {
  if (!configuredKey) {
    return env.NODE_ENV !== "production";
  }

  let receivedKey = headerKey?.trim();

  if (!receivedKey && authorizationHeader) {
    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    receivedKey = match?.[1]?.trim();
  }

  if (!receivedKey) return false;

  return safeEqual(configuredKey, receivedKey);
}
