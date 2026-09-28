import { Router } from "express";
import { repositoryRouter } from "../modules/repositories/repository.routes.js";
import { runtimeRouter } from "../modules/runtime/runtime.routes.js";
import { reportRouter } from "../modules/reports/report.routes.js";
import { interviewRouter } from "../modules/interview/interview.routes.js";

export const router = Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "Project Autopsy API",
    version: "0.1.0"
  });
});

router.use("/repositories", repositoryRouter);
router.use("/repositories/:repositoryId/runtime", runtimeRouter);
router.use("/repositories/:repositoryId/report", reportRouter);
router.use("/repositories/:repositoryId/interview-stories", interviewRouter);
