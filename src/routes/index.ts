import { Router } from "express";

export const router = Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "Project Autopsy API",
    version: "0.1.0"
  });
});
