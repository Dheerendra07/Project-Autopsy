import { db } from "../config/database.js";
import { env } from "../config/env.js";

export const EVIDENCE_RETENTION_BATCH_SIZE = 5_000;
export const EVIDENCE_RETENTION_MAX_DELETIONS_PER_SWEEP = 20_000;

export function getEvidenceRetentionCutoff(
  now: Date = new Date(),
  retentionDays: number = env.EVIDENCE_RETENTION_DAYS
): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 365) {
    throw new Error("Evidence retention days must be an integer between 30 and 365.");
  }

  if (Number.isNaN(now.getTime())) {
    throw new Error("Evidence retention cutoff requires a valid date.");
  }

  return new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1_000
  );
}

async function deleteOlderEvidence(
  table: "runtime_telemetry_events" | "deployment_evidence_events",
  timestampColumn: "observed_at" | "occurred_at",
  cutoff: Date,
  maxDeletions: number
): Promise<number> {
  let deleted = 0;

  while (deleted < maxDeletions) {
    const result = await db.query(
      `WITH expired AS (
        SELECT id
        FROM ${table}
        WHERE ${timestampColumn} < $1
        ORDER BY ${timestampColumn} ASC, id ASC
        LIMIT $2
      )
      DELETE FROM ${table}
      WHERE id IN (SELECT id FROM expired)
      RETURNING id`,
      [
        cutoff.toISOString(),
        Math.min(
          EVIDENCE_RETENTION_BATCH_SIZE,
          maxDeletions - deleted
        )
      ]
    );

    deleted += result.rowCount ?? 0;

    if ((result.rowCount ?? 0) < EVIDENCE_RETENTION_BATCH_SIZE) {
      return deleted;
    }
  }

  return deleted;
}

export interface EvidenceRetentionSweepResult {
  cutoff: string;
  runtimeTelemetryDeleted: number;
  deploymentEvidenceDeleted: number;
}

let activeSweep:
  Promise<EvidenceRetentionSweepResult> | undefined;

export async function runEvidenceRetentionSweep(
  now: Date = new Date()
): Promise<EvidenceRetentionSweepResult> {
  if (activeSweep) {
    return activeSweep;
  }

  activeSweep = (async () => {
    const cutoff = getEvidenceRetentionCutoff(now);

    const [runtimeTelemetryDeleted, deploymentEvidenceDeleted] =
      await Promise.all([
        deleteOlderEvidence(
          "runtime_telemetry_events",
          "observed_at",
          cutoff,
          EVIDENCE_RETENTION_MAX_DELETIONS_PER_SWEEP
        ),
        deleteOlderEvidence(
          "deployment_evidence_events",
          "occurred_at",
          cutoff,
          EVIDENCE_RETENTION_MAX_DELETIONS_PER_SWEEP
        )
      ]);

    return {
      cutoff: cutoff.toISOString(),
      runtimeTelemetryDeleted,
      deploymentEvidenceDeleted
    };
  })();

  try {
    return await activeSweep;
  } finally {
    activeSweep = undefined;
  }
}
