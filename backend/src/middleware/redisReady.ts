import type { RequestHandler } from "express";
import { ensureRedis } from "../config/redis";

/**
 * Serverless instances start with no Redis socket. Connect once per instance
 * before the handlers run, but never block the request on it: caching and
 * rate limiting are both designed to degrade rather than fail.
 */
export const redisReady: RequestHandler = (req, _res, next) => {
  ensureRedis()
    .catch((err: unknown) => {
      req.log.warn("Redis unavailable — continuing without cache", {
        message: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => next());
};
