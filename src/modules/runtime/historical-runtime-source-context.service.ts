import type {
  HistoricalRuntimeReconstruction
} from "./historical-correlation.service.js";
import type {
  RuntimeCorrelationChangeContext
} from "./correlation.types.js";

export interface HistoricalRuntimeSourceContextEvent {
  sequence: number;
  commit: {
    sha: string;
    subject: string;
    committedAt: string | null;
    parentRevisionSha: string | null;
    filesChanged: number;
    additions: number | null;
    deletions: number | null;
  };
  sourceContext: {
    status: "available" | "truncated" | "unavailable";
    filesReported: number;
    changedFilesTruncated: boolean;
    changedFilesComplete: boolean;
    changedFiles: RuntimeCorrelationChangeContext["changedFiles"];
  };
  runtimeEvidence: {
    status: HistoricalRuntimeReconstruction["events"][number]["correlation"]["status"];
    observedDelta: HistoricalRuntimeReconstruction["events"][number]["correlation"]["observedDelta"];
    assessment: HistoricalRuntimeReconstruction["events"][number]["correlation"]["assessment"];
  };
}

export interface HistoricalRuntimeSourceContextEvidence {
  repositoryId: string;
  page: number;
  limit: number;
  totalCommits: number;
  coverage: {
    commitsInPage: number;
    sourceContextAvailable: number;
    sourceContextComplete: number;
    sourceContextTruncated: number;
    sourceContextUnavailable: number;
    totalChangedFilesReported: number;
    totalFilesChanged: number;
    totalAdditions: number;
    totalDeletions: number;
    runtimeReadyWithCompleteSourceContext: number;
    runtimeReadyWithTruncatedSourceContext: number;
    runtimeEvidenceGapsWithSourceContext: number;
  };
  semantics: {
    interpretation: string;
    fileAttribution: string;
  };
  events: HistoricalRuntimeSourceContextEvent[];
}

function sourceContextForEvent(
  event: HistoricalRuntimeReconstruction["events"][number]
): HistoricalRuntimeSourceContextEvent["sourceContext"] {
  const context = event.correlation.changeContext;

  if (!context) {
    return {
      status: "unavailable",
      filesReported: 0,
      changedFilesTruncated: false,
      changedFilesComplete: false,
      changedFiles: []
    };
  }

  if (context.commitSha !== event.commit.sha) {
    throw new Error(
      "Historical runtime source context commit identity does not match the persisted commit."
    );
  }

  const status = context.changedFilesComplete
    ? "available"
    : context.changedFilesTruncated
      ? "truncated"
      : "unavailable";

  return {
    status,
    filesReported: context.changedFiles.length,
    changedFilesTruncated: context.changedFilesTruncated,
    changedFilesComplete: context.changedFilesComplete,
    changedFiles: context.changedFiles
  };
}

export function buildHistoricalRuntimeSourceContextEvidence(
  reconstruction: HistoricalRuntimeReconstruction
): HistoricalRuntimeSourceContextEvidence {
  let sourceContextAvailable = 0;
  let sourceContextComplete = 0;
  let sourceContextTruncated = 0;
  let sourceContextUnavailable = 0;
  let totalChangedFilesReported = 0;
  let totalFilesChanged = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  let runtimeReadyWithCompleteSourceContext = 0;
  let runtimeReadyWithTruncatedSourceContext = 0;
  let runtimeEvidenceGapsWithSourceContext = 0;

  const events = reconstruction.events.map((event) => {
    const sourceContext = sourceContextForEvent(event);

    if (sourceContext.status === "available") {
      sourceContextAvailable += 1;
      sourceContextComplete += 1;
    } else if (sourceContext.status === "truncated") {
      sourceContextAvailable += 1;
      sourceContextTruncated += 1;
    } else {
      sourceContextUnavailable += 1;
    }

    totalChangedFilesReported += sourceContext.filesReported;
    totalFilesChanged += event.commit.filesChanged;
    totalAdditions += event.commit.additions ?? 0;
    totalDeletions += event.commit.deletions ?? 0;

    if (event.correlation.status === "ready") {
      if (sourceContext.status === "available") {
        runtimeReadyWithCompleteSourceContext += 1;
      } else if (sourceContext.status === "truncated") {
        runtimeReadyWithTruncatedSourceContext += 1;
      }
    } else if (sourceContext.status !== "unavailable") {
      runtimeEvidenceGapsWithSourceContext += 1;
    }

    return {
      sequence: event.sequence,
      commit: event.commit,
      sourceContext,
      runtimeEvidence: {
        status: event.correlation.status,
        observedDelta: event.correlation.observedDelta,
        assessment: event.correlation.assessment
      }
    };
  });

  return {
    repositoryId: reconstruction.repositoryId,
    page: reconstruction.page,
    limit: reconstruction.limit,
    totalCommits: reconstruction.totalCommits,
    coverage: {
      commitsInPage: reconstruction.events.length,
      sourceContextAvailable,
      sourceContextComplete,
      sourceContextTruncated,
      sourceContextUnavailable,
      totalChangedFilesReported,
      totalFilesChanged,
      totalAdditions,
      totalDeletions,
      runtimeReadyWithCompleteSourceContext,
      runtimeReadyWithTruncatedSourceContext,
      runtimeEvidenceGapsWithSourceContext
    },
    semantics: {
      interpretation:
        "This projection connects each historical runtime comparison to its persisted commit-level source-change context without inferring impact or causality.",
      fileAttribution:
        "Changed files are reported as source evidence for the commit as a whole. Runtime measurements are not attributed to individual files."
    },
    events
  };
}
