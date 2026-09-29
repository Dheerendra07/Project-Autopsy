import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { router } from "./routes/index.js";
import { notFoundMiddleware } from "./middleware/notFound.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { isApiAccessAuthorized } from "./middleware/apiAccess.middleware.js";

export const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "project-autopsy-api",
    status: "healthy",
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
}, router);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
