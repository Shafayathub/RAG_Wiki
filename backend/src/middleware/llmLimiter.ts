import type { NextFunction, Request, Response } from "express";
import { redis } from "../config/redis";
import { config } from "../config/env";

/**
 * Per-IP budget guard on the only endpoint that spends money. Separate from
 * the general rate limiter because the limits differ by orders of magnitude:
 * browsing collections is free, generating an answer is not.
 */
export async function llmCostLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = `llm_limit:${req.ip ?? "unknown"}`;
  const windowSec = Math.floor(config.llmRateLimitWindowMs / 1000);

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);

    if (count > config.llmRateLimitMax) {
      const ttl = await redis.ttl(key);
      res.status(429).json({
        error: `Query limit reached. Max ${config.llmRateLimitMax} questions per ${Math.round(
          windowSec / 60,
        )} minutes.`,
        code: "LLM_RATE_LIMIT_EXCEEDED",
        retry_after_seconds: ttl > 0 ? ttl : windowSec,
      });
      return;
    }

    next();
  } catch (err) {
    req.log.warn("LLM cost limiter unavailable — allowing request", {
      message: err instanceof Error ? err.message : String(err),
    });
    next();
  }
}
