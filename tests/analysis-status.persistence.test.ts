import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

test(
  "analysis status persistence exposes the exact run state and enforces one active run per repository",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { db } = await import("../src/config/database.js");
    const {
      createAnalysisRunForRepository,
      getAnalysisRunById
    } = await import("../src/modules/repositories/repository.persistence.js");

    const repositoryId = randomUUID();

    try {
      await db.query(
        "INSERT INTO repositories (id, source_type, name) VALUES ($1, 'github', 'analysis-status-test')",
        [repositoryId]
      );

      const runId = await createAnalysisRunForRepository(repositoryId, {
        analyzerVersion: "0.2.1",
        analysisMode: "full",
        baseHeadSha: null,
        targetHeadSha: "a".repeat(40)
      });

      const stored = await getAnalysisRunById(runId);

      assert.ok(stored);
      assert.deepEqual(
        {
          id: stored.id,
          repository_id: stored.repository_id,
          analyzer_version: stored.analyzer_version,
          analysis_mode: stored.analysis_mode,
          base_head_sha: stored.base_head_sha,
          target_head_sha: stored.target_head_sha,
          status: stored.status
        },
        {
          id: runId,
          repository_id: repositoryId,
          analyzer_version: "0.2.1",
          analysis_mode: "full",
          base_head_sha: null,
          target_head_sha: "a".repeat(40),
          status: "queued"
        }
      );

      await assert.rejects(
        () =>
          createAnalysisRunForRepository(repositoryId, {
            analyzerVersion: "0.2.1",
            analysisMode: "incremental",
            baseHeadSha: "a".repeat(40),
            targetHeadSha: "b".repeat(40)
          }),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
      );

      await db.query(
        "UPDATE analysis_runs SET status = 'completed', completed_at = NOW() WHERE id = $1",
        [runId]
      );

      const completedRunId = await createAnalysisRunForRepository(repositoryId, {
        analyzerVersion: "0.2.1",
        analysisMode: "incremental",
        baseHeadSha: "a".repeat(40),
        targetHeadSha: "b".repeat(40)
      });

      const completed = await getAnalysisRunById(completedRunId);

      assert.ok(completed);
      assert.equal(completed.status, "queued");
      assert.equal(completed.analysis_mode, "incremental");
      assert.equal(completed.base_head_sha, "a".repeat(40));
      assert.equal(completed.target_head_sha, "b".repeat(40));
    } finally {
      await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
    }
  }
);
