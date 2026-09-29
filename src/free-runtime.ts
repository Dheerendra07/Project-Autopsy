import { db } from "./config/database.js";
import { redis } from "./config/redis.js";

process.env.AUTOPSY_COMBINED_RUNTIME = "1";

const [{ startServer, closeServer }, { closeAnalysisWorker }] =
  await Promise.all([
    import("./server.js"),
    import("./workers/analysis.worker.js")
  ]);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(
    `Received ${signal}. Shutting down Project Autopsy combined runtime...`
  );

  const forceExitTimer = setTimeout(() => {
    console.error("Combined runtime graceful shutdown timed out.");
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    await closeServer();
    await closeAnalysisWorker();

    await Promise.allSettled([
      db.end(),
      redis.quit()
    ]);

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error("Combined runtime shutdown failed:", error);
    await Promise.allSettled([
      db.end(),
      redis.quit()
    ]);
    process.exit(1);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

await startServer();
