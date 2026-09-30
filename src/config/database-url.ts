const SECURE_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

export function normalizeDatabaseConnectionString(
  connectionString: string
): string {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase();

  if (sslMode && SECURE_SSL_MODES.has(sslMode)) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}
