import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PUBLIC_ANALYSIS_ERROR_LENGTH,
  sanitizePublicAnalysisErrorMessage
} from "../src/modules/analysis/analysis-error.js";

test("analysis error sanitizer masks managed paths and normalizes control characters", () => {
  const message = sanitizePublicAnalysisErrorMessage(
    "git failed\nwhile reading /workspace/autopsy/repositories/abc/.git\tplease retry",
    "/workspace/autopsy/repositories/abc"
  );

  assert.equal(
    message,
    "git failed while reading <managed-path>/.git please retry"
  );
});

test("analysis error sanitizer bounds oversized diagnostics", () => {
  const message = sanitizePublicAnalysisErrorMessage(
    "x".repeat(MAX_PUBLIC_ANALYSIS_ERROR_LENGTH + 500),
    "/workspace/autopsy/repositories/abc"
  );

  assert.equal(message?.length, MAX_PUBLIC_ANALYSIS_ERROR_LENGTH);
  assert.equal(message?.endsWith("…"), true);
});

test("analysis error sanitizer handles missing messages without throwing", () => {
  assert.equal(
    sanitizePublicAnalysisErrorMessage(null, "/workspace/autopsy/repositories/abc"),
    null
  );
});
