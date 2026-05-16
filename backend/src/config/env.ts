import dotenv from "dotenv";
import { z } from "zod";
import { AppConfig } from "../types";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("5000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  UPSTASH_REDIS_REST_URL: z
    .string()
    .min(1, "UPSTASH_REDIS_REST_URL is required"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  EMBED_DIMENSIONS: z.string().default("2048"),
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
  console.error("Invalid environment variables:");
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
  RedisUrl: e.UPSTASH_REDIS_REST_URL,
  RedisToken: e.UPSTASH_REDIS_REST_TOKEN,
  openaiApiKey: e.OPENAI_API_KEY,
  openaiChatModel: e.OPENAI_CHAT_MODEL,
  openaiEmbedModel: e.OPENAI_EMBED_MODEL,
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
