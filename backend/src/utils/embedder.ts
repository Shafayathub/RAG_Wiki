import { llm } from "../config/openrouter";
import { redis, CacheKeys } from "../config/redis";
import { config } from "../config/env";
import { logger } from "./logger";
import { AppError, type EmbeddedChunk, type RawChunk } from "../types";

/**
 * One embedding request carries many inputs. Twenty keeps each request well
 * under the provider's per-request token ceiling while collapsing what used to
 * be twenty round trips into one.
 */
const BATCH_SIZE = 20;

/**
 * Some providers (notably the Nvidia models on OpenRouter) ignore the
 * `dimensions` parameter and always return their native width. pgvector's HNSW
 * index caps at 2000, and the column is fixed, so every vector is normalised to
 * the configured width before it can reach the database or the cache.
 */
function fitToDimensions(embedding: number[]): number[] {
  return embedding.length > config.embedDimensions
    ? embedding.slice(0, config.embedDimensions)
    : embedding;
}

async function readCached(texts: string[]): Promise<Map<string, number[]>> {
  const hits = new Map<string, number[]>();
  if (texts.length === 0) return hits;

  try {
    const keys = texts.map((text) => CacheKeys.embedding(text));
    const values = await redis.mGet(keys);

    values.forEach((value, index) => {
      if (!value) return;
      try {
        hits.set(texts[index]!, fitToDimensions(JSON.parse(value) as number[]));
      } catch {
        // A corrupt entry is simply a miss.
      }
    });
  } catch {
    // Redis down — every text is a miss.
  }

  return hits;
}

async function writeCached(entries: Array<[string, number[]]>): Promise<void> {
  await Promise.all(
    entries.map(async ([text, embedding]) => {
      try {
        await redis.set(CacheKeys.embedding(text), JSON.stringify(embedding), {
          EX: config.cacheTtlEmbedding,
        });
      } catch {
        // Cache writes are best-effort.
      }
    }),
  );
}

async function requestEmbeddings(inputs: string[]): Promise<number[][]> {
  try {
    const response = await llm.embeddings.create({
      model: config.openRouterEmbedModel,
      input: inputs,
      dimensions: config.embedDimensions,
      encoding_format: "float",
    });

    // Dense, not `new Array(n)`: that produces holes, and `some`/`forEach` skip
    // holes entirely, so the missing-vector check below would never fire and a
    // hole would be stored as a chunk's embedding.
    const ordered: Array<number[] | undefined> = Array.from(
      { length: inputs.length },
      () => undefined,
    );

    // Providers are permitted to return results out of order, so index by the
    // response's own `index` field rather than by array position.
    for (const item of response.data ?? []) {
      if (item.index >= 0 && item.index < inputs.length) {
        ordered[item.index] = fitToDimensions(item.embedding);
      }
    }

    const complete: number[][] = [];

    for (const embedding of ordered) {
      if (embedding === undefined) {
        throw new AppError(
          502,
          "Embedding provider returned fewer vectors than inputs.",
          "EMBEDDING_FAILED",
        );
      }
      complete.push(embedding);
    }

    return complete;
  } catch (err) {
    if (err instanceof AppError) throw err;

    logger.error("Embedding request failed", err, { inputs: inputs.length });
    throw new AppError(502, "Embedding provider is unavailable.", "EMBEDDING_PROVIDER_ERROR");
  }
}

/**
 * Embeds many texts, reading through a shared cache. Used for both ingestion
 * and query embedding so a question that matches an ingested chunk verbatim
 * costs nothing, and so both paths normalise dimensions identically.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const cached = await readCached(texts);
  const missing = [...new Set(texts.filter((text) => !cached.has(text)))];

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const embeddings = await requestEmbeddings(batch);

    const fresh = batch.map(
      (text, index) => [text, embeddings[index]!] as [string, number[]],
    );

    for (const [text, embedding] of fresh) cached.set(text, embedding);
    await writeCached(fresh);
  }

  return texts.map((text) => cached.get(text)!);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding!;
}

export async function embedChunks(chunks: RawChunk[]): Promise<EmbeddedChunk[]> {
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  return chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index]! }));
}
