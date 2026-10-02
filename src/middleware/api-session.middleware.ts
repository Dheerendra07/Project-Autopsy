import type { NextFunction, Request, Response } from "express";

import { requireCsrf, requireSession } from "./session.middleware.js";

function isMachineIngestionRequest(request: Request): boolean {
  const path = request.path;

  return (
    request.method === "POST" &&
    (
      /^\/repositories\/[0-9a-f-]+\/runtime\/telemetry$/i.test(path) ||
      /^\/repositories\/[0-9a-f-]+\/deployments$/i.test(path)
    )
  );
}

export function requireApiSessionOrMachineIngest(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  if (isMachineIngestionRequest(request)) {
    next();
    return;
  }

  requireSession(request, response, next);
}

export function requireApiCsrfOrMachineIngest(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  if (isMachineIngestionRequest(request)) {
    next();
    return;
  }

  requireCsrf(request, response, next);
}
