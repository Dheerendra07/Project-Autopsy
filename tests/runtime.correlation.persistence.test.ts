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

      const targetCommitResult = await db.query<{ id: string }>(
        "INSERT INTO commits (repository_id, sha, subject, committed_at, parent_shas, files_changed, additions, deletions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [
          repositoryId,
          targetSha,
          "target",
          commitAt,
          JSON.stringify([parentSha]),
          2,
          32,
          5
        ]
      );

      const targetCommitId = targetCommitResult.rows[0]?.id;
      assert.ok(targetCommitId);

      await db.query(
        "INSERT INTO commit_files (commit_id, path, status, additions, deletions) VALUES ($1, $2, $3, $4, $5), ($1, $6, $7, $8, $9)",
        [
          targetCommitId,
          "src/runtime/handler.ts",
          "modified",
          20,
          5,
          "src/runtime/types.ts",
          "added",
          12,
          0
        ]
      );

      const events = prepareRuntimeTelemetryBatch(
        {
          events: [
            {
              eventId: "correlation-target-other-deployment",
              observedAt: new Date(commitAt.getTime() + 45_000).toISOString(),
              signalType: "http",
              serviceName: "api",
              operationName: "GET /items",
              environment: "test",
              deploymentId: "deployment-other",
              revisionSha: targetSha,
              durationMs: 900,
              status: "ok",
              httpStatusCode: 200,
              attributes: {}
            },
            {
              eventId: "correlation-baseline-1",
              observedAt: new Date(commitAt.getTime() - 30_000).toISOString(),
              signalType: "http",
              serviceName: "api",
              operationName: "GET /items",
              environment: "test",
              deploymentId: "deployment-123",
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
              deploymentId: "deployment-123",
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

      const deploymentScopedEvidence =
        await generateRuntimeCorrelationEvidence(
          repositoryId,
          targetSha,
          5,
          1,
          {
            deploymentId: "deployment-123",
            environment: "test",
            operationName: "GET /items",
            signalType: "http"
          }
        );

      assert.equal(deploymentScopedEvidence.status, "ready");
      assert.equal(
        deploymentScopedEvidence.baseline?.aggregate.sampleCount,
        1
      );
      assert.equal(
        deploymentScopedEvidence.target?.aggregate.sampleCount,
        1
      );
      assert.equal(
        deploymentScopedEvidence.target?.aggregate.avgDurationMs,
        140
      );

      assert.equal(evidence.status, "ready");
      assert.equal(evidence.parentRevisionSha, parentSha);
      assert.deepEqual(evidence.changeContext, {
        commitSha: targetSha,
        subject: "target",
        committedAt: commitAt.toISOString(),
        parentRevisionSha: parentSha,
        filesChanged: 2,
        additions: 32,
        deletions: 5,
        changedFiles: [
          {
            path: "src/runtime/handler.ts",
            status: "modified",
            additions: 20,
            deletions: 5
          },
          {
            path: "src/runtime/types.ts",
            status: "added",
            additions: 12,
            deletions: 0
          }
        ],
        changedFilesTruncated: false,
        changedFilesComplete: true
      });
      assert.equal(evidence.baseline?.aggregate.sampleCount, 1);
      assert.equal(evidence.target?.aggregate.sampleCount, 1);
      assert.equal(evidence.baseline?.aggregate.p50DurationMs, 100);
      assert.equal(evidence.baseline?.aggregate.p95DurationMs, 100);
      assert.equal(evidence.target?.aggregate.p50DurationMs, 140);
      assert.equal(evidence.target?.aggregate.p95DurationMs, 140);
      assert.equal(evidence.observedDelta.avgDurationMs, 40);
      assert.equal(evidence.observedDelta.errorRate, 0);
      assert.equal(evidence.assessment?.averageDuration.direction, "increased");
      assert.equal(evidence.assessment?.averageDuration.delta, 40);
      assert.equal(evidence.assessment?.averageDuration.relativePercent, 40);
      assert.equal(evidence.assessment?.p95Duration.delta, 40);
      assert.equal(evidence.assessment?.p95Duration.relativePercent, 40);
      assert.equal(evidence.assessment?.errorRate.delta, 0);
      assert.equal(evidence.assessment?.sampleComparison.targetToBaselineRatio, 1);
      assert.equal(
        evidence.evidencePolicy.some((item) => /does not establish/i.test(item)),
        true
      );

      const insufficientEvidence = await generateRuntimeCorrelationEvidence(
        repositoryId,
        targetSha,
        5,
        2,
        {
          environment: "test",
          operationName: "GET /items",
          signalType: "http"
        }
      );

      assert.equal(
        insufficientEvidence.status,
        "insufficient_baseline_samples"
      );
      assert.equal(insufficientEvidence.assessment, null);

      const missingParentRepositoryId = randomUUID();
      const missingParentTargetSha = "3".repeat(40);
      const missingParentSha = "4".repeat(40);

      await db.query(
        "INSERT INTO repositories (id, source_type, name) VALUES ($1, 'github', 'missing-parent-test')",
        [missingParentRepositoryId]
      );

      await db.query(
        "INSERT INTO commits (repository_id, sha, subject, committed_at, parent_shas) VALUES ($1, $2, $3, $4, $5)",
        [
          missingParentRepositoryId,
          missingParentTargetSha,
          "target with missing parent",
          commitAt,
          JSON.stringify([missingParentSha])
        ]
      );

      const missingParentEvidence = await generateRuntimeCorrelationEvidence(
        missingParentRepositoryId,
        missingParentTargetSha,
        5,
        1
      );

      assert.equal(
        missingParentEvidence.status,
        "missing_parent_revision"
      );
      assert.equal(
        missingParentEvidence.parentRevisionSha,
        missingParentSha
      );
      assert.equal(missingParentEvidence.baseline, null);
      assert.equal(missingParentEvidence.target, null);

      await db.query("DELETE FROM repositories WHERE id = $1", [
        missingParentRepositoryId
      ]);
    } finally {
      await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
      await db.end();
    }
  }
);
