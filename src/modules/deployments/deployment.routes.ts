import { Router } from "express";
import { z } from "zod";

import { getRepositoryById } from "../repositories/repository.persistence.js";
import {
  DeploymentEvidenceEventConflictError,
  insertDeploymentEvidenceBatch,
  listDeploymentEvidence
} from "./deployment.persistence.js";
import { isDeploymentEvidenceAuthorized } from "./deployment.auth.js";
import {
  DeploymentEvidenceValidationError,
  prepareDeploymentEvidenceBatch
} from "./deployment.service.js";

export const deploymentRouter = Router({ mergeParams: true });

function getRepositoryId(
  params: Record<string, string | undefined>
): string {
  return z.string().uuid().parse(params.repositoryId);
}

deploymentRouter.post("/", async (req, res, next) => {
  try {
    if (
      !isDeploymentEvidenceAuthorized(
        req.header("authorization"),
        req.header("x-autopsy-deployment-key")
      )
    ) {
      res.status(401).json({
        success: false,
        error: {
          code: "DEPLOYMENT_EVIDENCE_INGEST_UNAUTHORIZED",
          message: "Deployment evidence ingestion credentials are invalid."
        }
      });
      return;
    }

    const repositoryId = getRepositoryId(req.params);
    const repository = await getRepositoryById(repositoryId);

    if (!repository) {
      res.status(404).json({
        success: false,
        error: {
          code: "REPOSITORY_NOT_FOUND",
          message: "Repository not found."
        }
      });
      return;
    }

    const events = prepareDeploymentEvidenceBatch(req.body);
    const result = await insertDeploymentEvidenceBatch(
      repositoryId,
      events
    );

    res.status(202).json({
      success: true,
      repositoryId,
      ingested: {
        received: events.length,
        accepted: result.accepted,
        duplicates: result.duplicates
      },
      semantics: {
        duplicatePolicy: "same eventId + same payload hash is idempotent",
        conflictingDuplicatePolicy: "same eventId + different payload is rejected",
        evidenceBasis: "observed_deployment_evidence"
      }
    });
  } catch (error) {
    if (error instanceof DeploymentEvidenceValidationError) {
      res.status(400).json({
        success: false,
        error: {
          code: "DEPLOYMENT_EVIDENCE_VALIDATION_ERROR",
          message: error.message,
          field: error.field
        }
      });
      return;
    }

    if (error instanceof DeploymentEvidenceEventConflictError) {
      res.status(409).json({
        success: false,
        error: {
          code: "DEPLOYMENT_EVIDENCE_EVENT_ID_CONFLICT",
          message: error.message
        }
      });
      return;
    }

    next(error);
  }
});

deploymentRouter.get("/", async (req, res, next) => {
  try {
    const repositoryId = getRepositoryId(req.params);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50)
    }).parse(req.query);
    const repository = await getRepositoryById(repositoryId);

    if (!repository) {
      res.status(404).json({
        success: false,
        error: {
          code: "REPOSITORY_NOT_FOUND",
          message: "Repository not found."
        }
      });
      return;
    }

    const events = await listDeploymentEvidence(repositoryId, query.limit);

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "observed_deployment_evidence",
      events: events.map((event) => ({
        id: event.id,
        eventId: event.event_id,
        occurredAt: event.occurred_at,
        provider: event.provider,
        deploymentId: event.deployment_id,
        environment: event.environment,
        state: event.state,
        revisionSha: event.revision_sha,
        artifactDigest: event.artifact_digest,
        buildId: event.build_id,
        releaseId: event.release_id
      }))
    });
  } catch (error) {
    next(error);
  }
});

export default deploymentRouter;
