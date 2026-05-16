import { createClient, RedisClientType } from "redis";
import { config } from "./env";

export const redis = createClient({
  url: config.RedisUrl,
}) as RedisClientType;

export async function checkRedisConnection(): Promise<void> {
  try {
    await redis.connect(); 
    await redis.ping();
    console.log("✅  Upstash Redis connected");
  } catch (err) {
    console.error("❌  Upstash Redis connection failed:", err);
    throw err;
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

export const CacheKeys = {
  query: (text: string, collectionId?: number) =>
    `query:${collectionId ?? "all"}:${hashString(text)}`,
  embedding: (text: string) => `embed:${hashString(text)}`,
  retrieval: (text: string, collectionId?: number) =>
    `retrieval:${collectionId ?? "all"}:${hashString(text)}`,
} as const;
