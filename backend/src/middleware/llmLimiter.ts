import type { NextFunction, Request, RequestHandler, Response } from "express";
import { redis } from "../config/redis";
import { config } from "../config/env";

/**
 * Increment and expire in one atomic step. Doing it as INCR followed by a
 * separate EXPIRE leaves the key with no TTL if the second call is lost, and a
 * counter that never resets locks that IP out permanently.
 */
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

interface Consumed {
  count: number;
  ttl: number;
}

/**
 * Per-instance fallback used only while Redis is unreachable. A serverless
 * instance is short-lived, so this is a floor rather than a real limit — but a
 * floor is the point: the paid endpoints must not become free during an outage
 * the way the general rate limiter is allowed to.
 */
const fallbackCounters = new Map<string, { count: number; resetAt: number }>();
const FALLBACK_MAX_KEYS = 10_000;

function consumeInProcess(key: string, windowMs: number): Consumed {
  const now = Date.now();

  // Bounded by construction: an unbounded map keyed by client IP is a memory
  // leak on a long-lived instance.
  if (fallbackCounters.size > FALLBACK_MAX_KEYS) {
    for (const [existing, entry] of fallbackCounters) {
      if (entry.resetAt <= now) fallbackCounters.delete(existing);
    }
    if (fallbackCounters.size > FALLBACK_MAX_KEYS) fallbackCounters.clear();
  }

  const entry = fallbackCounters.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    fallbackCounters.set(key, { count: 1, resetAt });
    return { count: 1, ttl: Math.ceil(windowMs / 1000) };
  }

  entry.count += 1;
  return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) };
}

interface BudgetOptions {
  /** Redis key prefix, so the two budgets cannot consume each other. */
  prefix: string;
  windowMs: number;
  max: number;
  code: string;
  message: (max: number, windowMinutes: number) => string;
}

/**
 * Per-IP budget guard for endpoints that spend money. Separate from the general
 * rate limiter because the limits differ by orders of magnitude, and because
 * this one must not fail open: browsing collections being free during an outage
 * is fine, unmetered model calls are not.
 */
function createCostLimiter(options: BudgetOptions): RequestHandler {
  const windowSec = Math.floor(options.windowMs / 1000);
  const windowMinutes = Math.round(windowSec / 60);

  return async function costLimiter(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const key = `${options.prefix}:${req.ip ?? "unknown"}`;
    let consumed: Consumed;

    try {
      const result = (await redis.eval(CONSUME, {
        keys: [key],
        arguments: [String(windowSec)],
      })) as [number, number];

      consumed = { count: Number(result[0]), ttl: Number(result[1]) };
    } catch (err) {
      req.log.warn("Cost limiter degraded to the in-process counter", {
        limiter: options.prefix,
        message: err instanceof Error ? err.message : "unknown error",
      });
      consumed = consumeInProcess(key, options.windowMs);
    }

    if (consumed.count > options.max) {
      res.status(429).json({
        error: options.message(options.max, windowMinutes),
        code: options.code,
        retry_after_seconds: consumed.ttl > 0 ? consumed.ttl : windowSec,
      });
      return;
    }

    next();
  };
}

export const llmCostLimiter: RequestHandler = createCostLimiter({
  prefix: "llm_limit",
  windowMs: config.llmRateLimitWindowMs,
  max: config.llmRateLimitMax,
  code: "LLM_RATE_LIMIT_EXCEEDED",
  message: (max, minutes) => `Query limit reached. Max ${max} questions per ${minutes} minutes.`,
});

export const ingestCostLimiter: RequestHandler = createCostLimiter({
  prefix: "ingest_limit",
  windowMs: config.ingestRateLimitWindowMs,
  max: config.ingestRateLimitMax,
  code: "INGEST_RATE_LIMIT_EXCEEDED",
  message: (max, minutes) => `Upload limit reached. Max ${max} documents per ${minutes} minutes.`,
});
