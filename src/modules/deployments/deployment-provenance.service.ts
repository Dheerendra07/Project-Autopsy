import {
  summarizeDeploymentEvidence,
  type DeploymentEvidenceSummary
} from "./deployment.persistence.js";

export type DeploymentProvenanceStatus =
  | "deployment_evidence_not_found"
  | "complete"
  | "partial"
  | "conflicting";

export type DeploymentProvenanceConsistency =
  | "consistent"
  | "partial"
  | "conflicting";

export interface DeploymentProvenanceAssessment {
  repositoryId: string;
  deploymentId: string;
  status: DeploymentProvenanceStatus;
  evidence: DeploymentEvidenceSummary & {
    succeededObserved: boolean;
  };
  consistency: {
    environment: DeploymentProvenanceConsistency;
    revision: DeploymentProvenanceConsistency;
    artifact: DeploymentProvenanceConsistency;
    build: DeploymentProvenanceConsistency;
    release: DeploymentProvenanceConsistency;
  };
  gaps: string[];
  conflicts: string[];
  evidencePolicy: string[];
}

function classifyValues(
  values: string[]
): DeploymentProvenanceConsistency {
  if (values.length === 0) {
    return "partial";
  }

  return values.length === 1
    ? "consistent"
    : "conflicting";
}

function addConflict(
  values: string[],
  label: string,
  conflicts: string[]
): void {
  if (values.length > 1) {
    conflicts.push(
      `${label} has multiple distinct observed values for the same deployment ID.`
    );
  }
}

export function buildDeploymentProvenanceAssessment(
  repositoryId: string,
  deploymentId: string,
  summary: DeploymentEvidenceSummary
): DeploymentProvenanceAssessment {
  if (summary.eventCount === 0) {
    return {
      repositoryId,
      deploymentId,
      status: "deployment_evidence_not_found",
      evidence: {
        ...summary,
        succeededObserved: false
      },
      consistency: {
        environment: "partial",
        revision: "partial",
        artifact: "partial",
        build: "partial",
        release: "partial"
      },
      gaps: ["No deployment evidence events were observed for this deployment ID."],
      conflicts: [],
      evidencePolicy: [
        "No observed deployment evidence exists for this deployment ID.",
        "This does not establish that no deployment occurred."
      ]
    };
  }

  const consistency = {
    environment: classifyValues(summary.environments),
    revision: classifyValues(summary.revisionShas),
    artifact: classifyValues(summary.artifactDigests),
    build: classifyValues(summary.buildIds),
    release: classifyValues(summary.releaseIds)
  };

  const conflicts: string[] = [];
  addConflict(summary.environments, "Environment", conflicts);
  addConflict(summary.revisionShas, "Revision", conflicts);
  addConflict(summary.artifactDigests, "Artifact digest", conflicts);
  addConflict(summary.buildIds, "Build ID", conflicts);
  addConflict(summary.releaseIds, "Release ID", conflicts);

  const gaps: string[] = [];
  if (!summary.states.includes("succeeded")) {
    gaps.push("No succeeded deployment event was observed.");
  }
  if (summary.environments.length === 0) {
    gaps.push("No environment identity was observed.");
  }
  if (summary.revisionShas.length === 0) {
    gaps.push("No deployment revision SHA was observed.");
  }
  if (summary.artifactDigests.length === 0) {
    gaps.push("No artifact digest was observed.");
  }
  if (summary.buildIds.length === 0) {
    gaps.push("No build ID was observed.");
  }
  if (summary.releaseIds.length === 0) {
    gaps.push("No release ID was observed.");
  }

  const status: DeploymentProvenanceStatus =
    conflicts.length > 0
      ? "conflicting"
      : gaps.length === 0
        ? "complete"
        : "partial";

  return {
    repositoryId,
    deploymentId,
    status,
    evidence: {
      ...summary,
      succeededObserved: summary.states.includes("succeeded")
    },
    consistency,
    gaps,
    conflicts,
    evidencePolicy: [
      "Provenance completeness is assessed only from observed deployment evidence stored for this exact deployment ID.",
      "A complete status means the evidence contains a succeeded event plus one consistent environment, revision SHA, artifact digest, build ID, and release ID.",
      "Missing values remain partial; Autopsy does not infer build, release, artifact, or deployment identity from timestamps.",
      "Conflicting observed identifiers are surfaced as conflicts rather than reconciled by guessing."
    ]
  };
}

export async function generateDeploymentProvenanceAssessment(
  repositoryId: string,
  deploymentId: string
): Promise<DeploymentProvenanceAssessment> {
  const normalizedDeploymentId = deploymentId.trim();

  if (!normalizedDeploymentId) {
    throw new RangeError("deploymentId must not be empty.");
  }

  const summary = await summarizeDeploymentEvidence(
    repositoryId,
    normalizedDeploymentId
  );

  return buildDeploymentProvenanceAssessment(
    repositoryId,
    normalizedDeploymentId,
    summary
  );
}
