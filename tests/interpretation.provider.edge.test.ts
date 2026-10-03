import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceReport } from "../src/modules/reports/report.types.js";

import {
  AiInterpretationProviderError,
  generateAiInterpretation
} from "../src/modules/interpretation/interpretation.service.js";

const report = {
  reportVersion: "1.0",
  analyzerVersion: "test",
  generatedAt: "2026-09-30T00:00:00.000Z",
  fingerprint: "a".repeat(64),
  repository: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "fixture",
    sourceType: "github",
    sourceUrl: "https://github.com/octocat/Hello-World",
    trackedBranch: "main",
    defaultBranch: "main",
    headSha: "a".repeat(40)
  },
  analysis: {
    runId: "00000000-0000-4000-8000-000000000002",
    status: "completed",
    mode: "full",
    baseHeadSha: null,
    targetHeadSha: "a".repeat(40),
    startedAt: "2026-09-30T00:00:00.000Z",
    completedAt: "2026-09-30T00:01:00.000Z"
  },
  coverage: {
    persistedCommits: 1,
    reportSampleLimit: 10,
    sectionsWithEvidence: 1,
    sectionsWithoutEvidence: []
  },
  sections: [
    {
      id: "history",
      title: "History",
      evidenceBasis: "commit history",
      limitation: "fixture",
      claims: [
        {
          id: "claim-1",
          statement: "One commit changed the repository.",
          limitation: "fixture",
          evidence: [
            {
              source: "commit",
              key: "a".repeat(40),
              commitSha: "a".repeat(40)
            }
          ]
        }
      ]
    }
  ],
  evidencePolicy: ["fixture"]
} satisfies EvidenceReport;

const config = {
  apiKey: "a".repeat(48),
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-2.5-flash",
  timeoutMs: 30_000
};

const validOutput = {
  executiveSummary: "A bounded fixture interpretation.",
  themes: [
    {
      id: "theme-1",
      title: "History",
      analysis: "The fixture contains one recorded commit.",
      evidenceKeys: ["history/claim-1"]
    }
  ],
  investigationQuestions: [
    {
      question: "Verify the recorded change against the commit.",
      evidenceKeys: ["history/claim-1"]
    }
  ],
  uncertainties: []
};

test("accepts a bounded structured provider response", async () => {
  const response = new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(validOutput) }]
          }
        }
      ]
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );

  const result = await generateAiInterpretation(
    report,
    config,
    async () => response
  );

  assert.equal(result.cacheHit, false);
  assert.equal(result.interpretation.executiveSummary, validOutput.executiveSummary);
});

test("rejects provider responses above the hard response-size limit", async () => {
  const response = new Response(
    "x",
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(256 * 1024 + 1)
      }
    }
  );

  await assert.rejects(
    () => generateAiInterpretation(report, config, async () => response),
    (error) => {
      assert.ok(error instanceof AiInterpretationProviderError);
      assert.equal(
        error.message,
        "AI provider response exceeded the configured size limit."
      );
      return true;
    }
  );
});
