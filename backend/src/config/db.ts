import { Pool, type PoolConfig } from "pg";
import { config } from "./env";
import { logger } from "../utils/logger";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Managed Postgres (Neon, Supabase, Railway) presents a publicly trusted
 * certificate, so certificate verification stays on. Only a plain local
 * database opts out, and only because it speaks no TLS at all.
 */
function resolveSsl(connectionString: string): PoolConfig["ssl"] {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return undefined;
  }

  const mode = url.searchParams.get("sslmode");
  if (mode === "disable") return false;
  if (!mode && LOCAL_HOSTS.has(url.hostname)) return false;

  return { rejectUnauthorized: true };
}

export function createPool(connectionString: string = config.databaseUrl): Pool {
  return new Pool({
    connectionString,
    ssl: resolveSsl(connectionString),
    // One connection per serverless invocation: every concurrent request is a
    // separate instance, so a large pool per instance exhausts the DB's limit.
    max: config.isServerless ? 1 : 10,
    idleTimeoutMillis: config.isServerless ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool: Pool = createPool();

// Without this listener an error on an idle client is an unhandled 'error'
// event, which takes the whole process down.
pool.on("error", (err) => {
  logger.error("Idle Postgres client errored", err);
});

/**
 * pgvector requires the column width to match the vectors inserted exactly, so
 * a mismatch between EMBED_DIMENSIONS and the schema breaks every insert and
 * every similarity query. Checking it at startup turns a confusing runtime
 * error into a named configuration problem.
 */
export async function checkEmbeddingDimensions(): Promise<void> {
  const result = await pool.query<{ dimensions: number | null }>(
    `SELECT atttypmod AS dimensions
       FROM pg_attribute
      WHERE attrelid = 'chunks'::regclass
        AND attname = 'embedding'`,
  );

  const actual = result.rows[0]?.dimensions;

  // -1 means the column is an unconstrained vector, which accepts any width.
  if (actual === undefined || actual === null || actual === -1) return;

  if (actual !== config.embedDimensions) {
    throw new Error(
      `Embedding dimension mismatch: chunks.embedding is vector(${actual}) but ` +
        `EMBED_DIMENSIONS is ${config.embedDimensions}. Run the migrations, or ` +
        `set EMBED_DIMENSIONS to ${actual} if that matches your embedding model.`,
    );
  }
}

export async function checkDbConnection(): Promise<void> {
  await pool.query("SELECT 1");
  await checkEmbeddingDimensions();
  logger.info("Postgres connected", { embedDimensions: config.embedDimensions });
}

export async function closePool(): Promise<void> {
  await pool.end();
}
