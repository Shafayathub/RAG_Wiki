import { createClient, type RedisClientType } from "redis";
import { config } from "./env";
import { logger } from "../utils/logger";

export const redis: RedisClientType = createClient({
  url: config.redisUrl,
  socket: {
    // Serverless instances are short-lived; retrying forever just burns the
    // function's wall clock. Give up after five attempts and fail open.
    reconnectStrategy: (retries) =>
      retries > 5 ? false : Math.min(retries * 100, 1_000),
  },
});

// node-redis emits 'error' on every failed reconnect. Unhandled, it crashes
// the process — so absorb it here and let callers degrade gracefully instead.
redis.on("error", (err) => {
  logger.warn("Redis client error", { message: (err as Error).message });
});

let pending: Promise<void> | null = null;

/**
 * Connect on first use and reuse the socket for the lifetime of the instance.
 * Concurrent callers share one in-flight connect instead of racing.
 */
export async function ensureRedis(): Promise<RedisClientType> {
  if (redis.isOpen) return redis;

  pending ??= redis
    .connect()
    .then(() => {
      logger.info("Redis connected");
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });

  await pending;
  return redis;
}

export async function checkRedisConnection(): Promise<void> {
  await ensureRedis();
  await redis.ping();
}

export async function closeRedis(): Promise<void> {
  if (redis.isOpen) await redis.quit();
}

/**
 * FNV-1a. Keys must be short and stable, not cryptographically strong —
 * a collision only costs one wrong cache hit, and the 32-bit space is far
 * wider than any single deployment's query volume.
 */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const CacheKeys = {
  query: (text: string, collectionId?: number) =>
    `query:${collectionId ?? "all"}:${hashString(text)}`,
  embedding: (text: string) => `embed:${hashString(text)}`,
  retrieval: (text: string, collectionId?: number) =>
    `retrieval:${collectionId ?? "all"}:${hashString(text)}`,
} as const;
