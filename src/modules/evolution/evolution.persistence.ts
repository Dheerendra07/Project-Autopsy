import { db } from "../../config/database.js";

export async function replaceDependencyEvolution(
  repositoryId: string,
  snapshots: Array<{
    sha: string;
    manifestPath: string;
    packageManager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  }>,
  changes: Array<{
    sha: string;
    manifestPath: string;
    packageName: string;
    scope: string;
    changeType: string;
    previousSpec: string | null;
    currentSpec: string | null;
  }>
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM dependency_changes WHERE repository_id = $1", [repositoryId]);
    await client.query("DELETE FROM dependency_snapshots WHERE repository_id = $1", [repositoryId]);

    for (const snapshot of snapshots) {
      const commitId = await getCommitId(client, repositoryId, snapshot.sha);
      if (!commitId) continue;

      await client.query(
        `INSERT INTO dependency_snapshots (
          repository_id, commit_id, manifest_path, package_manager,
          dependencies, dev_dependencies
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        ON CONFLICT (repository_id, commit_id, manifest_path)
        DO UPDATE SET
          package_manager = EXCLUDED.package_manager,
          dependencies = EXCLUDED.dependencies,
          dev_dependencies = EXCLUDED.dev_dependencies`,
        [
          repositoryId,
          commitId,
          snapshot.manifestPath,
          snapshot.packageManager,
          JSON.stringify(snapshot.dependencies),
          JSON.stringify(snapshot.devDependencies)
        ]
      );
    }

    for (const change of changes) {
      const commitId = await getCommitId(client, repositoryId, change.sha);
      if (!commitId) continue;

      await client.query(
        `INSERT INTO dependency_changes (
          repository_id, commit_id, manifest_path, package_name, scope,
          change_type, previous_spec, current_spec
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (
          repository_id, commit_id, manifest_path, package_name, scope
        ) DO UPDATE SET
          change_type = EXCLUDED.change_type,
          previous_spec = EXCLUDED.previous_spec,
          current_spec = EXCLUDED.current_spec`,
        [
          repositoryId,
          commitId,
          change.manifestPath,
          change.packageName,
          change.scope,
          change.changeType,
          change.previousSpec,
          change.currentSpec
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceArchitectureEvolution(
  repositoryId: string,
  snapshots: Array<{
    sha: string;
    rootPath: string;
    directories: string[];
  }>,
  events: Array<{
    sha: string;
    rootPath: string;
    eventType: string;
    path: string;
  }>
): Promise<void> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM architecture_events WHERE repository_id = $1", [repositoryId]);
    await client.query("DELETE FROM architecture_snapshots WHERE repository_id = $1", [repositoryId]);

    for (const snapshot of snapshots) {
      const commitId = await getCommitId(client, repositoryId, snapshot.sha);
      if (!commitId) continue;

      await client.query(
        `INSERT INTO architecture_snapshots (
          repository_id, commit_id, root_path, directories
        ) VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (repository_id, commit_id, root_path)
        DO UPDATE SET directories = EXCLUDED.directories`,
        [repositoryId, commitId, snapshot.rootPath, JSON.stringify(snapshot.directories)]
      );
    }

    for (const event of events) {
      const commitId = await getCommitId(client, repositoryId, event.sha);
      if (!commitId) continue;

      await client.query(
        `INSERT INTO architecture_events (
          repository_id, commit_id, root_path, event_type, path
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (
          repository_id, commit_id, root_path, event_type, path
        ) DO NOTHING`,
        [repositoryId, commitId, event.rootPath, event.eventType, event.path]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listDependencyChanges(
  repositoryId: string,
  limit: number
): Promise<Array<{
  package_name: string;
  scope: string;
  change_type: string;
  previous_spec: string | null;
  current_spec: string | null;
  committed_at: string | null;
  subject: string;
}>> {
  const result = await db.query<{
    package_name: string;
    scope: string;
    change_type: string;
    previous_spec: string | null;
    current_spec: string | null;
    committed_at: string | null;
    subject: string;
  }>(
    `SELECT
      changes.package_name,
      changes.scope,
      changes.change_type,
      changes.previous_spec,
      changes.current_spec,
      commits.committed_at,
      commits.subject
    FROM dependency_changes AS changes
    INNER JOIN commits
      ON commits.id = changes.commit_id
     AND commits.repository_id = changes.repository_id
    WHERE changes.repository_id = $1
    ORDER BY commits.committed_at ASC NULLS LAST, changes.package_name ASC
    LIMIT $2`,
    [repositoryId, limit]
  );

  return result.rows;
}

export async function listArchitectureEvents(
  repositoryId: string,
  limit: number
): Promise<Array<{
  root_path: string;
  event_type: string;
  path: string;
  committed_at: string | null;
  subject: string;
}>> {
  const result = await db.query<{
    root_path: string;
    event_type: string;
    path: string;
    committed_at: string | null;
    subject: string;
  }>(
    `SELECT
      events.root_path,
      events.event_type,
      events.path,
      commits.committed_at,
      commits.subject
    FROM architecture_events AS events
    INNER JOIN commits
      ON commits.id = events.commit_id
     AND commits.repository_id = events.repository_id
    WHERE events.repository_id = $1
    ORDER BY commits.committed_at ASC NULLS LAST, events.root_path ASC, events.path ASC
    LIMIT $2`,
    [repositoryId, limit]
  );

  return result.rows;
}

async function getCommitId(
  client: {
    query<Row = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
  },
  repositoryId: string,
  sha: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM commits WHERE repository_id = $1 AND sha = $2",
    [repositoryId, sha]
  );

  return result.rows[0]?.id ?? null;
}
