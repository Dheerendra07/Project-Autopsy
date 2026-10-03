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

test("uses a cached interpretation without calling the provider", async () => {
  const report = reportFixture();
  const cachedResult = {
    interpretationVersion: "1.0" as const,
    provider: "gemini" as const,
    model: "gemini-3.8-flash",
    reportFingerprint: report.fingerprint,
    groundingClaimCount: 2,
    generatedAt: "2026-09-29T00:00:00.000Z",
    cacheHit: false,
    interpretation: validAiOutput
  };

  let fetchCalls = 0;
  let requestedKey = "";
  const cache = {
    async get(key: string) {
      requestedKey = key;
      return cachedResult;
    },
    async set() {
      throw new Error("cache write should not happen on cache hit");
    }
  };

  const result = await generateAiInterpretation(
    report,
    {
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      timeoutMs: 5_000
    },
    async () => {
      fetchCalls += 1;
      throw new Error("provider should not be called");
    },
    cache
  );

  assert.equal(fetchCalls, 0);
  assert.match(requestedKey, /^project-autopsy:ai-interpretation:v1:/);
  assert.equal(result.cacheHit, true);
});

test("persists a fresh provider result after a cache miss", async () => {
  const report = reportFixture();
  let setKey = "";
  let setValue: unknown = null;

  const cache = {
    async get() {
      return null;
    },
    async set(key: string, value: unknown) {
      setKey = key;
      setValue = value;
    }
  };

  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAiOutput) }]
            }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  const result = await generateAiInterpretation(
    report,
    {
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      timeoutMs: 5_000
    },
    fakeFetch,
    cache
  );

  assert.equal(result.cacheHit, false);
  assert.match(setKey, /^project-autopsy:ai-interpretation:v1:/);
  assert.deepEqual(setValue, result);
});

test("continues provider flow when cache read or write fails", async () => {
  let fetchCalls = 0;
  const cache = {
    async get() {
      throw new Error("redis unavailable");
    },
    async set() {
      throw new Error("redis unavailable");
    }
  };

  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAiOutput) }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  };

  const result = await generateAiInterpretation(
    reportFixture(),
    {
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      timeoutMs: 5_000
    },
    fakeFetch,
    cache
  );

  assert.equal(fetchCalls, 1);
  assert.equal(result.cacheHit, false);
});

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
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"
    );
    assert.equal(
      new Headers(init?.headers).get("x-goog-api-key"),
      "test-key"
    );
    capturedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAiOutput) }]
            }
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
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      timeoutMs: 5_000
    },
    fakeFetch
  );

  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.reportFingerprint, "f".repeat(64));
  assert.equal(result.groundingClaimCount, 2);
  assert.match(capturedBody, /response_format/);
  assert.doesNotMatch(capturedBody, /test-key/);
});

test("rejects provider output that references unknown evidence", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ...validAiOutput,
                    themes: [
                      {
                        ...validAiOutput.themes[0],
                        evidenceKeys: ["not-supplied"]
                      }
                    ]
                  })
                }
              ]
            }
          }
        ]
      }),
      { status: 200 }
    );

  await assert.rejects(
    () =>
      generateAiInterpretation(
        reportFixture(),
        {
          apiKey: "test-key",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          model: "gemini-3.8-flash",
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
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          model: "gemini-3.8-flash",
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

test("retries temporary rate limits and overloads with bounded backoff", async () => {
  let fetchCalls = 0;
  const retryDelays: number[] = [];

  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;

    if (fetchCalls === 1) {
      return new Response(
        JSON.stringify({
          error: { status: "slow_down" }
        }),
        {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "0" }
        }
      );
    }

    if (fetchCalls === 2) {
      return new Response(
        JSON.stringify({
          error: { status: "server_is_overloaded" }
        }),
        {
          status: 503,
          headers: { "content-type": "application/json", "retry-after": "0" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAiOutput) }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  };

  const result = await generateAiInterpretation(
    reportFixture(),
    {
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      timeoutMs: 5_000
    },
    fakeFetch,
    undefined,
    {
      sleep: async (milliseconds) => {
        retryDelays.push(milliseconds);
      },
      random: () => 0
    }
  );

  assert.equal(result.cacheHit, false);
  assert.equal(fetchCalls, 3);
  assert.deepEqual(retryDelays, [0, 0]);
});

test("does not retry exhausted-credit 429 responses", async () => {
  let fetchCalls = 0;

  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        error: { status: "RESOURCE_EXHAUSTED" }
      }),
      {
        status: 429,
        headers: { "content-type": "application/json" }
      }
    );
  };

  await assert.rejects(
    () =>
      generateAiInterpretation(
        reportFixture(),
        {
          apiKey: "test-key",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          model: "gemini-3.8-flash",
          timeoutMs: 5_000
        },
        fakeFetch,
        undefined,
        {
          sleep: async () => undefined,
          random: () => 0
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AiInterpretationProviderError);
      assert.match((error as Error).message, /HTTP 429/);
      return true;
    }
  );

  assert.equal(fetchCalls, 1);
});

test("honors Retry-After before a temporary retry", async () => {
  let fetchCalls = 0;
  const retryDelays: number[] = [];

  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;

    if (fetchCalls === 1) {
      return new Response(
        JSON.stringify({
          error: { status: "slow_down" }
        }),
        {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "2" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAiOutput) }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  };

  await generateAiInterpretation(
    reportFixture(),
    {
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      timeoutMs: 5_000
    },
    fakeFetch,
    undefined,
    {
      sleep: async (milliseconds) => {
        retryDelays.push(milliseconds);
      },
      random: () => 0
    }
  );

  assert.equal(fetchCalls, 2);
  assert.deepEqual(retryDelays, [2_000]);
});

test("retries transient network failures without leaking error details", async () => {
  let fetchCalls = 0;

  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;

    if (fetchCalls === 1) {
      throw new Error("network secret should not escape");
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAiOutput) }]
            }
          }
        ]
      }),
      { status: 200 }
    );
  };

  const result = await generateAiInterpretation(
    reportFixture(),
    {
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-3.8-flash",
      timeoutMs: 5_000
    },
    fakeFetch,
    undefined,
    {
      sleep: async () => undefined,
      random: () => 0
    }
  );

  assert.equal(fetchCalls, 2);
  assert.equal(result.interpretation.themes.length, 1);
});

test("stops retrying when the provider asks for an excessive delay", async () => {
  let fetchCalls = 0;

  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        error: { status: "slow_down" }
      }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" }
      }
    );
  };

  await assert.rejects(
    () =>
      generateAiInterpretation(
        reportFixture(),
        {
          apiKey: "test-key",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          model: "gemini-3.8-flash",
          timeoutMs: 5_000
        },
        fakeFetch,
        undefined,
        {
          sleep: async () => undefined,
          random: () => 0
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AiInterpretationProviderError);
      assert.match(
        (error as Error).message,
        /retry delay is outside the configured limit/
      );
      return true;
    }
  );

  assert.equal(fetchCalls, 1);
});

test("requires an AI API key", () => {
  assert.throws(
    () =>
      readAiProviderConfig({
        AI_API_KEY: "",
        AI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta"
      }),
    /AI interpretation is not configured/
  );
});
