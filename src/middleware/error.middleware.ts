import type {
  NextFunction,
  Request,
  Response
} from "express";
import { z } from "zod";
import { RepositoryUrlValidationError } from "../modules/repositories/repository-url.js";

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = String(_req.header("x-request-id") ?? "-");

  if (isBodyParserError(error)) {
    console.error(`Request ${requestId} body parsing failed:`, {
      type: String(error.type),
      status: error.status
    });
  } else if (error instanceof Error) {
    console.error(`Request ${requestId} failed:`, {
      name: error.name,
      message: error.message.slice(0, 2_000)
    });
  } else {
    console.error(`Request ${requestId} failed with a non-Error value.`);
  }

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

  if (error instanceof RepositoryUrlValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: error.message
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
}

export function isBodyParserError(error: unknown): error is BodyParserError & { status: number } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as BodyParserError;
  const type = String(candidate.type ?? "");
  if (type === "entity.too.large") {
    candidate.status = 413;
    return true;
  }

  if (type === "encoding.unsupported") {
    candidate.status = 415;
    return true;
  }

  if (type === "entity.parse.failed") {
    candidate.status = 400;
    return true;
  }

  return false;
}
