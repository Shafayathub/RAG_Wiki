import type { Server } from "node:http";
import app from "./app";
import { config } from "./config/env";
import { checkDbConnection, closePool } from "./config/db";
import { checkRedisConnection, closeRedis } from "./config/redis";
import { logger } from "./utils/logger";

async function start(): Promise<void> {
  try {
    await checkDbConnection();
  } catch (err) {
    logger.error("Postgres is unreachable — refusing to start", err);
    process.exit(1);
  }

  // Redis only makes the app faster and safer, never correct. Boot without it
  // and let the per-request fallbacks handle a later recovery.
  try {
    await checkRedisConnection();
  } catch (err) {
    logger.warn("Redis is unreachable — starting with caching disabled", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const server: Server = app.listen(config.port, () => {
    logger.info("Server listening", {
      port: config.port,
      env: config.nodeEnv,
      demoMode: config.demoMode,
    });
  });

  let shuttingDown = false;

  function shutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });

    // Stop accepting connections, let in-flight streams finish, then release
    // the pooled DB connections so Postgres does not hold them open.
    const timer = setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000);
    timer.unref();

    server.close(async () => {
      await Promise.allSettled([closePool(), closeRedis()]);
      clearTimeout(timer);
      logger.info("Shutdown complete");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", reason);
  });
}

void start();
