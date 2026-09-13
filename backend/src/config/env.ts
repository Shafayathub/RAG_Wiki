import "dotenv/config";
import { z } from "zod";

/** `"false"`/`"0"` must read as false — `Boolean("false")` does not. */
const booleanFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === ""
        ? fallback
        : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()),
    );

const csvFromEnv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Upstash shows an https:// REST URL on its dashboard, but node-redis speaks
  // the RESP protocol — pasting the REST URL fails at connect time with a
  // confusing socket error, so reject it here with an actionable message.
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .refine(
      (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
      "REDIS_URL must start with redis:// or rediss:// (use the RESP URL, not the Upstash REST URL)",
    ),

  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
  OPENROUTER_EMBED_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),

  /** Public origin of the deployed app. Used for CORS and OpenRouter attribution. */
  APP_URL: z.string().url().default("http://localhost:5173"),
  /** Extra allowed browser origins, comma separated. APP_URL is always allowed. */
  CORS_ORIGINS: csvFromEnv,

  EMBED_DIMENSIONS: z.coerce.number().int().positive().max(2000).default(1536),
  CHUNK_SIZE: z.coerce.number().int().positive().default(512),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(50),
  TOP_K_RESULTS: z.coerce.number().int().positive().max(20).default(5),
  /** Vercel caps serverless request bodies at 4.5MB — stay under it by default. */
  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(50).default(4),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  LLM_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3_600_000),
  LLM_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // Ingestion bills one embedding call per batch of chunks, so it needs its own
  // budget: far fewer uploads than questions, because each costs much more.
  INGEST_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3_600_000),
  INGEST_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3),
  /** Hard ceiling on billed embeddings per upload, whatever the file contains. */
  MAX_CHUNKS_PER_DOCUMENT: z.coerce.number().int().positive().default(400),

  CACHE_TTL_QUERY: z.coerce.number().int().positive().default(3600),
  CACHE_TTL_EMBEDDING: z.coerce.number().int().positive().default(86_400),
  CACHE_TTL_RETRIEVAL: z.coerce.number().int().positive().default(1800),

  /**
   * Public demo hardening. When on, destructive endpoints require ADMIN_TOKEN,
   * so a stranger cannot wipe the seeded collections behind the resume link.
   */
  DEMO_MODE: booleanFromEnv(false),
  ADMIN_TOKEN: z.string().min(16).optional(),
  /**
   * Collections a public demo refuses to ingest into, comma separated. Ingest
   * upserts by name, so without this a stranger can merge their document into
   * the curated seed collection and there is no per-document undo.
   */
  PROTECTED_COLLECTIONS: csvFromEnv,

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  // Throwing beats process.exit here: serverless platforms surface the message
  // in the function log, and tests get a real stack instead of a dead worker.
  throw new Error(`Invalid environment configuration:\n${detail}`);
}

const env = parsed.data;

const allowedOrigins = Array.from(new Set([env.APP_URL, ...env.CORS_ORIGINS]));

/** The collection `pnpm seed` populates. Named here so it can be protected by default. */
export const SEED_COLLECTION_NAME = "Demo — How RAG Wiki Works";

const protectedCollections =
  env.PROTECTED_COLLECTIONS.length > 0 ? env.PROTECTED_COLLECTIONS : [SEED_COLLECTION_NAME];

if (env.DEMO_MODE && !env.ADMIN_TOKEN) {
  throw new Error(
    "DEMO_MODE requires ADMIN_TOKEN (min 16 chars) so destructive endpoints stay reachable to you.",
  );
}

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  /** Vercel sets this on every serverless invocation. */
  isServerless: Boolean(process.env["VERCEL"]),

  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,

  openRouterApiKey: env.OPENROUTER_API_KEY,
  openRouterModel: env.OPENROUTER_MODEL,
  openRouterEmbedModel: env.OPENROUTER_EMBED_MODEL,

  appUrl: env.APP_URL,
  allowedOrigins,

  embedDimensions: env.EMBED_DIMENSIONS,
  chunkSize: env.CHUNK_SIZE,
  chunkOverlap: env.CHUNK_OVERLAP,
  topKResults: env.TOP_K_RESULTS,
  maxFileSizeMb: env.MAX_FILE_SIZE_MB,

  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  llmRateLimitWindowMs: env.LLM_RATE_LIMIT_WINDOW_MS,
  llmRateLimitMax: env.LLM_RATE_LIMIT_MAX,
  ingestRateLimitWindowMs: env.INGEST_RATE_LIMIT_WINDOW_MS,
  ingestRateLimitMax: env.INGEST_RATE_LIMIT_MAX,
  maxChunksPerDocument: env.MAX_CHUNKS_PER_DOCUMENT,

  cacheTtlQuery: env.CACHE_TTL_QUERY,
  cacheTtlEmbedding: env.CACHE_TTL_EMBEDDING,
  cacheTtlRetrieval: env.CACHE_TTL_RETRIEVAL,

  demoMode: env.DEMO_MODE,
  adminToken: env.ADMIN_TOKEN,
  protectedCollections,
} as const;

export type AppConfig = typeof config;
