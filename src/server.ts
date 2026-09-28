import { Server } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { db, checkDatabaseConnection } from "./config/database.js";
import { redis, checkRedisConnection } from "./config/redis.js";

let server: Server | undefined;
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

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
  }

  await closeResources();

  clearTimeout(forceExitTimer);
  process.exit(0);
}

async function startServer(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log("✓ PostgreSQL connected");

    await checkRedisConnection();
    console.log("✓ Redis connected");

    server = app.listen(env.PORT, () => {
      console.log(
        `✓ Project Autopsy API running on http://localhost:${env.PORT}`
      );
    });

    registerShutdownHandlers();
  } catch (error) {
    console.error("Failed to start Project Autopsy:", error);
    await closeResources();
    process.exit(1);
  }
}

void startServer();
