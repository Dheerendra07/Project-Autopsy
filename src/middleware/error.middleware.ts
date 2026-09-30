import type {
  NextFunction,
  Request,
  Response
} from "express";
import { z } from "zod";

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = String(_req.header("x-request-id") ?? "-");
  console.error(`Request ${requestId} failed:`, error);

  if (res.headersSent) {
    return;
  }

  if (isBodyParserError(error)) {
    const status = error.status;

    res.status(status).json({
      success: false,
      error: {
        code:
          status === 413
            ? "REQUEST_BODY_TOO_LARGE"
            : status === 415
              ? "UNSUPPORTED_REQUEST_ENCODING"
              : "INVALID_REQUEST_BODY",
        message:
          status === 413
            ? "Request body exceeds the configured size limit."
            : status === 415
              ? "Request uses an unsupported content encoding."
              : "Request body could not be parsed."
      }
    });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        issues: error.issues
      }
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred."
    }
  });
}


interface BodyParserError {
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
}

function isBodyParserError(error: unknown): error is BodyParserError & { status: number } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as BodyParserError;
  const type = String(candidate.type ?? "");
  const statusValue = Number(candidate.status ?? candidate.statusCode);

  if (
    type === "entity.too.large" ||
    statusValue === 413
  ) {
    candidate.status = 413;
    return true;
  }

  if (
    type === "encoding.unsupported" ||
    statusValue === 415
  ) {
    candidate.status = 415;
    return true;
  }

  if (
    type === "entity.parse.failed" ||
    statusValue === 400
  ) {
    candidate.status = 400;
    return true;
  }

  return false;
}
