test("enforces configured access keys with constant-time credential comparison", () => {
  assert.equal(
    isAiInterpretationAuthorized(
      undefined,
      "wrong-key",
      "correct-access-key",
      "production"
    ),
    false
  );
  assert.equal(
    isAiInterpretationAuthorized(
      undefined,
      "correct-access-key",
      "correct-access-key",
      "production"
    ),
    true
  );
  assert.equal(
    isAiInterpretationAuthorized(
      "Bearer correct-access-key",
      undefined,
      "correct-access-key",
      "production"
    ),
    true
  );
});

test("uses a cached interpretation without calling the provider", async () => {
  const report = reportFixture();
  const cachedResult = {
    interpretationVersion: "1.0" as const,
    provider: "openai" as const,
    model: "gpt-5.6-luna",
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
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-luna",
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
        status: "completed",
        output_text: JSON.stringify(validAiOutput)
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  const result = await generateAiInterpretation(
    report,
    {
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-luna",
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
        status: "completed",
        output_text: JSON.stringify(validAiOutput)
      }),
      { status: 200 }
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
    fakeFetch,
    cache
  );

  assert.equal(fetchCalls, 1);
  assert.equal(result.cacheHit, false);
});

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

test("retries temporary rate limits and overloads with bounded backoff", async () => {
  let fetchCalls = 0;
  const retryDelays: number[] = [];

  const fakeFetch: typeof fetch = async () => {
    fetchCalls += 1;

    if (fetchCalls === 1) {
      return new Response(
        JSON.stringify({
          error: { code: "slow_down" }
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
          error: { code: "server_is_overloaded" }
        }),
        {
          status: 503,
          headers: { "content-type": "application/json", "retry-after": "0" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "completed",
        output_text: JSON.stringify(validAiOutput)
      }),
      { status: 200 }
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
        error: { code: "credit_balance_exhausted" }
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
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
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
          error: { code: "slow_down" }
        }),
        {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "2" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "completed",
        output_text: JSON.stringify(validAiOutput)
      }),
      { status: 200 }
    );
  };

  await generateAiInterpretation(
    reportFixture(),
    {
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-luna",
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
        status: "completed",
        output_text: JSON.stringify(validAiOutput)
      }),
      { status: 200 }
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
        error: { code: "slow_down" }
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
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
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
        AI_BASE_URL: "https://api.openai.com/v1"
      }),
    /AI interpretation is not configured/
  );
});
