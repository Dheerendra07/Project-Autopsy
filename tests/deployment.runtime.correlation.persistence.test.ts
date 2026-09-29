import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

const DATABASE_AVAILABLE = Boolean(process.env.DATABASE_URL);

test(
  "deployment runtime reconciliation joins exact deployment identity without timestamp inference",
  { skip: !DATABASE_AVAILABLE },
  async () => {
    const { db } = await import("../src/config/database.js");
    const { prepareDeploymentEvidenceBatch } = await import(
      "../src/modules/deployments/deployment.service.js"
    );
    const { insertDeploymentEvidenceBatch } = await import(
      "../src/modules/deployments/deployment.persistence.js"
    );
    const { prepareRuntimeTelemetryBatch } = await import(
      "../src/modules/runtime/runtime.service.js"
    );
    const { insertRuntimeTelemetryBatch } = await import(
      "../src/modules/runtime/runtime.persistence.js"
    );
    const { generateDeploymentRuntimeCorrelation } = await import(
      "../src/modules/runtime/deployment-runtime-correlation.service.js"
    );

    const repositoryId = randomUUID();
    const revisionSha = "a".repeat(40);
    const occurredAt = new Date("2026-09-29T03:00:00.000Z");

    try {
      await db.query(
        "INSERT INTO repositories (id, source_type, name) VALUES ($1, 'github', 'deployment-runtime-test')",
        [repositoryId]
      );

      const deploymentEvents = prepareDeploymentEvidenceBatch(
        {
          events: [
            {
              eventId: "deployment-runtime-001",
              occurredAt: occurredAt.toISOString(),
              provider: "github-actions",
              deploymentId: "deployment-123",
              environment: "production",
              state: "succeeded",
              revisionSha,
              artifactDigest: "sha256:" + "b".repeat(64),
              buildId: "build-123",
              releaseId: "release-123",
              metadata: {
                workflow: "deploy.yml"
              }
            }
          ]
        },
        occurredAt
      );

      await insertDeploymentEvidenceBatch(repositoryId, deploymentEvents);

      const runtimeEvents = prepareRuntimeTelemetryBatch(
        {
          events: [
            {
              eventId: "deployment-runtime-telemetry-001",
              observedAt: new Date(
                occurredAt.getTime() + 30_000
              ).toISOString(),
              signalType: "http",
              serviceName: "api",
              operationName: "GET /health",
              environment: "production",
              deploymentId: "deployment-123",
              revisionSha,
              durationMs: 120,
              status: "ok",
              httpStatusCode: 200,
              attributes: {}
            }
          ]
        },
        new Date(occurredAt.getTime() + 60_000)
      );

      await insertRuntimeTelemetryBatch(repositoryId, runtimeEvents);

      const result = await generateDeploymentRuntimeCorrelation(
        repositoryId,
        "deployment-123"
      );

      assert.equal(result.status, "linked");
      assert.equal(result.deploymentEvidence.eventCount, 1);
      assert.equal(result.runtimeEvidence.sampleCount, 1);
      assert.deepEqual(result.runtimeEvidence.revisionShas, [revisionSha]);
      assert.deepEqual(
        result.runtimeEvidence.environments,
        ["production"]
      );
      assert.equal(result.consistency.revision, "consistent");
      assert.equal(result.consistency.environment, "consistent");
      assert.equal(result.deploymentEvidence.recentEvents.length, 1);
      assert.equal(
        result.deploymentEvidence.recentEvents[0]?.eventId,
        "deployment-runtime-001"
      );
    } finally {
      await db.query("DELETE FROM repositories WHERE id = $1", [
        repositoryId
      ]);
      await db.end();
    }
  }
);
