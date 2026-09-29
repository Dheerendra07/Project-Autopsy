import { createHash } from "node:crypto";

import {
  deploymentEvidenceBatchSchema,
  type DeploymentEvidenceEventInput,
  type PreparedDeploymentEvidenceEvent
} from "./deployment.types.js";

export const DEPLOYMENT_EVIDENCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
export const DEPLOYMENT_EVIDENCE_MAX_PAST_AGE_MS =
  365 * 24 * 60 * 60 * 1_000;

export class DeploymentEvidenceValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = "DeploymentEvidenceValidationError";
  }
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();

    return `{${keys.map(
      (key) =>
        `${JSON.stringify(key)}:${stableSerialize(record[key])}`
    ).join(",")}}`;
  }

  return "null";
}

export function hashDeploymentEvidenceEvent(
  event: DeploymentEvidenceEventInput
): string {
  const canonical = {
    eventId: event.eventId,
    occurredAt: event.occurredAt.toISOString(),
    provider: event.provider,
    deploymentId: event.deploymentId,
    environment: event.environment,
    state: event.state,
    revisionSha: event.revisionSha ?? null,
    artifactDigest: event.artifactDigest ?? null,
    buildId: event.buildId ?? null,
    releaseId: event.releaseId ?? null,
    metadata: event.metadata
  };

  return createHash("sha256")
    .update(stableSerialize(canonical), "utf8")
    .digest("hex");
}

export function prepareDeploymentEvidenceBatch(
  rawInput: unknown,
  now: Date = new Date()
): PreparedDeploymentEvidenceEvent[] {
  const parsed = deploymentEvidenceBatchSchema.parse(rawInput);
  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    throw new Error("Deployment evidence validation clock is invalid.");
  }

  const seenEventIds = new Set<string>();

  return parsed.events.map((event) => {
    if (seenEventIds.has(event.eventId)) {
      throw new DeploymentEvidenceValidationError(
        `Duplicate eventId in deployment evidence batch: ${event.eventId}`,
        "events"
      );
    }

    seenEventIds.add(event.eventId);

    const occurredAtMs = event.occurredAt.getTime();

    if (
      occurredAtMs >
      nowMs + DEPLOYMENT_EVIDENCE_MAX_FUTURE_SKEW_MS
    ) {
      throw new DeploymentEvidenceValidationError(
        `occurredAt is too far in the future for event ${event.eventId}.`,
        "occurredAt"
      );
    }

    if (
      occurredAtMs <
      nowMs - DEPLOYMENT_EVIDENCE_MAX_PAST_AGE_MS
    ) {
      throw new DeploymentEvidenceValidationError(
        `occurredAt is too old for event ${event.eventId}.`,
        "occurredAt"
      );
    }

    return {
      ...event,
      occurredAtIso: event.occurredAt.toISOString(),
      payloadHash: hashDeploymentEvidenceEvent(event)
    };
  });
}
