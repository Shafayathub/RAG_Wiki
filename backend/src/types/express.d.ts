import type { Logger } from "../utils/logger";

declare global {
  namespace Express {
    interface Request {
      /** Correlates every log line and error response for a single request. */
      id: string;
      log: Logger;
    }
  }
}

export {};
