import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

test("maps persisted contributor evidence without changing its semantics", async () => {
  const { toContributorActivity } = await import(
    "../src/modules/contributors/contributor-evolution.service.js"
  );

  const row = {
    author_name: "Ada Example",
    author_email: "ada@example.com",
    commit_count: 3,
    additions: 120,
    deletions: 30,
    total_churn: 150,
    paths_touched: 8,
    first_committed_at: "2026-01-01T00:00:00.000Z",
    last_committed_at: "2026-02-01T00:00:00.000Z",
    total_contributors: 2
  };

  assert.deepEqual(toContributorActivity(row), {
    authorName: "Ada Example",
    authorEmail: "ada@example.com",
    commitCount: 3,
    additions: 120,
    deletions: 30,
    totalChurn: 150,
    pathsTouched: 8,
    firstCommittedAt: "2026-01-01T00:00:00.000Z",
    lastCommittedAt: "2026-02-01T00:00:00.000Z"
  });
});

test(
  "aggregates contributor activity deterministically from persisted commit evidence",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { db } = await import("../src/config/database.js");
    const { listContributorActivity } = await import(
      "../src/modules/contributors/contributor-evolution.persistence.js"
    );

    const repositoryId = randomUUID();
    const alphaFirstSha = "1".repeat(40);
    const alphaSecondSha = "2".repeat(40);
    const betaSha = "3".repeat(40);
    const unknownSha = "4".repeat(40);

    try {
      await db.query(
        "INSERT INTO repositories (id, source_type, name) VALUES ($1, 'github', 'contributor-test')",
        [repositoryId]
      );

      await db.query(
        "INSERT INTO commits (repository_id, sha, author_name, author_email, committed_at, subject, additions, deletions)" +
          " VALUES ($1, $2, 'Alpha', 'alpha@example.com', '2026-01-01T00:00:00Z', 'alpha one', 100, 20)," +
          " ($1, $3, 'Alpha', 'alpha@example.com', '2026-01-03T00:00:00Z', 'alpha two', 10, 5)," +
          " ($1, $4, 'Beta', 'beta@example.com', '2026-01-02T00:00:00Z', 'beta one', 30, 1)," +
          " ($1, $5, NULL, NULL, '2026-01-04T00:00:00Z', 'unknown author', 4, 2)",
        [repositoryId, alphaFirstSha, alphaSecondSha, betaSha, unknownSha]
      );

      const commitRows = await db.query<{ id: string; sha: string }>(
        "SELECT id, sha FROM commits WHERE repository_id = $1 ORDER BY committed_at ASC",
        [repositoryId]
      );

      const ids = new Map(commitRows.rows.map((row) => [row.sha, row.id]));

      await db.query(
        "INSERT INTO commit_files (commit_id, path, status, additions, deletions)" +
          " VALUES ($1, 'src/a.ts', 'modified', 100, 20)," +
          " ($2, 'src/b.ts', 'added', 10, 5)," +
          " ($3, 'src/b.ts', 'modified', 30, 1)",
        [ids.get(alphaFirstSha), ids.get(alphaSecondSha), ids.get(betaSha)]
      );

      const first = await listContributorActivity(repositoryId, 10);
      const second = await listContributorActivity(repositoryId, 10);

      assert.deepEqual(first, second);
      assert.equal(first.total, 3);
      assert.equal(first.contributors.length, 3);

      assert.deepEqual(first.contributors[0], {
        author_name: "Alpha",
        author_email: "alpha@example.com",
        commit_count: 2,
        additions: 110,
        deletions: 25,
        total_churn: 135,
        paths_touched: 2,
        first_committed_at: "2026-01-01T00:00:00.000Z",
        last_committed_at: "2026-01-03T00:00:00.000Z",
        total_contributors: 3
      });

      assert.equal(first.contributors[1]?.author_name, "Beta");
      assert.equal(first.contributors[2]?.author_name, null);
      assert.equal(first.contributors[2]?.paths_touched, 0);
    } finally {
      await db.query("DELETE FROM repositories WHERE id = $1", [repositoryId]);
      await db.end();
    }
  }
);
