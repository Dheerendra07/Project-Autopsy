import assert from "node:assert/strict";
import test from "node:test";

import type { StoredRepeatedlyModifiedFile } from "../src/modules/metrics/change-patterns.persistence.js";

test("repeatedly modified file result has an explicit historical shape", () => {
  const result: StoredRepeatedlyModifiedFile = {
    path: "src/service.ts",
    commits_touched: 4,
    additions: 30,
    deletions: 12,
    binary_changes: 0,
    total_churn: 42,
    first_changed_at: "2026-01-01T10:00:00.000Z",
    last_changed_at: "2026-02-01T10:00:00.000Z",
    change_span_days: 31
  };

  assert.equal(result.commits_touched, 4);
  assert.equal(result.total_churn, 42);
  assert.equal(result.change_span_days, 31);
  assert.equal(result.binary_changes, 0);
});
