import "dotenv/config";
import { z } from "zod";
import type { AppConfig } from "../types";

const envSchema = z.object({
  PORT: z.string().default("3001"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_EMBED_MODEL: z.string().default("openai/text-embedding-3-small"),
  EMBED_DIMENSIONS: z.string().default("1536"),
  RATE_LIMIT_WINDOW_MS: z.string().default("900000"),
  RATE_LIMIT_MAX_REQUESTS: z.string().default("100"),
  LLM_RATE_LIMIT_WINDOW_MS: z.string().default("3600000"),
  LLM_RATE_LIMIT_MAX: z.string().default("10"),
  CHUNK_SIZE: z.string().default("512"),
  CHUNK_OVERLAP: z.string().default("50"),
  TOP_K_RESULTS: z.string().default("5"),
  MAX_FILE_SIZE_MB: z.string().default("20"),
  CACHE_TTL_QUERY: z.string().default("3600"),
  CACHE_TTL_EMBEDDING: z.string().default("86400"),
  CACHE_TTL_RETRIEVAL: z.string().default("1800"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌  Invalid environment variables:");
  parsed.error.issues.forEach((i) => {
    console.error(`   ${i.path.join(".")}: ${i.message}`);
  });
  process.exit(1);
}

const e = parsed.data;

export const config: AppConfig = {
  port: parseInt(e.PORT, 10),
  nodeEnv: e.NODE_ENV,
  databaseUrl: e.DATABASE_URL,
  redisUrl: e.REDIS_URL,
  openRouterApiKey: e.OPENROUTER_API_KEY,
  openRouterModel: e.OPENROUTER_MODEL,
  openRouterEmbedModel: e.OPENROUTER_EMBED_MODEL,
  embedDimensions: parseInt(e.EMBED_DIMENSIONS, 10),
  rateLimitWindowMs: parseInt(e.RATE_LIMIT_WINDOW_MS, 10),
  rateLimitMaxRequests: parseInt(e.RATE_LIMIT_MAX_REQUESTS, 10),
  llmRateLimitWindowMs: parseInt(e.LLM_RATE_LIMIT_WINDOW_MS, 10),
  llmRateLimitMax: parseInt(e.LLM_RATE_LIMIT_MAX, 10),
  chunkSize: parseInt(e.CHUNK_SIZE, 10),
  chunkOverlap: parseInt(e.CHUNK_OVERLAP, 10),
  topKResults: parseInt(e.TOP_K_RESULTS, 10),
  maxFileSizeMb: parseInt(e.MAX_FILE_SIZE_MB, 10),
  cacheTtlQuery: parseInt(e.CACHE_TTL_QUERY, 10),
  cacheTtlEmbedding: parseInt(e.CACHE_TTL_EMBEDDING, 10),
  cacheTtlRetrieval: parseInt(e.CACHE_TTL_RETRIEVAL, 10),
};
