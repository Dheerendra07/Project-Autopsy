import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

const DATABASE_AVAILABLE = Boolean(process.env.DATABASE_URL);

test(
  "runtime telemetry persistence is idempotent, atomic, filterable, and aggregatable",
  { skip: !DATABASE_AVAILABLE },
  async () => {
    const { db } = await import("../src/config/database.js");
    const {
      RuntimeTelemetryEventConflictError,
      insertRuntimeTelemetryBatch,
      listRuntimeTelemetryEvents,
      summarizeRuntimeTelemetry
    } = await import("../src/modules/runtime/runtime.persistence.js");
    const {
      prepareRuntimeTelemetryBatch
    } = await import("../src/modules/runtime/runtime.service.js");

    const repositoryId = randomUUID();
    const revisionSha = "0123456789abcdef0123456789abcdef01234567";
    const otherRevisionSha = "fedcba9876543210fedcba9876543210fedcba98";
    const now = new Date("2026-09-29T03:00:00.000Z");

    try {
      await db.query(
        `INSERT INTO repositories (id, source_type, name)
         VALUES ($1, 'github', 'runtime-test')`,
        [repositoryId]
      );

      await db.query(
        `INSERT INTO commits (repository_id, sha, subject)
         VALUES ($1, $2, 'runtime telemetry integration test')`,
        [repositoryId, revisionSha]
      );

      const firstEvents = prepareRuntimeTelemetryBatch(
        {
          events: [
            {
              eventId: "integration-001",
              observedAt: now.toISOString(),
              signalType: "http",
              serviceName: "api",
              operationName: "GET /health",
              environment: "test",
              deploymentId: "deployment-123",
              revisionSha,
              traceId: "0123456789abcdef0123456789abcdef",
              spanId: "0123456789abcdef",
              durationMs: 100,
              status: "ok",
              httpStatusCode: 200,
              attributes: {
                route: "/health"
              }
            }
          ]
        },
        now
      );

      assert.deepEqual(
        await insertRuntimeTelemetryBatch(repositoryId, firstEvents),
        { accepted: 1, duplicates: 0 }
      );

      assert.deepEqual(
        await insertRuntimeTelemetryBatch(repositoryId, firstEvents),
        { accepted: 0, duplicates: 1 }
      );

      const conflicting = prepareRuntimeTelemetryBatch(
        {
          events: [
            {
              ...firstEvents[0],
              eventId: "integration-001",
              durationMs: 101
            }
          ]
        },
        now
      );

      await assert.rejects(
        insertRuntimeTelemetryBatch(repositoryId, conflicting),
        (error) => error instanceof RuntimeTelemetryEventConflictError
      );

      const extraEvents = prepareRuntimeTelemetryBatch(
        {
          events: [
            {
              eventId: "integration-002",
              observedAt: new Date(now.getTime() + 1_000).toISOString(),
              signalType: "http",
              serviceName: "api",
              operationName: "GET /health",
              environment: "test",
              revisionSha,
              durationMs: 200,
              status: "ok",
              httpStatusCode: 200,
              attributes: {}
            },
            {
              eventId: "integration-003",
              observedAt: new Date(now.getTime() + 2_000).toISOString(),
              signalType: "external",
              serviceName: "worker",
              operationName: "payments.lookup",
              environment: "test",
              revisionSha: otherRevisionSha,
              durationMs: 400,
              status: "error",
              errorType: "UpstreamTimeout",
              attributes: {}
            }
          ]
        },
        now
      );

      await db.query(
        `INSERT INTO commits (repository_id, sha, subject)
         VALUES ($1, $2, 'second runtime telemetry revision')`,
        [repositoryId, otherRevisionSha]
      );

      assert.deepEqual(
        await insertRuntimeTelemetryBatch(repositoryId, extraEvents),
        { accepted: 2, duplicates: 0 }
      );

      const atomicFailureBatch = prepareRuntimeTelemetryBatch(
        {
          events: [
            {
              eventId: "integration-004",
              observedAt: new Date(now.getTime() + 3_000).toISOString(),
              signalType: "job",
              serviceName: "worker",
              operationName: "rebuild.index",
              environment: "test",
              revisionSha,
              durationMs: 50,
              status: "ok",
              attributes: {}
            },
            { ...conflicting[0] }
          ]
        },
        now
      );

      await assert.rejects(
        insertRuntimeTelemetryBatch(repositoryId, atomicFailureBatch),
        (error) => error instanceof RuntimeTelemetryEventConflictError
      );

      const storedAfterAtomicFailure = await db.query<{ event_id: string }>(
        `SELECT event_id
         FROM runtime_telemetry_events
         WHERE repository_id = $1
           AND event_id = 'integration-004'`,
        [repositoryId]
      );

      assert.equal(storedAfterAtomicFailure.rowCount, 0);

      const listed = await listRuntimeTelemetryEvents(
        repositoryId,
        1,
        10,
        {
          operationName: "GET /health",
          environment: "test"
        }
      );

      assert.equal(listed.total, 2);
      assert.equal(listed.events.length, 2);
      assert.equal(listed.events[0]?.deployment_id, "deployment-123");
      assert.ok(
        listed.events.every((event) => event.operation_name === "GET /health")
      );

      const deploymentRows = await listRuntimeTelemetryEvents(
        repositoryId,
        1,
        10,
        { deploymentId: "deployment-123" }
      );

      assert.equal(deploymentRows.total, 1);
      assert.equal(deploymentRows.events[0]?.deployment_id, "deployment-123");

      const summary = await summarizeRuntimeTelemetry(
        repositoryId,
        { environment: "test" },
        "revision",
        10
      );

      assert.equal(summary.overall.sampleCount, 3);
      assert.equal(summary.overall.durationSampleCount, 3);
      assert.equal(summary.overall.errorCount, 1);
      assert.equal(summary.overall.errorRate, 1 / 3);
      assert.equal(summary.overall.minDurationMs, 100);
      assert.equal(summary.overall.maxDurationMs, 400);
      assert.equal(summary.groups.length, 2);

      const knownRevisionGroup = summary.groups.find(
        (group) => group.key === revisionSha
      );
      const otherRevisionGroup = summary.groups.find(
        (group) => group.key === otherRevisionSha
      );

      assert.ok(knownRevisionGroup);
      assert.equal(knownRevisionGroup.revisionKnown, true);
      assert.equal(knownRevisionGroup.sampleCount, 2);
      assert.equal(knownRevisionGroup.p50DurationMs, 150);

      assert.ok(otherRevisionGroup);
      assert.equal(otherRevisionGroup.revisionKnown, true);
      assert.equal(otherRevisionGroup.sampleCount, 1);
      assert.equal(otherRevisionGroup.errorCount, 1);
    } finally {
      await db.query(
        "DELETE FROM repositories WHERE id = $1",
        [repositoryId]
      );
      await db.end();
    }
  }
);
