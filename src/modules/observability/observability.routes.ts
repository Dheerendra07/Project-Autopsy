import { Router } from "express";
import { collectOperationalSnapshot } from "./observability.service.js";

export const observabilityRouter = Router();

observabilityRouter.get("/summary", async (_req, res, next) => {
  try {
    const snapshot = await collectOperationalSnapshot();

    res.status(snapshot.success ? 200 : 503).json(snapshot);
  } catch (error) {
    next(error);
  }
});

export default observabilityRouter;
