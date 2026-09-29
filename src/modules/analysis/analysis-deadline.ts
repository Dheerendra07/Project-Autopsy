import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../../config/env.js";

export const ANALYSIS_DEADLINE_EXCEEDED_MESSAGE =
  "Analysis exceeded the configured time limit.";

export const ANALYSIS_DEADLINE_MS =
  env.MAX_ANALYSIS_TIME_MINUTES * 60 * 1000;

export class AnalysisDeadlineExceededError extends Error {
  constructor() {
    super(ANALYSIS_DEADLINE_EXCEEDED_MESSAGE);
    this.name = "AnalysisDeadlineExceededError";
  }
}

export interface AnalysisDeadline {
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly limitMs: number;
  readonly expired: boolean;
  remainingMs(): number;
  assertNotExpired(): void;
  dispose(): void;
}

const deadlineStorage = new AsyncLocalStorage<AnalysisDeadline>();

export function createAnalysisDeadline(
  limitMs: number = ANALYSIS_DEADLINE_MS
): AnalysisDeadline {
  if (!Number.isFinite(limitMs) || limitMs <= 0) {
    throw new Error("Analysis deadline must be a finite positive number.");
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const deadlineAt = startedAt + limitMs;
  const failure = new AnalysisDeadlineExceededError();
  let expired = false;

  const expire = (): void => {
    if (expired) {
      return;
    }

    expired = true;
    controller.abort(failure);
  };

  const timer = setTimeout(expire, Math.ceil(limitMs));
  timer.unref?.();

  return {
    signal: controller.signal,
    startedAt,
    deadlineAt,
    limitMs,
    get expired() {
      return expired;
    },
    remainingMs(): number {
      if (expired) {
        return 0;
      }

      return Math.max(0, deadlineAt - Date.now());
    },
    assertNotExpired(): void {
      if (expired || Date.now() >= deadlineAt) {
        expire();
        throw failure;
      }
    },
    dispose(): void {
      clearTimeout(timer);
    }
  };
}

export async function runWithAnalysisDeadline<T>(
  work: (deadline: AnalysisDeadline) => Promise<T>,
  limitMs: number = ANALYSIS_DEADLINE_MS
): Promise<T> {
  const deadline = createAnalysisDeadline(limitMs);

  try {
    return await deadlineStorage.run(
      deadline,
      () => work(deadline)
    );
  } finally {
    deadline.dispose();
  }
}

export function getAnalysisDeadline(): AnalysisDeadline | null {
  return deadlineStorage.getStore() ?? null;
}

export function assertAnalysisDeadline(): void {
  deadlineStorage.getStore()?.assertNotExpired();
}
