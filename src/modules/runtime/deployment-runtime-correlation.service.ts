import {
  listDeploymentEvidenceForDeployment,
  summarizeDeploymentEvidence,
  type DeploymentEvidenceSummary,
  type DeploymentEvidenceRow
} from "../deployments/deployment.persistence.js";
import { summarizeRuntimeTelemetry } from "../runtime/runtime.persistence.js";
import type { RuntimeTelemetryFilters } from "../runtime/runtime.types.js";

export type DeploymentRuntimeCorrelationStatus =
  | "deployment_evidence_not_found"
  | "runtime_evidence_not_found"
  | "linked"
  | "conflicting_revision_evidence"
  | "conflicting_environment_evidence"
  | "conflicting_identity_evidence";

export interface DeploymentRuntimeCorrelation {
  repositoryId: string;
  deploymentId: string;
  status: DeploymentRuntimeCorrelationStatus;
  deploymentEvidence: DeploymentEvidenceSummary & {
    recentEvents: Array<{
      eventId: string;
      occurredAt: string;
      provider: string;
      environment: string;
      state: DeploymentEvidenceRow["state"];
      revisionSha: string | null;
      artifactDigest: string | null;
      buildId: string | null;
      releaseId: string | null;
    }>;
  };
  runtimeEvidence: {
    sampleCount: number;
    errorCount: number;
    errorRate: number;
    firstObservedAt: string | null;
    lastObservedAt: string | null;
    revisionShas: string[];
    environments: string[];
  };
  consistency: {
    revision: "consistent" | "partial" | "conflicting";
    environment: "consistent" | "partial" | "conflicting";
  };
  evidencePolicy: string[];
}

function sortedKnown(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== "<unknown>"))].sort();
}

function compareIdentitySets(
  deploymentValues: string[],
  runtimeValues: string[]
): "consistent" | "partial" | "conflicting" {
  const deployment = sortedKnown(deploymentValues);
  const runtime = sortedKnown(runtimeValues);

  if (deployment.length === 0 || runtime.length === 0) {
    return "partial";
  }

  const allRuntimeValuesKnown = runtime.every((value) =>
    deployment.includes(value)
  );

  if (allRuntimeValuesKnown) {
    return "consistent";
  }

  return runtime.some((value) => deployment.includes(value))
    ? "partial"
    : "conflicting";
}

export function buildDeploymentRuntimeCorrelation(
  repositoryId: string,
  deploymentId: string,
  deploymentEvidence: DeploymentEvidenceSummary & {
    recentEvents: DeploymentRuntimeCorrelation["deploymentEvidence"]["recentEvents"];
  },
  runtimeEvidence: DeploymentRuntimeCorrelation["runtimeEvidence"]
): DeploymentRuntimeCorrelation {
  if (deploymentEvidence.eventCount === 0) {
    return {
      repositoryId,
      deploymentId,
      status: "deployment_evidence_not_found",
      deploymentEvidence,
      runtimeEvidence,
      consistency: {
        revision: "partial",
        environment: "partial"
      },
      evidencePolicy: [
        "No observed deployment evidence exists for this deployment ID.",
        "This does not establish that no deployment occurred."
      ]
    };
  }

  if (runtimeEvidence.sampleCount === 0) {
    return {
      repositoryId,
      deploymentId,
      status: "runtime_evidence_not_found",
      deploymentEvidence,
      runtimeEvidence,
      consistency: {
        revision: "partial",
        environment: "partial"
      },
      evidencePolicy: [
        "Deployment evidence exists, but no runtime telemetry is explicitly linked to this deployment ID.",
        "This does not establish that the deployment was not serving traffic."
      ]
    };
  }

  const revision = compareIdentitySets(
    deploymentEvidence.revisionShas,
    runtimeEvidence.revisionShas
  );
  const environment = compareIdentitySets(
    deploymentEvidence.environments,
    runtimeEvidence.environments
  );

  let status: DeploymentRuntimeCorrelationStatus = "linked";
  if (revision === "conflicting" && environment === "conflicting") {
    status = "conflicting_identity_evidence";
  } else if (revision === "conflicting") {
    status = "conflicting_revision_evidence";
  } else if (environment === "conflicting") {
    status = "conflicting_environment_evidence";
  }

  return {
    repositoryId,
    deploymentId,
    status,
    deploymentEvidence,
    runtimeEvidence,
    consistency: { revision, environment },
    evidencePolicy: [
      "Runtime samples are linked by the exact deployment ID supplied by the telemetry producer.",
      "Revision and environment consistency are comparisons of observed identifiers, not proof of deployment causality or current traffic state.",
      "Missing revision or environment identifiers remain partial rather than being inferred from timestamps."
    ]
  };
}

export async function generateDeploymentRuntimeCorrelation(
  repositoryId: string,
  deploymentId: string,
  recentEventLimit = 25
): Promise<DeploymentRuntimeCorrelation> {
  const filters: RuntimeTelemetryFilters = { deploymentId };

  const [summary, recentEvents, revisionSummary, environmentSummary] =
    await Promise.all([
      summarizeDeploymentEvidence(repositoryId, deploymentId),
      listDeploymentEvidenceForDeployment(
        repositoryId,
        deploymentId,
        recentEventLimit
      ),
      summarizeRuntimeTelemetry(repositoryId, filters, "revision", 100),
      summarizeRuntimeTelemetry(repositoryId, filters, "environment", 100)
    ]);

  const deploymentEvents = recentEvents
    .filter((event) => event.deployment_id === deploymentId)
    .map((event) => ({
      eventId: event.event_id,
      occurredAt: event.occurred_at,
      provider: event.provider,
      environment: event.environment,
      state: event.state,
      revisionSha: event.revision_sha,
      artifactDigest: event.artifact_digest,
      buildId: event.build_id,
      releaseId: event.release_id
    }));

  return buildDeploymentRuntimeCorrelation(
    repositoryId,
    deploymentId,
    {
      ...summary,
      recentEvents: deploymentEvents
    },
    {
      sampleCount: revisionSummary.overall.sampleCount,
      errorCount: revisionSummary.overall.errorCount,
      errorRate: revisionSummary.overall.errorRate,
      firstObservedAt: revisionSummary.overall.firstObservedAt,
      lastObservedAt: revisionSummary.overall.lastObservedAt,
      revisionShas: sortedKnown(
        revisionSummary.groups.map((group) => group.key)
      ),
      environments: sortedKnown(
        environmentSummary.groups.map((group) => group.key)
      )
    }
  );
}
