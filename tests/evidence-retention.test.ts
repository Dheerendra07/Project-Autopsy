import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_RETENTION_BATCH_SIZE,
  getEvidenceRetentionCutoff
} from "../src/modules/evidence-retention.service.js";

test("evidence retention cutoff defaults to 365 days", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  const cutoff = getEvidenceRetentionCutoff(now);
  assert.equal(cutoff.toISOString(), "2025-10-01T12:00:00.000Z");
});

test("evidence retention policy accepts only 30 through 365 days", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(
    getEvidenceRetentionCutoff(now, 30).toISOString(),
    "2026-09-01T12:00:00.000Z"
  );
  assert.equal(
    getEvidenceRetentionCutoff(now, 365).toISOString(),
    "2025-10-01T12:00:00.000Z"
  );
  for (const days of [29, 366, 30.5, Number.NaN]) {
    assert.throws(
      () => getEvidenceRetentionCutoff(now, days),
      /Evidence retention days/
    );
  }
});

test("retention cutoff rejects invalid dates", () => {
  assert.throws(
    () => getEvidenceRetentionCutoff(new Date("not-a-date")),
    /valid date/
  );
});

test("retention deletion uses a bounded batch size", () => {
  assert.equal(EVIDENCE_RETENTION_BATCH_SIZE, 5_000);
  assert.ok(EVIDENCE_RETENTION_BATCH_SIZE <= 5_000);
});
