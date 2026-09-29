import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeploymentProvenanceAssessment
} from "../src/modules/deployments/deployment-provenance.service.js";

function summary(overrides: Record<string, unknown> = {}) {
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
    ...overrides
  };
}

test("marks a fully populated consistent deployment as complete", () => {
  const result = buildDeploymentProvenanceAssessment(
    "repo-1",
    "deployment-1",
    summary()
  );

  assert.equal(result.status, "complete");
  assert.equal(result.evidence.succeededObserved, true);
  assert.deepEqual(result.consistency, {
    environment: "consistent",
    revision: "consistent",
    artifact: "consistent",
    build: "consistent",
    release: "consistent"
  });
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.conflicts, []);
});

test("marks missing provenance identifiers as partial", () => {
  const result = buildDeploymentProvenanceAssessment(
    "repo-1",
    "deployment-1",
    summary({
      artifactDigests: [],
      buildIds: [],
      releaseIds: []
    })
  );

  assert.equal(result.status, "partial");
  assert.equal(result.consistency.artifact, "partial");
  assert.equal(result.consistency.build, "partial");
  assert.equal(result.consistency.release, "partial");
  assert.match(result.gaps.join(" "), /artifact digest/i);
  assert.match(result.gaps.join(" "), /build ID/i);
  assert.match(result.gaps.join(" "), /release ID/i);
});

test("marks conflicting observed identities instead of choosing one", () => {
  const result = buildDeploymentProvenanceAssessment(
    "repo-1",
    "deployment-1",
    summary({
      revisionShas: ["a".repeat(40), "c".repeat(40)],
      artifactDigests: [
        "sha256:" + "b".repeat(64),
        "sha256:" + "d".repeat(64)
      ]
    })
  );

  assert.equal(result.status, "conflicting");
  assert.equal(result.consistency.revision, "conflicting");
  assert.equal(result.consistency.artifact, "conflicting");
  assert.equal(result.conflicts.length, 2);
});

test("does not treat failed-only deployment evidence as complete", () => {
  const result = buildDeploymentProvenanceAssessment(
    "repo-1",
    "deployment-1",
    summary({
      states: ["failed"]
    })
  );

  assert.equal(result.status, "partial");
  assert.equal(result.evidence.succeededObserved, false);
  assert.match(result.gaps.join(" "), /succeeded deployment event/i);
});

test("distinguishes absent deployment evidence from partial provenance", () => {
  const result = buildDeploymentProvenanceAssessment(
    "repo-1",
    "deployment-unknown",
    summary({
      eventCount: 0,
      firstOccurredAt: null,
      lastOccurredAt: null,
      states: [],
      environments: [],
      revisionShas: [],
      artifactDigests: [],
      buildIds: [],
      releaseIds: []
    })
  );

  assert.equal(result.status, "deployment_evidence_not_found");
  assert.match(result.evidencePolicy.join(" "), /does not establish/i);
});

test("rejects an empty deployment ID", async () => {
  await assert.rejects(
    () =>
      import("../src/modules/deployments/deployment-provenance.service.js")
        .then(({ generateDeploymentProvenanceAssessment }) =>
          generateDeploymentProvenanceAssessment("repo-1", "   ")
        ),
    /deploymentId must not be empty/
  );
});
