export const ANALYSIS_RECOVERY_GRACE_MS = 60_000;

/**
 * A running DB row can outlive its BullMQ job after terminal-job retention
 * cleanup or loss of queue state. Only expire it after the configured worker
 * deadline plus a short grace period; queued rows are deliberately excluded.
 */
export function isExpiredRunningAnalysisRun(
  status: string,
  startedAt: string | Date | null,
  nowMs: number,
  maxExecutionMs: number,
  graceMs: number = ANALYSIS_RECOVERY_GRACE_MS
): boolean {
  if (
    status !== "running" ||
    startedAt === null ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(maxExecutionMs) ||
    maxExecutionMs <= 0 ||
    !Number.isFinite(graceMs) ||
    graceMs < 0
  ) {
    return false;
  }

  const startedAtMs =
    startedAt instanceof Date
      ? startedAt.getTime()
      : Date.parse(startedAt);

  if (!Number.isFinite(startedAtMs)) {
    return false;
  }

  return nowMs - startedAtMs > maxExecutionMs + graceMs;
}
