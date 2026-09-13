import type { Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis";
import { config } from "./../config/env";

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMaxRequests,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  // Shared across serverless instances — an in-memory store would reset on
  // every cold start and enforce nothing.
  store: new RedisStore({
    prefix: "rl:",
    sendCommand: (...args: string[]) => redis.sendCommand(args),
  }),

  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    });
  },
});

/**
 * Fail open. A Redis outage should slow nobody down — the LLM cost limiter is
 * the budget guard that actually matters, and it makes the same trade.
 */
export const ipRateLimiter: RequestHandler = (req, res, next) => {
  limiter(req, res, (err?: unknown) => {
    if (err) {
      req.log.warn("Rate limiter unavailable — allowing request", {
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
    next();
  });
};
