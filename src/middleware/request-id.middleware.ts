import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incomingRequestId = req.header("x-request-id")?.trim();
  const requestId =
    incomingRequestId && UUID_V4_PATTERN.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  res.setHeader("x-request-id", requestId);
  next();
}
