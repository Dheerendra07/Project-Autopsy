import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

const DATABASE_AVAILABLE = Boolean(process.env.DATABASE_URL);

test(
  "runtime correlation aligns parent and target revisions with explicit readiness",
  { skip: !DATABASE_AVAILABLE },
  async () => {
    const { db } = await import("../src/config/database.js");
    const {
      insertRuntimeTelemetryBatch
    } = await import("../src/modules/runtime/runtime.persistence.js");
    const {
      prepareRuntimeTelemetryBatch
    } = await import("../src/modules/runtime/runtime.service.js");
    const {
      generateRuntimeCorrelationEvidence
    } = await import("../src/modules/runtime/correlation.service.js");

    const repositoryId = randomUUID();
    const parentSha = "1".repeat(40);
    const targetSha = "2".repeat(40);
    const commitAt = new Date("2026-09-29T03:00:00.000Z");

    try {
      await db.query(
        "INSERT INTO repositories (id, source_type, name) VALUES ($1, 'github', 'correlation-test')",
        [repositoryId]
      );

      await db.query(
        "INSERT INTO commits (repository_id, sha, subject, committed_at) VALUES ($1, $2, $3, $4)",
        [repositoryId, parentSha, "parent", new Date(commitAt.getTime() - 60_000)]
      );

      await db.query(
        "INSERT INTO commits (repository_id, sha, subject, committed_at, parent_shas) VALUES ($1, $2, $3, $4, $5)",
        [repositoryId, targetSha, "target", commitAt, [parentSha]]
      );

      const events = prepareRuntimeTelemetryBatch(
        {
          events: [
            {
              eventId: "correlation-baseline-1",
              observedAt: new Date(commitAt.getTime() - 30_000).toISOString(),
              signalType: "http",
              serviceName: "api",
              operationName: "GET /items",
              environment: "test",
              revisionSha: parentSha,
              durationMs: 100,
              status: "ok",
              httpStatusCode: 200,
              attributes: {}
            },
            {
              eventId: "correlation-target-1",
              observedAt: new Date(commitAt.getTime() + 30_000).toISOString(),
              signalType: "http",
              serviceName: "api",
              operationName: "GET /items",
              environment: "test",
              revisionSha: targetSha,
              durationMs: 140,
              status: "ok",
              httpStatusCode: 200,
              attributes: {}
            }
          ]
        },
        new Date(commitAt.getTime() + 120_000)
      );

      await insertRuntimeTelemetryBatch(repositoryId, events);

      const evidence = await generateRuntimeCorrelationEvidence(
        repositoryId,
        targetSha,
        5,
        1,
        {
          environment: "test",
          operationName: "GET /items",
          signalType: "http"
        }
      );

      assert.equal(evidence.status, "ready");
      assert.equal(evidence.parentRevisionSha, parentSha);
      assert.equal(evidence.baseline?.aggregate.sampleCount, 1);
      assert.equal(evidence.target?.aggregate.sampleCount, 1);
      assert.equal(evidence.observedDelta.avgDurationMs, 40);
      assert.equal(evidence.observedDelta.errorRate, 0);
      assert.equal(
        evidence.evidencePolicy.some((item) => /does not establish/i.test(item)),
        true
      );
    } finally {
      await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
      await db.end();
    }
  }
);
