import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewStoriesFromReport
} from "../src/modules/interview/interview.service.js";

function reportWithSections() {
  const claim = {
    id: "claim-1",
    statement: "src/app.ts was touched in 8 commits with 120 lines of recorded churn.",
    evidence: [
      {
        source: "file_change_metrics",
        key: "src/app.ts",
        path: "src/app.ts"
      }
    ],
    limitation: "Change frequency is historical."
  };

  return {
    reportVersion: "1.0" as const,
    analyzerVersion: "0.4.0",
    generatedAt: "2026-09-29T00:00:00.000Z",
    fingerprint: "f".repeat(64),
    repository: {
      id: "repo",
      name: "demo",
      sourceType: "git",
      sourceUrl: null,
      trackedBranch: "main",
      defaultBranch: "main",
      headSha: "a".repeat(40)
    },
    analysis: {
      runId: "run-1",
      status: "completed",
      mode: "full",
      baseHeadSha: null,
      targetHeadSha: "a".repeat(40),
      startedAt: null,
      completedAt: null
    },
    coverage: {
      persistedCommits: 8,
      reportSampleLimit: 3,
      sectionsWithEvidence: 1,
      sectionsWithoutEvidence: []
    },
    sections: [
      {
        id: "change-hotspots",
        title: "Change hotspots",
        evidenceBasis: "persisted metrics",
        claims: [claim],
        limitation: "Historical only."
      },
      {
        id: "historical-runtime",
        title: "Historical runtime and source context",
        evidenceBasis: "historical runtime reconstruction",
        claims: [
          {
            ...claim,
            id: "historical-runtime-1",
            statement: "bbbbbbbbbbbb has runtime status ready with source context available (1 changed files reported).",
            evidence: [
              {
                source: "historical_runtime_commit",
                key: "b".repeat(40),
                commitSha: "b".repeat(40)
              },
              {
                source: "historical_runtime_source_file",
                key: "b".repeat(40) + ":src/report.ts",
                commitSha: "b".repeat(40),
                path: "src/report.ts"
              }
            ]
          }
        ],
        limitation: "Historical runtime evidence is observational and does not establish causality."
      },
      {
        id: "runtime-observations",
        title: "Runtime observations",
        evidenceBasis: "telemetry",
        claims: [
          {
            ...claim,
            id: "runtime-1",
            statement: "10 runtime telemetry observations are persisted."
          }
        ],
        limitation: "Observed samples only."
      }
    ],
    evidencePolicy: []
  };
}

test("builds bounded story scaffolds from report evidence", () => {
  const result = buildInterviewStoriesFromReport(
    reportWithSections(),
    "repo",
    2
  );

  assert.equal(result.storyVersion, "1.0");
  assert.equal(result.repositoryId, "repo");
  assert.equal(result.analysisRunId, "run-1");
  assert.equal(result.stories.length, 2);
  assert.equal(result.stories[0]?.type, "change-hotspot");
  assert.equal(result.stories[1]?.type, "runtime-observability");
  assert.equal(
    result.stories[1]?.evidence.some(
      (item) =>
        item.source === "historical_runtime_source_file" &&
        item.path === "src/report.ts" &&
        item.commitSha === "b".repeat(40)
    ),
    true
  );
  assert.match(
    result.stories[1]?.evidenceSummary.join(" ") ?? "",
    /runtime status ready/i
  );
  assert.match(
    result.stories[0]?.verification.ownership ?? "",
    /Verify/
  );
  assert.match(
    result.stories[1]?.draftAnswer.evidenceBackedResult ?? "",
    /actual.*result/i
  );
});

test("never fabricates missing sections and clamps story limit", () => {
  const result = buildInterviewStoriesFromReport(
    reportWithSections(),
    "repo",
    99
  );

  assert.equal(result.stories.length, 2);
  assert.equal(
    result.stories.every((story) => story.evidence.length > 0),
    true
  );
});

