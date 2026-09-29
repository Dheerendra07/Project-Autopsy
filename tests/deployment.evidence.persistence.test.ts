import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const DATABASE_AVAILABLE = Boolean(process.env.DATABASE_URL);

test(
  "deployment evidence persistence is idempotent, atomic, and repository-scoped",
  { skip: !DATABASE_AVAILABLE },
  async () => {
    const { db } = await import("../src/config/database.js");
    const {
      DeploymentEvidenceEventConflictError,
      insertDeploymentEvidenceBatch,
      listDeploymentEvidence
    } = await import("../src/modules/deployments/deployment.persistence.js");
    const { prepareDeploymentEvidenceBatch } = await import(
      "../src/modules/deployments/deployment.service.js"
    );

    const repositoryId = randomUUID();
    const otherRepositoryId = randomUUID();
    const now = new Date("2026-09-29T03:00:00.000Z");
    const revisionSha = "0123456789abcdef0123456789abcdef01234567";

    try {
      await db.query(
        `INSERT INTO repositories (id, source_type, name)
         VALUES ($1, 'github', 'deployment-test'),
                ($2, 'github', 'deployment-test-other')`,
        [repositoryId, otherRepositoryId]
      );

      const firstEvents = prepareDeploymentEvidenceBatch(
        {
          events: [
            {
              eventId: "deploy-001",
              occurredAt: now.toISOString(),
              provider: "github-actions",
              deploymentId: "deployment-123",
              environment: "production",
              state: "succeeded",
              revisionSha,
              artifactDigest: "sha256:" + "a".repeat(64),
              buildId: "run-123",
              releaseId: "release-123",
              metadata: { workflow: "deploy.yml" }
            }
          ]
        },
        now
      );

      assert.deepEqual(
        await insertDeploymentEvidenceBatch(repositoryId, firstEvents),
        { accepted: 1, duplicates: 0 }
      );
      assert.deepEqual(
        await insertDeploymentEvidenceBatch(repositoryId, firstEvents),
        { accepted: 0, duplicates: 1 }
      );

      const conflicting = prepareDeploymentEvidenceBatch(
        {
          events: [
            {
              ...firstEvents[0],
              eventId: "deploy-001",
              state: "failed"
            }
          ]
        },
        now
      );

      await assert.rejects(
        insertDeploymentEvidenceBatch(repositoryId, conflicting),
        (error) => error instanceof DeploymentEvidenceEventConflictError
      );

      const atomicBatch = prepareDeploymentEvidenceBatch(
        {
          events: [
            {
              eventId: "deploy-002",
              occurredAt: new Date(now.getTime() + 1_000).toISOString(),
              provider: "github-actions",
              deploymentId: "deployment-456",
              environment: "production",
              state: "started",
              revisionSha,
              metadata: {}
            },
            {
              eventId: "deploy-001",
              occurredAt: now.toISOString(),
              provider: "github-actions",
              deploymentId: "deployment-123",
              environment: "production",
              state: "failed",
              revisionSha,
              artifactDigest: "sha256:" + "a".repeat(64),
              buildId: "run-123",
              releaseId: "release-123",
              metadata: {}
            }
          ]
        },
        now
      );

      await assert.rejects(
        insertDeploymentEvidenceBatch(repositoryId, atomicBatch),
        (error) => error instanceof DeploymentEvidenceEventConflictError
      );

      const afterAtomicFailure = await listDeploymentEvidence(
        repositoryId,
        10
      );
      assert.equal(afterAtomicFailure.length, 1);
      assert.equal(afterAtomicFailure[0]?.event_id, "deploy-001");

      const isolated = prepareDeploymentEvidenceBatch(
        {
          events: [
            {
              eventId: "deploy-001",
              occurredAt: now.toISOString(),
              provider: "github-actions",
              deploymentId: "deployment-other",
              environment: "staging",
              state: "started",
              metadata: {}
            }
          ]
        },
        now
      );

      assert.deepEqual(
        await insertDeploymentEvidenceBatch(otherRepositoryId, isolated),
        { accepted: 1, duplicates: 0 }
      );

      const otherRows = await listDeploymentEvidence(otherRepositoryId, 10);
      assert.equal(otherRows.length, 1);
      assert.equal(otherRows[0]?.deployment_id, "deployment-other");
    } finally {
      await db.query(
        "DELETE FROM repositories WHERE id = ANY($1::uuid[])",
        [[repositoryId, otherRepositoryId]]
      );
      await db.end();
    }
  }
);
