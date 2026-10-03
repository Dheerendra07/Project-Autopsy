import assert from "node:assert/strict";
import test from "node:test";

import {
  AiInterpretationNotConfiguredError,
  readAiProviderConfig
} from "../src/modules/interpretation/interpretation.service.js";

const key = "a".repeat(48);

test("accepts HTTPS AI provider URLs", () => {
  const config = readAiProviderConfig({
    AI_API_KEY: key,
    AI_BASE_URL: "https://api.example.com/v1",
    AI_MODEL: "gemini-3.8-flash",
    AI_TIMEOUT_MS: "30000"
  });

  assert.equal(config.baseUrl, "https://api.example.com/v1");
  assert.equal(config.model, "gemini-3.8-flash");
  assert.equal(config.timeoutMs, 30_000);
});

test("allows localhost HTTP for development", () => {
  for (const baseUrl of [
    "http://localhost:8080/v1",
    "http://127.0.0.1:8080/v1"
  ]) {
    assert.doesNotThrow(() =>
      readAiProviderConfig({
        AI_API_KEY: key,
        AI_BASE_URL: baseUrl
      })
    );
  }
});

test("rejects credentials, query strings and fragments in AI base URLs", () => {
  for (const baseUrl of [
    "https://user:password@example.com/v1",
    "https://example.com/v1?tenant=prod",
    "https://example.com/v1#fragment",
    "http://example.com/v1"
  ]) {
    assert.throws(
      () =>
        readAiProviderConfig({
          AI_API_KEY: key,
          AI_BASE_URL: baseUrl
        }),
      AiInterpretationNotConfiguredError
    );
  }
});

test("requires a non-empty AI provider key", () => {
  assert.throws(
    () =>
      readAiProviderConfig({
        AI_API_KEY: "   "
      }),
    AiInterpretationNotConfiguredError
  );
});
