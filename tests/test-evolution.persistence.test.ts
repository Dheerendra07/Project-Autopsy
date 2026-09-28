import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const DATABASE_AVAILABLE = Boolean(process.env.DATABASE_URL);

test(
  "test evolution persistence supports replace, append, filtering, summary, and idempotent upserts",
  { skip: !DATABASE_AVAILABLE },
  async () => {
    const { db } = await import("../src/config/database.js");
    const {
      appendTestEvolution,
      listTestEvolutionEvents,
      replaceTestEvolution,
      summarizeTestEvolution
    } = await import("../src/modules/tests/test-evolution.persistence.js");

    const repositoryId = randomUUID();
    const commitId = randomUUID();
    const secondCommitId = randomUUID();

    const firstSha = "0123456789abcdef0123456789abcdef01234567";
    const secondSha = "fedcba9876543210fedcba9876543210fedcba98";

    const firstEvent = {
      sha: firstSha,
      path: "tests/users.test.ts",
      changeType: "added" as const,
      framework: "node_test" as const,
      artifactType: "test_source" as const,
      testType: "unit" as const,
      analysisStatus: "supported_source" as const,
      lineCount: 10,
      previousLineCount: 0,
      testCaseCount: 2,
      previousTestCaseCount: 0,
      testCaseDelta: 2,
      suiteCount: 1,
      previousSuiteCount: 0,
      suiteDelta: 1,
      hookCount: 1,
      previousHookCount: 0,
      hookDelta: 1,
      assertionCount: 3,
      previousAssertionCount: 0,
      assertionDelta: 3,
      mockCount: 0,
      previousMockCount: 0,
      mockDelta: 0,
      contentHash: "a".repeat(64),
      previousContentHash: null,
      coChangedProductionFiles: ["src/users.service.ts"],
      signals: ["change:added", "contains:test-cases"],
      warnings: ["source heuristic"]
    };

    const secondEvent = {
      sha: secondSha,
      path: "tests/integration/users.integration.test.ts",
      changeType: "added" as const,
      framework: "node_test" as const,
      artifactType: "test_source" as const,
      testType: "integration" as const,
      analysisStatus: "supported_source" as const,
      lineCount: 12,
      previousLineCount: 0,
      testCaseCount: 3,
      previousTestCaseCount: 0,
      testCaseDelta: 3,
      suiteCount: 1,
      previousSuiteCount: 0,
      suiteDelta: 1,
      hookCount: 0,
      previousHookCount: 0,
      hookDelta: 0,
      assertionCount: 3,
      previousAssertionCount: 0,
      assertionDelta: 3,
      mockCount: 1,
      previousMockCount: 0,
      mockDelta: 1,
      contentHash: "b".repeat(64),
      previousContentHash: null,
      coChangedProductionFiles: ["src/users.service.ts"],
      signals: ["change:added", "test-type:integration"],
      warnings: ["source heuristic"]
    };

    try {
      await db.query(
        "INSERT INTO repositories (id, source_type, name) VALUES ($1, 'github', 'test-evolution')",
        [repositoryId]
      );

      await db.query(
        "INSERT INTO commits (id, repository_id, sha, subject, files_changed) VALUES " +
          "($1, $3, $4, 'test: add unit coverage', 2), " +
          "($2, $3, $5, 'test: add integration coverage', 2)",
        [commitId, secondCommitId, repositoryId, firstSha, secondSha]
      );

      await replaceTestEvolution(repositoryId, [firstEvent]);

      let listed = await listTestEvolutionEvents(repositoryId, 10);
      assert.equal(listed.total, 1);
      assert.equal(listed.events[0]?.path, firstEvent.path);
      assert.equal(listed.events[0]?.testCaseDelta, 2);

      await appendTestEvolution(repositoryId, [secondEvent]);
      await appendTestEvolution(repositoryId, [secondEvent]);

      listed = await listTestEvolutionEvents(repositoryId, 10);
      assert.equal(listed.total, 2);

      const integration = await listTestEvolutionEvents(
        repositoryId,
        10,
        { testType: "integration" }
      );

      assert.equal(integration.total, 1);
      assert.equal(
        integration.events[0]?.path,
        secondEvent.path
      );

      const summary = await summarizeTestEvolution(
        repositoryId,
        {},
        "testType",
        10
      );

      assert.equal(summary.overall.eventCount, 2);
      assert.equal(summary.overall.testCaseCount, 5);
      assert.equal(summary.overall.testCaseDelta, 5);
      assert.equal(summary.groups.length, 2);

      const unitGroup = summary.groups.find(
        (group) => group.key === "unit"
      );
      const integrationGroup = summary.groups.find(
        (group) => group.key === "integration"
      );

      assert.ok(unitGroup);
      assert.equal(unitGroup.testCaseCount, 2);
      assert.equal(unitGroup.testCaseDelta, 2);

      assert.ok(integrationGroup);
      assert.equal(integrationGroup.testCaseCount, 3);
      assert.equal(integrationGroup.mockCount, 1);
    } finally {
      await db.query(
        "DELETE FROM repositories WHERE id = $1",
        [repositoryId]
      );
      await db.end();
    }
  }
);
