import { Router } from "express";
import { z } from "zod";

import { getRepositoryById } from "../repositories/repository.persistence.js";
import { getContributorActivity } from "./contributor-evolution.service.js";

export const contributorEvolutionRouter = Router({ mergeParams: true });

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

function getRepositoryId(
  params: Record<string, string | undefined>
): string {
  return z.string().uuid().parse(params.repositoryId);
}

contributorEvolutionRouter.get("/", async (req, res, next) => {
  try {
    const repositoryId = getRepositoryId(req.params);
    const query = querySchema.parse(req.query);
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

    const result = await getContributorActivity(repositoryId, query.limit);

    res.json({
      success: true,
      repositoryId,
      evidenceBasis: "persisted_git_author_metadata",
      semantics: {
        identityBasis:
          "Exact persisted Git author name/email tuples are reported; aliases are not automatically merged.",
        activityBasis:
          "Commit counts, line additions/deletions, churn, and distinct changed paths are derived from persisted commit evidence.",
        interpretation:
          "Contributor activity is descriptive historical evidence and does not establish personal ownership, effort, intent, seniority, or business impact."
      },
      totalContributors: result.totalContributors,
      contributors: result.contributors
    });
  } catch (error) {
    next(error);
  }
});

export default contributorEvolutionRouter;
