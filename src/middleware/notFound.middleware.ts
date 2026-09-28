import type { Request, Response } from "express";

export function notFoundMiddleware(
  req: Request,
  res: Response
): void {
  res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
}
