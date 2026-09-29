import { db } from "../../config/database.js";
import type {
  PreparedDeploymentEvidenceEvent,
  DeploymentEvidenceEventInput
} from "./deployment.types.js";

export interface DeploymentEvidenceRow {
  id: string;
  event_id: string;
  occurred_at: string;
  provider: string;
  deployment_id: string;
  environment: string;
  state: DeploymentEvidenceEventInput["state"];
  revision_sha: string | null;
  artifact_digest: string | null;
  build_id: string | null;
  release_id: string | null;
  metadata: Record<string, unknown>;
  payload_hash: string;
  received_at: string;
}

export class DeploymentEvidenceEventConflictError extends Error {
  constructor(public readonly eventId: string) {
    super(`Deployment evidence eventId already exists with different payload: ${eventId}`);
    this.name = "DeploymentEvidenceEventConflictError";
  }
}

export async function insertDeploymentEvidenceBatch(
  repositoryId: string,
  events: PreparedDeploymentEvidenceEvent[]
): Promise<{ accepted: number; duplicates: number }> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const values: unknown[] = [];
    const rows = events.map((event, eventIndex) => {
      const base = eventIndex * 13;

      values.push(
        repositoryId,
        event.eventId,
        event.occurredAtIso,
        event.provider,
        event.deploymentId,
        event.environment,
        event.state,
        event.revisionSha ?? null,
        event.artifactDigest ?? null,
        event.buildId ?? null,
        event.releaseId ?? null,
        JSON.stringify(event.metadata),
        event.payloadHash
      );

      return `(${Array.from(
        { length: 13 },
        (_, index) => `$${base + index + 1}`
      ).join(", ")})`;
    });

    const inserted = await client.query<{ event_id: string }>(
      `INSERT INTO deployment_evidence_events (
        repository_id,
        event_id,
        occurred_at,
        provider,
        deployment_id,
        environment,
        state,
        revision_sha,
        artifact_digest,
        build_id,
        release_id,
        metadata,
        payload_hash
      )
      VALUES ${rows.join(", ")}
      ON CONFLICT (repository_id, event_id) DO NOTHING
      RETURNING event_id`,
      values
    );

    const eventIds = [...new Set(events.map((event) => event.eventId))];
    const existing = await client.query<{
      event_id: string;
      payload_hash: string;
    }>(
      `SELECT event_id, payload_hash
       FROM deployment_evidence_events
       WHERE repository_id = $1
         AND event_id = ANY($2::text[])`,
      [repositoryId, eventIds]
    );

    const hashesByEventId = new Map(
      existing.rows.map((row) => [row.event_id, row.payload_hash])
    );

    for (const event of events) {
      const existingHash = hashesByEventId.get(event.eventId);

      if (!existingHash) {
        throw new Error(`Deployment evidence event disappeared during persistence: ${event.eventId}`);
      }

      if (existingHash !== event.payloadHash) {
        throw new DeploymentEvidenceEventConflictError(event.eventId);
      }
    }

    await client.query("COMMIT");

    return {
      accepted: inserted.rows.length,
      duplicates: events.length - inserted.rows.length
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listDeploymentEvidence(
  repositoryId: string,
  limit: number
): Promise<DeploymentEvidenceRow[]> {
  const result = await db.query<DeploymentEvidenceRow>(
    `SELECT
       id,
       event_id,
       occurred_at,
       provider,
       deployment_id,
       environment,
       state,
       revision_sha,
       artifact_digest,
       build_id,
       release_id,
       metadata,
       payload_hash,
       received_at
     FROM deployment_evidence_events
     WHERE repository_id = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT $2`,
    [repositoryId, limit]
  );

  return result.rows;
}
