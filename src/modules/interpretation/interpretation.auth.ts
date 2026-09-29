import { timingSafeEqual } from "node:crypto";

function safeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isAiInterpretationAuthorized(
  authorizationHeader: string | undefined,
  headerKey: string | undefined,
  configuredKey: string | undefined = process.env.AI_INTERPRETATION_ACCESS_KEY,
  nodeEnvironment: string | undefined = process.env.NODE_ENV
): boolean {
  if (!configuredKey) {
    return nodeEnvironment !== "production";
  }

  let receivedKey = headerKey?.trim();

  if (!receivedKey && authorizationHeader) {
    const match = authorizationHeader.match(/^Bearer\\s+(.+)$/i);
    receivedKey = match?.[1]?.trim();
  }

  if (!receivedKey) {
    return false;
  }

  return safeEqual(configuredKey, receivedKey);
}
