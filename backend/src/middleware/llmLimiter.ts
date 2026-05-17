import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { config } from "../config/env";

export async function llmCostLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]
      ?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  const key = `llm_limit:${ip}`;
  const windowSec = Math.floor(config.llmRateLimitWindowMs / 1000);

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);

    if (count > config.llmRateLimitMax) {
      const ttl = await redis.ttl(key);
      res.status(429).json({
        error: `LLM query limit reached. Max ${config.llmRateLimitMax} queries/hour.`,
        code: "LLM_RATE_LIMIT_EXCEEDED",
        retry_after_seconds: ttl,
      });
      return;
    }

    next();
  } catch (err) {
    // Fail open — a Redis outage must not block real users
    console.error("llmCostLimiter error (failing open):", err);
    next();
  }
}
