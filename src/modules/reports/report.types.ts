export type EvidenceRef = {
  source: string;
  key: string;
  commitSha?: string;
  path?: string;
};

export interface EvidenceClaim {
  id: string;
  statement: string;
  evidence: EvidenceRef[];
  limitation: string;
}

export interface EvidenceReportSection {
  id: string;
  title: string;
  evidenceBasis: string;
  claims: EvidenceClaim[];
  limitation: string;
}

export interface EvidenceReport {
  reportVersion: "1.0";
  analyzerVersion: string;
  generatedAt: string;
  fingerprint: string;
  repository: {
    id: string;
    name: string;
    sourceType: string;
    sourceUrl: string | null;
    trackedBranch: string | null;
    defaultBranch: string | null;
    headSha: string | null;
  };
  analysis: {
    runId: string;
    status: string;
    mode: string;
    baseHeadSha: string | null;
    targetHeadSha: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
  coverage: {
    persistedCommits: number;
    reportSampleLimit: number;
    sectionsWithEvidence: number;
    sectionsWithoutEvidence: string[];
  };
  sections: EvidenceReportSection[];
  evidencePolicy: string[];
}

export interface ReportBuildInput {
  repository: {
    id: string;
    name: string;
    source_type: string;
    source_url: string | null;
    tracked_branch: string | null;
    default_branch: string | null;
    head_sha: string | null;
  };
  analysis: {
    id: string;
    status: string;
    analysis_mode: string;
    base_head_sha: string | null;
    target_head_sha: string | null;
    started_at: string | null;
    completed_at: string | null;
    analyzer_version: string;
  };
  persistedCommitCount: number;
  sampleLimit: number;
  commits: Array<{
    sha: string;
    committed_at: string | null;
    subject: string;
    files_changed: number;
    additions: number | null;
    deletions: number | null;
  }>;
  hotspots: Array<{
    path: string;
    commits_touched: number;
    additions: number;
    deletions: number;
    total_churn: number;
    first_changed_at: string | null;
    last_changed_at: string | null;
  }>;
  bugAreas: Array<{
    path: string;
    signal_commits: number;
    total_commits_touched: number;
    signal_ratio: number;
    total_churn: number;
    first_signal_at: string | null;
    last_signal_at: string | null;
  }>;
  repeatedlyModified: Array<{
    path: string;
    commits_touched: number;
    total_churn: number;
    first_changed_at: string | null;
    last_changed_at: string | null;
    change_span_days: number;
  }>;
  coupling: Array<{ path_a: string; path_b: string; co_change_count: number }>;
  contributors: Array<{
    authorName: string | null;
    authorEmail: string | null;
    commitCount: number;
    additions: number;
    deletions: number;
    totalChurn: number;
    pathsTouched: number;
    firstCommittedAt: string | null;
    lastCommittedAt: string | null;
  }>;
  contributorCount: number;
  refactors: Array<{ sha: string; committed_at: string | null; subject: string; files_changed: number }>;
  dependencyChanges: Array<{
    sha: string;
    package_name: string;
    scope: string;
    change_type: string;
    previous_spec: string | null;
    current_spec: string | null;
    committed_at: string | null;
    subject: string;
  }>;
  architectureEvents: Array<{
    sha: string;
    root_path: string;
    event_type: string;
    path: string;
    committed_at: string | null;
    subject: string;
  }>;
  complexityEvents: Array<{
    path: string;
    change_type: string;
    analysis_status: string;
    before_cyclomatic_complexity: number | null;
    after_cyclomatic_complexity: number | null;
    sha: string;
    committed_at: string | null;
    subject: string;
  }>;
  migrationEvents: Array<{
    id: string;
    sha: string;
    subject: string;
    committedAt: string | null;
    path: string;
    changeType: string;
    framework: string;
    analysisStatus: string;
    migrationKind: string;
    operationCount: number;
    destructiveSignals: string[];
    warnings: string[];
  }>;
  testEvolution: {
    total: number;
    events: Array<{
      id: string;
      sha: string;
      subject: string;
      committedAt: string | null;
      path: string;
      changeType: string;
      framework: string;
      testType: string;
      analysisStatus: string;
      testCaseDelta: number;
      assertionDelta: number;
      mockDelta: number;
      warnings: string[];
    }>;
  };
  testSummary: {
    eventCount: number;
    testCaseCount: number;
    testCaseDelta: number;
    assertionCount: number;
    assertionDelta: number;
  };
  deploymentEvidence?: Array<{
    eventId: string;
    occurredAt: string;
    provider: string;
    deploymentId: string;
    environment: string;
    state: "started" | "succeeded" | "failed" | "cancelled" | "unknown";
    revisionSha: string | null;
    artifactDigest: string | null;
    buildId: string | null;
    releaseId: string | null;
  }>;
  historicalRuntime?: {
    events: Array<{
      commit: { sha: string };
      sourceContext: {
        status: "available" | "truncated" | "unavailable";
        filesReported: number;
        changedFiles: Array<{ path: string }>;
      };
      runtimeEvidence: {
        status: string;
        observedDelta: {
          avgDurationMs: number | null;
          p95DurationMs: number | null;
          errorRate: number | null;
        };
      };
    }>;
  };
  runtimeSummary: {
    overall: {
      sampleCount: number;
      durationSampleCount: number;
      errorCount: number;
      errorRate: number;
      minDurationMs: number | null;
      avgDurationMs: number | null;
      p50DurationMs: number | null;
      p95DurationMs: number | null;
      p99DurationMs: number | null;
      maxDurationMs: number | null;
      firstObservedAt: string | null;
      lastObservedAt: string | null;
    };
    groups: Array<{
      key: string;
      sampleCount: number;
      errorRate: number;
      avgDurationMs: number | null;
      revisionKnown?: boolean;
    }>;
  };
}
