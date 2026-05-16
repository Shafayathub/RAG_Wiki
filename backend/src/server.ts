import app from "./app";
import { config } from "./config/env";

async function start(): Promise<void> {
  try {
    app.listen(config.port, () => {
      console.log(
        `🚀  Server running on port ${config.port} [${config.nodeEnv}]`,
      );
    });
  } catch {
    console.error("Startup failed. Exiting.");
    process.exit(1);
  }
}

start();
