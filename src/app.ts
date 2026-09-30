import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { router } from "./routes/index.js";
import { notFoundMiddleware } from "./middleware/notFound.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { isApiAccessAuthorized } from "./middleware/apiAccess.middleware.js";
import { checkDatabaseConnection } from "./config/database.js";
import { checkRedisConnection } from "./config/redis.js";
import { env } from "./config/env.js";
import {
  isCorsOriginAllowed,
  parseCorsOrigins
} from "./config/cors.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";

export const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

const configuredCorsOrigins = parseCorsOrigins(
  env.AUTOPSY_CORS_ORIGINS
);

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      callback(
        null,
        isCorsOriginAllowed(
          requestOrigin,
          env.NODE_ENV,
          configuredCorsOrigins
        )
          ? requestOrigin ?? true
          : false
      );
    }
  })
);

app.use(requestIdMiddleware);

morgan.token("request-id", (_req, res) =>
  String(res.getHeader("x-request-id") ?? "-")
);

app.use(morgan(":method :url :status :response-time ms request_id=:request-id"));

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "project-autopsy-api",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

app.get("/ready", async (_req, res) => {
  const [database, redis] = await Promise.allSettled([
    checkDatabaseConnection(),
    checkRedisConnection()
  ]);

  const ready = database.status === "fulfilled" && redis.status === "fulfilled";

  res.status(ready ? 200 : 503).json({
    success: ready,
    service: "project-autopsy-api",
    status: ready ? "ready" : "not_ready",
    checks: {
      database: database.status === "fulfilled" ? "ready" : "unavailable",
      redis: redis.status === "fulfilled" ? "ready" : "unavailable"
    },
    timestamp: new Date().toISOString()
  });
});

app.use("/api", (req, res, next) => {
  if (
    !isApiAccessAuthorized(
      req.header("authorization"),
      req.header("x-autopsy-api-key")
    )
  ) {
    res.status(401).json({
      success: false,
      error: {
        code: "API_ACCESS_UNAUTHORIZED",
        message: "API access credentials are invalid."
      }
    });
    return;
  }

  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use("/api", router);

app.use(notFoundMiddleware);

app.use(errorMiddleware);
