import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import {
  DEPLOYMENT_EVIDENCE_MAX_FUTURE_SKEW_MS,
  DEPLOYMENT_EVIDENCE_MAX_PAST_AGE_MS,
  DeploymentEvidenceValidationError,
  hashDeploymentEvidenceEvent,
  prepareDeploymentEvidenceBatch
} from "../src/modules/deployments/deployment.service.js";
import { deploymentEvidenceBatchSchema } from "../src/modules/deployments/deployment.types.js";
import { isDeploymentEvidenceAuthorized } from "../src/modules/deployments/deployment.auth.js";

const NOW = new Date("2026-09-29T00:00:00.000Z");

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "deploy-evt-001",
    occurredAt: NOW.toISOString(),
    provider: "github-actions",
    deploymentId: "deployment-123",
    environment: "production",
    state: "succeeded",
    revisionSha: "abcdef1234567890abcdef1234567890abcdef12",
    artifactDigest: "sha256:" + "a".repeat(64),
    buildId: "run-123",
    releaseId: "release-2026.09.29",
    metadata: {
      workflow: "deploy.yml"
    },
    ...overrides
  };
}

test("hash is deterministic across metadata key ordering", () => {
  const first = deploymentEvidenceBatchSchema.parse({ events: [validEvent()] }).events[0];
  const second = deploymentEvidenceBatchSchema.parse({
    events: [
      validEvent({
        metadata: {
          workflow: "deploy.yml"
        }
      })
    ]
  }).events[0];

  assert.equal(hashDeploymentEvidenceEvent(first), hashDeploymentEvidenceEvent(second));
});

test("requires full revision and valid artifact digest when supplied", () => {
  assert.throws(() => deploymentEvidenceBatchSchema.parse({
    events: [validEvent({ revisionSha: "a".repeat(39) })]
  }));
  assert.throws(() => deploymentEvidenceBatchSchema.parse({
    events: [validEvent({ artifactDigest: "sha256:abc" })]
  }));
});

test("rejects duplicate event ids inside one batch", () => {
  assert.throws(
    () => prepareDeploymentEvidenceBatch(
      { events: [validEvent(), validEvent({ deploymentId: "deployment-456" })] },
      NOW
    ),
    (error) => error instanceof DeploymentEvidenceValidationError && error.field === "events"
  );
});

test("rejects events outside the accepted clock window", () => {
  const future = new Date(NOW.getTime() + DEPLOYMENT_EVIDENCE_MAX_FUTURE_SKEW_MS + 1);
  const past = new Date(NOW.getTime() - DEPLOYMENT_EVIDENCE_MAX_PAST_AGE_MS - 1);

  assert.throws(
    () => prepareDeploymentEvidenceBatch({ events: [validEvent({ occurredAt: future.toISOString() })] }, NOW),
    (error) => error instanceof DeploymentEvidenceValidationError && error.field === "occurredAt"
  );
  assert.throws(
    () => prepareDeploymentEvidenceBatch({ events: [validEvent({ occurredAt: past.toISOString() })] }, NOW),
    (error) => error instanceof DeploymentEvidenceValidationError && error.field === "occurredAt"
  );
});

test("preparation produces canonical timestamp and payload hash", () => {
  const [event] = prepareDeploymentEvidenceBatch({ events: [validEvent()] }, NOW);
  assert.ok(event);
  assert.equal(event.occurredAtIso, NOW.toISOString());
  assert.match(event.payloadHash, /^[0-9a-f]{64}$/);
});

test("rejects credential-like keys even when nested", () => {
  assert.throws(() =>
    deploymentEvidenceBatchSchema.parse({
      events: [
        validEvent({
          metadata: {
            workflow: {
              token: "should-not-be-stored"
            }
          }
        })
      ]
    })
  );
});

test("rejects unknown event fields", () => {
  assert.throws(() =>
    deploymentEvidenceBatchSchema.parse({
      events: [
        validEvent({
          unexpected: "value"
        })
      ]
    })
  );
});

test("metadata is bounded and JSON serializable", () => {
  assert.throws(() => deploymentEvidenceBatchSchema.parse({
    events: [validEvent({ metadata: { payload: "x".repeat(9_000) } })]
  }));

  assert.throws(() => deploymentEvidenceBatchSchema.parse({
    events: [validEvent({ metadata: { payload: BigInt(1) } })]
  }), z.ZodError);
});

test("development permits unconfigured deployment ingestion", () => {
  assert.equal(isDeploymentEvidenceAuthorized(undefined, undefined, undefined, "development"), true);
});

test("production requires a configured deployment ingestion key", () => {
  assert.equal(isDeploymentEvidenceAuthorized(undefined, undefined, undefined, "production"), false);
  assert.equal(isDeploymentEvidenceAuthorized(
    "Bearer correct-key",
    undefined,
    "correct-key",
    "production"
  ), true);
  assert.equal(isDeploymentEvidenceAuthorized(
    "Bearer wrong-key",
    undefined,
    "correct-key",
    "production"
  ), false);
});

test("header deployment key takes precedence over bearer fallback", () => {
  assert.equal(isDeploymentEvidenceAuthorized(
    "Bearer wrong-key",
    "correct-key",
    "correct-key",
    "production"
  ), true);
});
