import assert from "node:assert/strict";
import test from "node:test";

import { buildDeploymentRuntimeCorrelation } from "../src/modules/runtime/deployment-runtime-correlation.service.js";

function deploymentEvidence(overrides: Record<string, unknown> = {}) {
  return {
    eventCount: 1,
    firstOccurredAt: "2026-09-29T03:00:00.000Z",
    lastOccurredAt: "2026-09-29T03:00:01.000Z",
    states: ["succeeded"],
    environments: ["production"],
    revisionShas: ["a".repeat(40)],
    artifactDigests: ["sha256:" + "b".repeat(64)],
    buildIds: ["build-1"],
    releaseIds: ["release-1"],
    recentEvents: [],
    ...overrides
  };
}

function runtimeEvidence(overrides: Record<string, unknown> = {}) {
  return {
    sampleCount: 10,
    errorCount: 1,
    errorRate: 0.1,
    firstObservedAt: "2026-09-29T03:00:10.000Z",
    lastObservedAt: "2026-09-29T03:05:10.000Z",
    revisionShas: ["a".repeat(40)],
    environments: ["production"],
    ...overrides
  };
}

test("marks explicit deployment/runtime identity as linked", () => {
  const result = buildDeploymentRuntimeCorrelation(
    "repo-1",
    "deployment-1",
    deploymentEvidence(),
    runtimeEvidence()
  );

  assert.equal(result.status, "linked");
  assert.equal(result.consistency.revision, "consistent");
  assert.equal(result.consistency.environment, "consistent");
});

test("reports missing deployment evidence without inferring absence", () => {
  const result = buildDeploymentRuntimeCorrelation(
    "repo-1",
    "deployment-unknown",
    deploymentEvidence({
      eventCount: 0,
      firstOccurredAt: null,
      lastOccurredAt: null,
      states: [],
      environments: [],
      revisionShas: [],
      artifactDigests: [],
      buildIds: [],
      releaseIds: []
    }),
    runtimeEvidence()
  );

  assert.equal(result.status, "deployment_evidence_not_found");
  assert.match(result.evidencePolicy.join(" "), /does not establish/i);
});

test("reports missing linked runtime evidence separately", () => {
  const result = buildDeploymentRuntimeCorrelation(
    "repo-1",
    "deployment-1",
    deploymentEvidence(),
    runtimeEvidence({
      sampleCount: 0,
      errorCount: 0,
      errorRate: 0,
      firstObservedAt: null,
      lastObservedAt: null,
      revisionShas: [],
      environments: []
    })
  );

  assert.equal(result.status, "runtime_evidence_not_found");
});

test("distinguishes partial identity evidence from a hard conflict", () => {
  const partial = buildDeploymentRuntimeCorrelation(
    "repo-1",
    "deployment-1",
    deploymentEvidence({
      revisionShas: ["a".repeat(40), "c".repeat(40)]
    }),
    runtimeEvidence({
      revisionShas: ["a".repeat(40), "d".repeat(40)]
    })
  );

  assert.equal(partial.status, "linked");
  assert.equal(partial.consistency.revision, "partial");

  const conflict = buildDeploymentRuntimeCorrelation(
    "repo-1",
    "deployment-1",
    deploymentEvidence({
      revisionShas: ["c".repeat(40)]
    }),
    runtimeEvidence({
      revisionShas: ["d".repeat(40)]
    })
  );

  assert.equal(conflict.status, "conflicting_revision_evidence");
  assert.equal(conflict.consistency.revision, "conflicting");
});

test("reports combined identity conflicts explicitly", () => {
  const result = buildDeploymentRuntimeCorrelation(
    "repo-1",
    "deployment-1",
    deploymentEvidence({
      environments: ["production"],
      revisionShas: ["a".repeat(40)]
    }),
    runtimeEvidence({
      environments: ["staging"],
      revisionShas: ["b".repeat(40)]
    })
  );

  assert.equal(result.status, "conflicting_identity_evidence");
  assert.equal(result.consistency.revision, "conflicting");
  assert.equal(result.consistency.environment, "conflicting");
});
