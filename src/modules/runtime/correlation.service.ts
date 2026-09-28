import {
  aggregateRuntimeWindow,
  buildCorrelationWindow,
  buildRuntimeChangeContext,
  deriveRuntimeCorrelationStatus,
  getRuntimeRevisionContext
} from "./correlation.persistence.js";
import type { RuntimeCorrelationEvidence } from "./correlation.types.js";
import { buildRuntimeChangeAssessment } from "./change-assessment.service.js";
import type { RuntimeTelemetryFilters } from "./runtime.types.js";

export async function generateRuntimeCorrelationEvidence(
  repositoryId: string,
  targetRevisionSha: string,
  windowMinutes = 60,
  minimumSamples = 10,
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha"> = {}
): Promise<RuntimeCorrelationEvidence> {
  const context = await getRuntimeRevisionContext(
    repositoryId,
    targetRevisionSha
  );

  if (!context) {
    return {
      status: "repository_revision_not_found",
      repositoryId,
      targetRevisionSha,
      parentRevisionSha: null,
      targetCommitAt: null,
      changeContext: null,
      assessment: null,
      windowMinutes,
      minimumSamples,
      filters,
      baseline: null,
      target: null,
      observedDelta: {
        avgDurationMs: null,
        p95DurationMs: null,
        errorRate: null
      },
      evidencePolicy: [
        "No persisted Git commit was found for the requested revision.",
        "Without a persisted revision, runtime evidence cannot be aligned to a source change."
      ]
    };
  }

  if (!context.committedAt) {
    return {
      status: "commit_time_unavailable",
      repositoryId,
      targetRevisionSha,
      parentRevisionSha: context.parentRevisionSha,
      targetCommitAt: null,
      changeContext: buildRuntimeChangeContext(context),
      assessment: null,
      windowMinutes,
      minimumSamples,
      filters,
      baseline: null,
      target: null,
      observedDelta: {
        avgDurationMs: null,
        p95DurationMs: null,
        errorRate: null
      },
      evidencePolicy: [
        "The Git revision exists but has no persisted commit timestamp.",
        "A time-aligned runtime comparison is therefore not available."
      ]
    };
  }

  if (!context.parentRevisionSha || !context.parentRevisionPersisted) {
    return {
      status: "missing_parent_revision",
      repositoryId,
      targetRevisionSha,
      parentRevisionSha: context.parentRevisionSha,
      targetCommitAt: context.committedAt,
      changeContext: buildRuntimeChangeContext(context),
      windowMinutes,
      minimumSamples,
      filters,
      baseline: null,
      target: null,
      observedDelta: {
        avgDurationMs: null,
        p95DurationMs: null,
        errorRate: null
      },
      evidencePolicy: [
        "The target commit does not have a persisted first parent revision.",
        "A persisted parent-revision baseline is required for this correlation mode."
      ]
    };
  }

  const commitAt = new Date(context.committedAt);
  const windowMs = windowMinutes * 60 * 1_000;
  const baselineFrom = new Date(commitAt.getTime() - windowMs);
  const targetTo = new Date(commitAt.getTime() + windowMs);

  const [baselineAggregate, targetAggregate] = await Promise.all([
    aggregateRuntimeWindow(
      repositoryId,
      baselineFrom,
      commitAt,
      context.parentRevisionSha,
      filters
    ),
    aggregateRuntimeWindow(
      repositoryId,
      commitAt,
      targetTo,
      context.targetRevisionSha,
      filters
    )
  ]);

  const status = deriveRuntimeCorrelationStatus(
    true,
    true,
    true,
    baselineAggregate.sampleCount,
    targetAggregate.sampleCount,
    minimumSamples
  );

  const baseline = buildCorrelationWindow(
    "baseline",
    baselineFrom,
    commitAt,
    context.parentRevisionSha,
    baselineAggregate
  );

  const target = buildCorrelationWindow(
    "target",
    commitAt,
    targetTo,
    context.targetRevisionSha,
    targetAggregate
  );

  return {
    status,
    repositoryId,
    targetRevisionSha,
    parentRevisionSha: context.parentRevisionSha,
    targetCommitAt: context.committedAt,
    changeContext: buildRuntimeChangeContext(context),
    assessment: buildRuntimeChangeAssessment(
      baseline,
      target,
      filters
    ),
    windowMinutes,
    minimumSamples,
    filters,
    baseline,
    target,
    observedDelta: {
      avgDurationMs:
        baselineAggregate.avgDurationMs !== null &&
        targetAggregate.avgDurationMs !== null
          ? targetAggregate.avgDurationMs - baselineAggregate.avgDurationMs
          : null,
      p95DurationMs:
        baselineAggregate.p95DurationMs !== null &&
        targetAggregate.p95DurationMs !== null
          ? targetAggregate.p95DurationMs - baselineAggregate.p95DurationMs
          : null,
      errorRate:
        targetAggregate.sampleCount >= minimumSamples &&
        baselineAggregate.sampleCount >= minimumSamples
          ? targetAggregate.errorRate - baselineAggregate.errorRate
          : null
    },
    evidencePolicy: [
      "This compares observed runtime samples for a parent revision before the commit and target revision after the commit.",
      "The comparison is observational evidence only; it does not establish that the commit caused any runtime change.",
      "A ready status means the revision/time alignment and minimum sample counts are satisfied, not that a regression occurred.",
      "Instrumentation coverage, workload differences, deployment timing, and other environmental factors can confound the comparison."
    ]
  };
}
