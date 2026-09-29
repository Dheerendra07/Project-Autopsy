export function parseCorsOrigins(rawOrigins: string | undefined): string[] {
  if (!rawOrigins) {
    return [];
  }

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isCorsOriginAllowed(
  requestOrigin: string | undefined,
  nodeEnvironment: string,
  configuredOrigins: string[]
): boolean {
  if (!requestOrigin) {
    return true;
  }

  if (nodeEnvironment !== "production") {
    return true;
  }

  return configuredOrigins.includes(requestOrigin);
}
