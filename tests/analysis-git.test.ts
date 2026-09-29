import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../src/config/env.js";
import { ANALYSIS_GIT_TIMEOUT_MS } from "../src/modules/analysis/analysis-git.js";

test("analysis Git timeout follows the configured analysis budget", () => {
  assert.equal(
    ANALYSIS_GIT_TIMEOUT_MS,
    env.MAX_ANALYSIS_TIME_MINUTES * 60 * 1000
  );
  assert.equal(Number.isFinite(ANALYSIS_GIT_TIMEOUT_MS), true);
  assert.ok(ANALYSIS_GIT_TIMEOUT_MS > 0);
});
