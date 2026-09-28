import { Router } from "express";
import { repositoryRouter } from "../modules/repositories/repository.routes.js";

export const router = Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "Project Autopsy API",
    version: "0.1.0"
  });
});

router.use("/repositories", repositoryRouter);
