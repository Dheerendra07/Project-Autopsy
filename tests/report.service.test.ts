import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidenceReport } from "../src/modules/reports/report.service.js";

function baseInput() {
  return {
    repository: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "demo",
      source_type: "git",
      source_url: "https://github.com/example/demo",
      tracked_branch: "main",
      default_branch: "main",
      head_sha: "a".repeat(40)
    },
    analysis: {
      id: "00000000-0000-4000-8000-000000000002",
      status: "completed",
      analysis_mode: "full",
      base_head_sha: null,
      target_head_sha: "a".repeat(40),
      started_at: "2026-09-28T00:00:00.000Z",
      completed_at: "2026-09-28T00:10:00.000Z",
      analyzer_version: "0.4.0"
    },
    persistedCommitCount: 12,
    sampleLimit: 2,
    commits: [
      {
        sha: "a".repeat(40),
        committed_at: "2026-09-01T00:00:00.000Z",
        subject: "feat: add report",
        files_changed: 2,
        additions: 10,
        deletions: 1
      },
      {
        sha: "b".repeat(40),
        committed_at: "2026-09-02T00:00:00.000Z",
        subject: "fix: harden report",
        files_changed: 3,
        additions: 8,
        deletions: 4
      }
    ],
    hotspots: [
      {
        path: "src/report.ts",
        commits_touched: 5,
        additions: 20,
        deletions: 10,
        total_churn: 30,
        first_changed_at: "2026-09-01T00:00:00.000Z",
        last_changed_at: "2026-09-02T00:00:00.000Z"
      }
    ],
    bugAreas: [
      {
        path: "src/report.ts",
        signal_commits: 2,
        total_commits_touched: 4,
        signal_ratio: 0.5,
        total_churn: 30,
        first_signal_at: "2026-09-01T00:00:00.000Z",
        last_signal_at: "2026-09-02T00:00:00.000Z"
      }
    ],
    repeatedlyModified: [
      {
        path: "src/report.ts",
        commits_touched: 5,
        total_churn: 30,
        first_changed_at: "2026-09-01T00:00:00.000Z",
        last_changed_at: "2026-09-02T00:00:00.000Z",
        change_span_days: 1
      }
    ],
    coupling: [
      { path_a: "src/report.ts", path_b: "src/routes.ts", co_change_count: 3 }
    ],
    refactors: [
      {
        sha: "b".repeat(40),
        committed_at: "2026-09-02T00:00:00.000Z",
        subject: "refactor: extract report builder",
        files_changed: 3
      }
    ],
    dependencyChanges: [
      {
        sha: "b".repeat(40),
        package_name: "express",
        scope: "runtime",
        change_type: "updated",
        previous_spec: "^5.0.0",
        current_spec: "^5.2.1",
        committed_at: "2026-09-02T00:00:00.000Z",
        subject: "chore: upgrade express"
      }
    ],
    architectureEvents: [
      {
        sha: "b".repeat(40),
        root_path: ".",
        event_type: "directory_added",
        path: "src/reports",
        committed_at: "2026-09-02T00:00:00.000Z",
        subject: "feat: add reports"
      }
    ],
    complexityEvents: [
      {
        path: "src/report.ts",
        change_type: "modified",
        analysis_status: "supported",
        before_cyclomatic_complexity: 3,
        after_cyclomatic_complexity: 5,
        sha: "b".repeat(40),
        committed_at: "2026-09-02T00:00:00.000Z",
        subject: "refactor: extract report builder"
      }
    ],
    migrationEvents: [
      {
        id: "migration-1",
        sha: "b".repeat(40),
        subject: "feat: add report table",
        committedAt: "2026-09-02T00:00:00.000Z",
        path: "db/migrations/001_report.sql",
        changeType: "added",
        framework: "sql",
        analysisStatus: "supported_sql",
        migrationKind: "schema",
        operationCount: 1,
        destructiveSignals: [],
        warnings: []
      }
    ],
    testEvolution: {
      total: 1,
      events: [
        {
          id: "test-1",
          sha: "b".repeat(40),
          subject: "test: add report coverage",
          committedAt: "2026-09-02T00:00:00.000Z",
          path: "tests/report.test.ts",
          changeType: "added",
          framework: "node_test",
          testType: "unit",
          analysisStatus: "supported_source",
          testCaseDelta: 2,
          assertionDelta: 4,
          mockDelta: 0,
          warnings: []
        }
      ]
    },
    testSummary: {
      eventCount: 1,
      testCaseCount: 2,
      testCaseDelta: 2,
      assertionCount: 4,
      assertionDelta: 4
    },
    historicalRuntime: {
      events: [
        {
          commit: { sha: "b".repeat(40) },
          sourceContext: {
            status: "available",
            filesReported: 1,
            changedFiles: [{ path: "src/report.ts" }]
          },
          runtimeEvidence: { status: "ready" }
        }
      ]
    },
    runtimeSummary: {
      overall: {
        sampleCount: 10,
        durationSampleCount: 10,
        errorCount: 1,
        errorRate: 0.1,
        minDurationMs: 2,
        avgDurationMs: 10,
        p50DurationMs: 8,
        p95DurationMs: 20,
        p99DurationMs: 21,
        maxDurationMs: 22,
        firstObservedAt: "2026-09-01T00:00:00.000Z",
        lastObservedAt: "2026-09-02T00:00:00.000Z"
      },
      groups: [
        {
          key: "a".repeat(40),
          sampleCount: 10,
          errorRate: 0.1,
          avgDurationMs: 10,
          revisionKnown: true
        }
      ]
    }
  };
}

test("builds an evidence report with stable fingerprint independent of generation time", () => {
  const input = baseInput();
  const first = buildEvidenceReport(
    input,
    new Date("2026-09-29T00:00:00.000Z")
  );
  const second = buildEvidenceReport(
    input,
    new Date("2026-09-29T00:01:00.000Z")
  );

  assert.equal(first.reportVersion, "1.0");
  assert.equal(first.coverage.persistedCommits, 12);
  assert.equal(
    first.sections.every((item) => item.claims.length <= 2),
    true
  );
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.ok(
    first.sections.some(
      (section) =>
        section.id === "runtime-observations" &&
        section.claims[0]?.statement.includes("10 runtime telemetry")
    )
  );
  assert.ok(
    first.sections.some(
      (section) =>
        section.id === "historical-runtime" &&
        section.claims[0]?.evidence.some((ref) => ref.path === "src/report.ts")
    )
  );
});

test("keeps exact commit references on evolution evidence", () => {
  const input = baseInput();
  input.sampleLimit = 5;
  const report = buildEvidenceReport(
    input,
    new Date("2026-09-29T00:00:00.000Z")
  );

  const evolution = report.sections.find(
    (section) => section.id === "evolution"
  );

  const dependencyClaim = evolution?.claims.find(
    (claim) => claim.id === "dependency-1"
  );
  const architectureClaim = evolution?.claims.find(
    (claim) => claim.id === "architecture-1"
  );

  assert.equal(
    dependencyClaim?.evidence[0]?.commitSha,
    "b".repeat(40)
  );
  assert.equal(
    architectureClaim?.evidence[0]?.commitSha,
    "b".repeat(40)
  );
  assert.equal(
    architectureClaim?.evidence[0]?.path,
    "src/reports"
  );
});

test("does not turn absent runtime telemetry into a negative performance claim", () => {
  const input = baseInput();
  input.runtimeSummary.overall.sampleCount = 0;
  input.runtimeSummary.groups = [];

  const report = buildEvidenceReport(
    input,
    new Date("2026-09-29T00:00:00.000Z")
  );

  const runtimeSection = report.sections.find(
    (section) => section.id === "runtime-observations"
  );

  assert.equal(runtimeSection?.claims[0]?.id, "runtime-none");
  assert.match(
    runtimeSection?.claims[0]?.limitation ?? "",
    /Absence of telemetry/
  );
});
