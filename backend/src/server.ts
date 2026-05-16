import app from "./app";
import { config } from "./config/env";
import { checkDbConnection } from "./config/db";
import { checkRedisConnection } from "./config/redis";

async function start(): Promise<void> {
  try {
    await checkDbConnection();
    await checkRedisConnection();

    app.listen(config.port, () => {
      console.log(
        `Server running on port ${config.port} [${config.nodeEnv}]`,
      );
    });
  } catch {
    console.error("Startup failed. Exiting.");
    process.exit(1);
  }
}

start();
