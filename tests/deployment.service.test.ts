import assert from "node:assert/strict";
import test from "node:test";

import { deploymentEvidenceEventSchema } from "../src/modules/deployments/deployment.types.js";

const REVISION = "abcdef1234567890abcdef1234567890abcdef12";

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "deploy-001",
    occurredAt: "2026-09-29T00:00:00.000Z",
    provider: "github-actions",
    deploymentId: "deployment-001",
    environment: "production",
    state: "succeeded",
    revisionSha: REVISION,
    metadata: {},
    ...overrides
  };
}

test("normalizes uppercase Git revision identity in deployment evidence", () => {
  const event = deploymentEvidenceEventSchema.parse(
    validEvent({
      revisionSha: REVISION.toUpperCase()
    })
  );

  assert.equal(event.revisionSha, REVISION);
});

test("preserves valid full-length SHA-256-style commit revisions", () => {
  const sha256 = "a".repeat(64);
  const event = deploymentEvidenceEventSchema.parse(
    validEvent({ revisionSha: sha256 })
  );

  assert.equal(event.revisionSha, sha256);
});

test("rejects abbreviated deployment revision identities", () => {
  assert.throws(() =>
    deploymentEvidenceEventSchema.parse(
      validEvent({ revisionSha: REVISION.slice(0, 12) })
    )
  );
});
