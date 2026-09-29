import { Server } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { db, checkDatabaseConnection } from "./config/database.js";
import { redis, checkRedisConnection } from "./config/redis.js";

let httpServer: Server | undefined;
let shuttingDown = false;

async function closeResources(): Promise<void> {
  await Promise.allSettled([
    db.end(),
    redis.quit()
  ]);
}

function registerShutdownHandlers(): void {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }
}

async function shutdown(signal: string): Promise<void> {
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
    if (httpServer) {
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

async function startServer(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log("✓ PostgreSQL connected");

    await checkRedisConnection();
    console.log("✓ Redis connected");

    httpServer = app.listen(env.PORT, "0.0.0.0", () => {
      console.log(
        `✓ Project Autopsy API listening on port ${env.PORT}`
      );
    });

    httpServer.on("error", (error) => {
      console.error("HTTP server error:", error);
      void shutdown("HTTP server error");
    });

    registerShutdownHandlers();
  } catch (error) {
    console.error("Failed to start Project Autopsy:", error);
    await closeResources();
    process.exit(1);
  }
}

void startServer();
