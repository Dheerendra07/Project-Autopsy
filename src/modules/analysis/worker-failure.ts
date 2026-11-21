export function isTerminalAnalysisJobFailure(
  error: unknown,
  attemptsMade: number,
  configuredAttempts: number | undefined
): boolean {
  const errorName =
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : null;

  if (errorName === "UnrecoverableError") {
    return true;
  }

  const maxAttempts =
    Number.isSafeInteger(configuredAttempts) &&
    Number(configuredAttempts) > 0
      ? Number(configuredAttempts)
      : 1;

  return (
    Number.isSafeInteger(attemptsMade) &&
    attemptsMade >= maxAttempts
  );
}
