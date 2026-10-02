import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { getOwnedRepository } from "../modules/auth/auth.persistence.js";
import { requireSession } from "./session.middleware.js";

export function requireRepositoryAccess(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  requireSession(request, response, () => {
    const repositoryId = request.params.repositoryId;

    try {
      z.string().uuid().parse(repositoryId);
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
