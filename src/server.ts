import { Server } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { db, checkDatabaseConnection } from "./config/database.js";
import { redis, checkRedisConnection } from "./config/redis.js";
import { retryRepositoryStorageCleanup } from "./modules/repositories/repository.service.js";

export const HTTP_REQUEST_TIMEOUT_MS = 180_000;
export const HTTP_HEADERS_TIMEOUT_MS = 15_000;
export const HTTP_KEEP_ALIVE_TIMEOUT_MS = 5_000;

export let httpServer: Server | undefined;
let shuttingDown = false;

async function closeResources(): Promise<void> {
  await Promise.allSettled([
    db.end(),
    redis.quit()
  ]);
}

export async function closeServer(): Promise<void> {
  if (!httpServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function registerShutdownHandlers(): void {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void shutdownServer(signal);
    });
  }
}

export async function shutdownServer(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down Project Autopsy API...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    await closeServer();

    await closeResources();
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error("API shutdown failed:", error);
    await closeResources();
    process.exit(1);
  }
}

export async function startServer(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log("✓ PostgreSQL connected");

    await checkRedisConnection();
    console.log("✓ Redis connected");

    const cleanup = await retryRepositoryStorageCleanup(20);
    if (cleanup.attempted > 0) {
      console.log(
        `✓ Repository storage cleanup: ${cleanup.cleaned}/${cleanup.attempted} cleaned, ${cleanup.pending} pending`
      );
    }

    httpServer = app.listen(env.PORT, "0.0.0.0", () => {
      console.log(
        `✓ Project Autopsy API listening on port ${env.PORT}`
      );
    });

    httpServer.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
    httpServer.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
    httpServer.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;

    httpServer.on("error", (error) => {
      console.error("HTTP server error:", error);

      if (process.env.AUTOPSY_COMBINED_RUNTIME === "1") {
        process.kill(process.pid, "SIGTERM");
        return;
      }

      void shutdownServer("HTTP server error");
    });

    if (process.env.AUTOPSY_COMBINED_RUNTIME !== "1") {
      registerShutdownHandlers();
    }
  } catch (error) {
    console.error("Failed to start Project Autopsy:", error);
    await closeResources();
    process.exit(1);
  }
}

if (process.env.AUTOPSY_COMBINED_RUNTIME !== "1") {
  void startServer();
}
