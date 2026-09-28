import { app } from "./app.js";
import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./config/database.js";
import { checkRedisConnection } from "./config/redis.js";

async function startServer(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log("✓ PostgreSQL connected");

    await checkRedisConnection();
    console.log("✓ Redis connected");

    app.listen(env.PORT, () => {
      console.log(
        `✓ Project Autopsy API running on http://localhost:${env.PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start Project Autopsy:", error);
    process.exit(1);
  }
}

void startServer();
