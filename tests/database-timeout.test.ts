import assert from "node:assert/strict";
import test from "node:test";

import { DATABASE_QUERY_TIMEOUT_MS } from "../src/config/database.js";

test("PostgreSQL query timeout is finite and bounded", () => {
  assert.equal(Number.isInteger(DATABASE_QUERY_TIMEOUT_MS), true);
  assert.equal(DATABASE_QUERY_TIMEOUT_MS, 120_000);
  assert.ok(DATABASE_QUERY_TIMEOUT_MS >= 1_000);
  assert.ok(DATABASE_QUERY_TIMEOUT_MS <= 120_000);
});
