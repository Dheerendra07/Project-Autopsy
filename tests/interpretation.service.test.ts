import assert from "node:assert/strict";
import test from "node:test";

import type { EvidenceReport } from "../src/modules/reports/report.types.js";
import {
  AiInterpretationProviderError,
  AiInterpretationValidationError,
  buildInterpretationPrompt,
  generateAiInterpretation,
  readAiProviderConfig
} from "../src/modules/interpretation/interpretation.service.js";

function reportFixture(): EvidenceReport {
  return {
    reportVersion: "1.0",
    analyzerVersion: "0.4.0",
    generatedAt: "2026-09-29T00:00:00.000Z",
    fingerprint: "f".repeat(64),
    repository: {
      id: "repo",
      name: "demo",
      sourceType: "git",
      sourceUrl: "https://private.example/repository.git",
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
      sectionsWithEvidence: 2,
      sectionsWithoutEvidence: []
    },
    sections: [
      {
        id: "development-history",
        title: "Development history",
        evidenceBasis: "git",
        claims: [
          {
            id: "commit-1",
            statement: "aaaaaaaaaaaa: feat: add report",
            evidence: [
              {
                source: "commit",
                key: "a".repeat(40),
                commitSha: "a".repeat(40)
              }
            ],
            limitation: "Commit subjects do not prove intent."
          }
        ],
        limitation: "Historical source evidence only."
      },
      {
        id: "historical-runtime",
        title: "Historical runtime and source context",
        evidenceBasis: "runtime",
        claims: [
          {
            id: "historical-runtime-1",
            statement:
              "bbbbbbbbbbbb has runtime status ready with observed delta avg=5 ms, p95=8 ms, errorRate=0.01; source context available (1 changed files reported).",
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
            ],
            limitation: "Runtime evidence is observational."
          }
        ],
        limitation: "No causal conclusion."
      }
    ],
    evidencePolicy: [
      "Signals are not causal proof.",
      "Runtime is observational."
    ]
  };
}

const validAiOutput = {
  executiveSummary: "The evidence shows a report-focused implementation with a ready historical runtime comparison.",
  themes: [
    {
      id: "theme-1",
      title: "Report evolution",
      analysis: "The repository records a report change and a ready runtime comparison around the historical revision.",
      evidenceKeys: [
        "development-history/commit-1",
        "historical-runtime/historical-runtime-1"
      ]
    }
  ],
  investigationQuestions: [
    {
      question: "What deployment or operational context surrounded the measured runtime window?",
      evidenceKeys: ["historical-runtime/historical-runtime-1"]
    }
  ],
  uncertainties: [
    "The evidence does not establish whether the commit caused the observed runtime delta."
  ]
};

test("builds deterministic grounded prompt without exposing report source URL", () => {
  const prompt = buildInterpretationPrompt(reportFixture());

  assert.equal(prompt.grounding.length, 2);
  assert.equal(prompt.grounding[1]?.evidenceKey, "historical-runtime/historical-runtime-1");
  assert.equal(prompt.user.includes("private.example"), false);
  assert.match(prompt.system, /never invent/i);
});

test("generates structured interpretation and preserves report fingerprint", async () => {
  let capturedBody = "";
  const fakeFetch: typeof fetch = async (_input, init) => {
    capturedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(validAiOutput) }]
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await generateAiInterpretation(
    reportFixture(),
    {
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-luna",
      timeoutMs: 5_000
    },
    fakeFetch
  );

  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-5.6-luna");
  assert.equal(result.reportFingerprint, "f".repeat(64));
  assert.equal(result.groundingClaimCount, 2);
  assert.match(capturedBody, /project_autopsy_interpretation/);
  assert.doesNotMatch(capturedBody, /test-key/);
});

test("rejects provider output that references unknown evidence", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          ...validAiOutput,
          themes: [
            {
              ...validAiOutput.themes[0],
              evidenceKeys: ["not-supplied"]
            }
          ]
        })
      }),
      { status: 200 }
    );

  await assert.rejects(
    () =>
      generateAiInterpretation(
        reportFixture(),
        {
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
          timeoutMs: 5_000
        },
        fakeFetch
      ),
    (error: unknown) => {
      assert.ok(error instanceof AiInterpretationValidationError);
      return true;
    }
  );
});

test("maps upstream provider failures without exposing response bodies", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("secret provider payload", { status: 429 });

  await assert.rejects(
    () =>
      generateAiInterpretation(
        reportFixture(),
        {
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
          timeoutMs: 5_000
        },
        fakeFetch
      ),
    (error: unknown) => {
      assert.ok(error instanceof AiInterpretationProviderError);
      assert.match((error as Error).message, /HTTP 429/);
      assert.doesNotMatch((error as Error).message, /secret provider payload/);
      return true;
    }
  );
});

test("requires an AI API key", () => {
  assert.throws(
    () =>
      readAiProviderConfig({
        AI_API_KEY: "",
        AI_BASE_URL: "https://api.openai.com/v1"
      }),
    /AI interpretation is not configured/
  );
});
