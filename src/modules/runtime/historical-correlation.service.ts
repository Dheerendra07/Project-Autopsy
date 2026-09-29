import { listRepositoryCommits, type StoredCommit } from "../repositories/repository.persistence.js";
import { generateRuntimeCorrelationEvidence } from "./correlation.service.js";
import type {
  RuntimeCorrelationEvidence,
  RuntimeCorrelationStatus
} from "./correlation.types.js";
import type { RuntimeTelemetryFilters } from "./runtime.types.js";

export interface HistoricalRuntimeReconstructionEvent {
  sequence: number;
  temporalContext: {
    previousCommitSha: string | null;
    nextCommitSha: string | null;
    previousCommitGapMinutes: number | null;
    nextCommitGapMinutes: number | null;
    runtimeWindowOverlapsPrevious: boolean | null;
    runtimeWindowOverlapsNext: boolean | null;
  };
  commit: {
    sha: string;
    parentRevisionSha: string | null;
    subject: string;
    committedAt: string | null;
    filesChanged: number;
    additions: number | null;
    deletions: number | null;
  };
  correlation: RuntimeCorrelationEvidence;
}

export interface HistoricalRuntimeReconstruction {
  repositoryId: string;
  page: number;
  limit: number;
  totalCommits: number;
  windowMinutes: number;
  minimumSamples: number;
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha">;
  ordering: string[];
  semantics: {
    timeline: string;
    causality: string;
    evidenceGaps: string;
  };
  coverage: {
    commitsInPage: number;
    readyCorrelations: number;
    evidenceGaps: number;
    statusCounts: Record<RuntimeCorrelationStatus, number>;
  };
  events: HistoricalRuntimeReconstructionEvent[];
}

const STATUS_VALUES: RuntimeCorrelationStatus[] = [
  "ready",
  "repository_revision_not_found",
  "commit_time_unavailable",
  "missing_parent_revision",
  "insufficient_baseline_samples",
  "insufficient_target_samples"
];

function emptyStatusCounts(): Record<RuntimeCorrelationStatus, number> {
  return Object.fromEntries(
    STATUS_VALUES.map((status) => [status, 0])
  ) as Record<RuntimeCorrelationStatus, number>;
}

function commitMetadata(commit: StoredCommit) {
  return {
    sha: commit.sha,
    parentRevisionSha: commit.parent_shas[0] ?? null,
    subject: commit.subject,
    committedAt: commit.committed_at,
    filesChanged: commit.files_changed,
    additions: commit.additions,
    deletions: commit.deletions
  };
}

export function buildHistoricalRuntimeReconstruction(
  repositoryId: string,
  page: number,
  limit: number,
  totalCommits: number,
  windowMinutes: number,
  minimumSamples: number,
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha">,
  commits: StoredCommit[],
  correlations: RuntimeCorrelationEvidence[],
  boundaries: {
    previousCommit: StoredCommit | null;
    nextCommit: StoredCommit | null;
  } = {
    previousCommit: null,
    nextCommit: null
  }
): HistoricalRuntimeReconstruction {
  if (commits.length !== correlations.length) {
    throw new Error(
      "Historical runtime reconstruction requires one correlation result per commit."
    );
  }

  const statusCounts = emptyStatusCounts();

  const events = commits.map((commit, index) => {
    const correlation = correlations[index];
    const previousCommit =
      index > 0
        ? commits[index - 1]
        : boundaries.previousCommit;
    const nextCommit =
      index + 1 < commits.length
        ? commits[index + 1]
        : boundaries.nextCommit;
    const committedAt = commit.committed_at
      ? new Date(commit.committed_at).getTime()
      : Number.NaN;
    const previousCommittedAt = previousCommit?.committed_at
      ? new Date(previousCommit.committed_at).getTime()
      : Number.NaN;
    const nextCommittedAt = nextCommit?.committed_at
      ? new Date(nextCommit.committed_at).getTime()
      : Number.NaN;
    const previousGapMinutes = Number.isFinite(committedAt) &&
      Number.isFinite(previousCommittedAt)
      ? Number(((committedAt - previousCommittedAt) / 60_000).toFixed(6))
      : null;
    const nextGapMinutes = Number.isFinite(committedAt) &&
      Number.isFinite(nextCommittedAt)
      ? Number(((nextCommittedAt - committedAt) / 60_000).toFixed(6))
      : null;
    const overlapThresholdMinutes = windowMinutes * 2;

    if (!correlation) {
      throw new Error(
        "Historical runtime reconstruction correlation ordering is incomplete."
      );
    }

    statusCounts[correlation.status] += 1;

    return {
      sequence: (page - 1) * limit + index + 1,
      temporalContext: {
        previousCommitSha: previousCommit?.sha ?? null,
        nextCommitSha: nextCommit?.sha ?? null,
        previousCommitGapMinutes: previousGapMinutes,
        nextCommitGapMinutes: nextGapMinutes,
        runtimeWindowOverlapsPrevious:
          previousGapMinutes === null
            ? null
            : previousGapMinutes < overlapThresholdMinutes,
        runtimeWindowOverlapsNext:
          nextGapMinutes === null
            ? null
            : nextGapMinutes < overlapThresholdMinutes
      },
      commit: commitMetadata(commit),
      correlation
    };
  });

  const readyCorrelations = statusCounts.ready;
  const commitsInPage = events.length;

  return {
    repositoryId,
    page,
    limit,
    totalCommits,
    windowMinutes,
    minimumSamples,
    filters,
    ordering: [
      "committed_at ASC NULLS LAST",
      "sha ASC"
    ],
    semantics: {
      timeline:
        "Chronological persisted Git commits aligned independently with their observable runtime windows.",
      causality:
        "Runtime measurements and readiness states do not establish that a commit caused an observed change.",
      evidenceGaps:
        "Missing revision, time, parent, or sample evidence remains explicit and is never replaced with inferred measurements."
    },
    coverage: {
      commitsInPage,
      readyCorrelations,
      evidenceGaps: commitsInPage - readyCorrelations,
      statusCounts
    },
    events
  };
}

export async function generateHistoricalRuntimeReconstruction(
  repositoryId: string,
  page: number,
  limit: number,
  windowMinutes: number,
  minimumSamples: number,
  filters: Omit<RuntimeTelemetryFilters, "from" | "to" | "revisionSha"> = {}
): Promise<HistoricalRuntimeReconstruction> {
  const result = await listRepositoryCommits(
    repositoryId,
    page,
    limit
  );

  const [previousPage, nextPage] = await Promise.all([
    page > 1
      ? listRepositoryCommits(repositoryId, page - 1, limit)
      : Promise.resolve(null),
    result.commits.length > 0 && page * limit < result.total
      ? listRepositoryCommits(repositoryId, page + 1, limit)
      : Promise.resolve(null)
  ]);

  const boundaries: {
    previousCommit: StoredCommit | null;
    nextCommit: StoredCommit | null;
  } = {
    previousCommit:
      previousPage?.commits.at(-1) ?? null,
    nextCommit:
      nextPage?.commits[0] ?? null
  };

  const correlations: RuntimeCorrelationEvidence[] = [];

  for (const commit of result.commits) {
    correlations.push(
      await generateRuntimeCorrelationEvidence(
        repositoryId,
        commit.sha,
        windowMinutes,
        minimumSamples,
        filters
      )
    );
  }

  return buildHistoricalRuntimeReconstruction(
    repositoryId,
    page,
    limit,
    result.total,
    windowMinutes,
    minimumSamples,
    filters,
    result.commits,
    correlations,
    boundaries
  );
}
