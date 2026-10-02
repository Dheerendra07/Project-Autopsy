import { Router } from "express";
import { repositoryRouter } from "../modules/repositories/repository.routes.js";
import { runtimeRouter } from "../modules/runtime/runtime.routes.js";
import { reportRouter } from "../modules/reports/report.routes.js";
import { interviewRouter } from "../modules/interview/interview.routes.js";
import { interpretationRouter } from "../modules/interpretation/interpretation.routes.js";
import { deploymentRouter } from "../modules/deployments/deployment.routes.js";
import contributorEvolutionRouter from "../modules/contributors/contributor-evolution.routes.js";
import observabilityRouter from "../modules/observability/observability.routes.js";
import { requireRepositoryAccess } from "../middleware/repository-access.middleware.js";

export const router = Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "Project Autopsy API",
    version: "0.1.0"
  });
});

router.use("/repositories/:repositoryId", requireRepositoryAccess);
router.use("/repositories", repositoryRouter);
router.use("/repositories/:repositoryId/runtime", runtimeRouter);
router.use("/repositories/:repositoryId/deployments", deploymentRouter);
router.use("/repositories/:repositoryId/report", reportRouter);
router.use("/repositories/:repositoryId/interview-stories", interviewRouter);
router.use("/repositories/:repositoryId/interpretation", interpretationRouter);
router.use("/repositories/:repositoryId/contributors", contributorEvolutionRouter);
router.use("/observability", observabilityRouter);
