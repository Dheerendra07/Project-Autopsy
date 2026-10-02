import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { isDeploymentEvidenceAuthorized } from "../modules/deployments/deployment.auth.js";
import { isRuntimeTelemetryAuthorized } from "../modules/runtime/runtime.auth.js";
import { getOwnedRepository } from "../modules/auth/auth.persistence.js";
import { requireSession } from "./session.middleware.js";

function isMachineIngestionRequest(request: Request): boolean {
  const path = request.path;

  if (request.method !== "POST") {
    return false;
  }

  if (/^\/repositories\/[0-9a-f-]+\/runtime\/telemetry$/i.test(path)) {
    return isRuntimeTelemetryAuthorized(
      request.header("authorization"),
      request.header("x-autopsy-telemetry-key")
    );
  }

  if (/^\/repositories\/[0-9a-f-]+\/deployments$/i.test(path)) {
    return isDeploymentEvidenceAuthorized(
      request.header("authorization"),
      request.header("x-autopsy-deployment-key")
    );
  }

  return false;
}

export function requireRepositoryAccess(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  if (
    request.params.repositoryId === "import" &&
    request.path === "/"
  ) {
    next();
    return;
  }

  if (isMachineIngestionRequest(request)) {
    next();
    return;
  }

  requireSession(request, response, () => {
    let repositoryId: string;

    try {
      repositoryId = z.string().uuid().parse(
        Array.isArray(request.params.repositoryId)
          ? request.params.repositoryId[0]
          : request.params.repositoryId
      );
    } catch {
      response.status(400).json({
        success: false,
        error: {
          code: "REPOSITORY_ID_INVALID",
          message: "Repository id is invalid."
        }
      });
      return;
    }

    const userId = request.auth?.userId;

    if (!userId) {
      response.status(401).json({
        success: false,
        error: {
          code: "AUTH_REQUIRED",
          message: "A signed-in account is required."
        }
      });
      return;
    }

    void getOwnedRepository(repositoryId, userId)
      .then((owned) => {
        if (!owned) {
          response.status(404).json({
            success: false,
            error: {
              code: "REPOSITORY_NOT_FOUND",
              message: "Repository not found."
            }
          });
          return;
        }

        next();
      })
      .catch(next);
  });
}
