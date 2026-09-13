import { redis, CacheKeys } from "../../config/redis";
import { llm } from "../../config/openrouter";
import { pool } from "../../config/db";
import { config } from "../../config/env";
import { logger } from "../../utils/logger";
import { hybridSearch } from "../../utils/retriever";
import { buildContext, extractCitedSources } from "../../utils/contextBuilder";
import type {
  CacheHitType,
  CitationPayload,
  QueryMetadata,
  ScoredChunk,
} from "../../types";

export interface CachedAnswer {
  answer: string;
  citations: CitationPayload;
  meta: QueryMetadata;
}

export type QueryStreamEvent =
  | { type: "token"; token: string }
  | { type: "citation"; payload: CitationPayload }
  | { type: "meta"; meta: QueryMetadata };

const NO_CONTEXT_ANSWER =
  "I cannot find this in the provided documents. Try uploading a relevant document, or widening the collection filter to All collections.";

/** Total wall-clock budget for replaying a cached answer as a fake stream. */
const REPLAY_BUDGET_MS = 1_200;

async function writeQueryLog(
  queryText: string,
  collectionId: number | undefined,
  chunkIds: number[],
  answer: string,
  latencyMs: number,
  cacheHit: CacheHitType,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO query_logs
         (query_text, collection_id, retrieved_chunk_ids, answer_preview, latency_ms, cache_hit)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [queryText, collectionId ?? null, chunkIds, answer.slice(0, 500), latencyMs, cacheHit],
    );
  } catch (err) {
    // Analytics must never break an answer that was otherwise delivered.
    logger.warn("Failed to write query log", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function buildCitationPayload(
  citedSourceIds: string[],
  chunkMap: Map<string, ScoredChunk>,
): CitationPayload {
  const chunks = citedSourceIds
    .map((sourceId) => chunkMap.get(sourceId))
    .filter((chunk): chunk is ScoredChunk => chunk !== undefined)
    .map((chunk) => ({
      chunk_id: chunk.chunk_id,
      document_id: chunk.document_id,
      filename: chunk.filename,
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      content_preview: chunk.content.slice(0, 200),
    }));

  return { chunks };
}

async function readCachedAnswer(cacheKey: string): Promise<CachedAnswer | null> {
  try {
    const raw = await redis.get(cacheKey);
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
  } catch {
    return null;
  }
}

async function writeCachedAnswer(cacheKey: string, value: CachedAnswer): Promise<void> {
  try {
    await redis.set(cacheKey, JSON.stringify(value), { EX: config.cacheTtlQuery });
  } catch {
    // A cold cache is a performance problem, not a correctness one.
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Replays a cached answer word by word so a cache hit looks identical to a
 * live generation. The per-word delay shrinks with answer length, keeping the
 * whole replay inside a fixed budget instead of scaling with the answer.
 */
async function* replay(answer: string): AsyncGenerator<QueryStreamEvent> {
  const words = answer.split(" ");
  const delayMs = Math.min(15, REPLAY_BUDGET_MS / Math.max(words.length, 1));

  for (const word of words) {
    yield { type: "token", token: `${word} ` };
    if (delayMs >= 1) await sleep(delayMs);
  }
}

/**
 * The single entry point for answering a question.
 *
 * Cache hit and cache miss emit exactly the same event sequence, so the client
 * never branches on which path ran. It only reads meta.cache_hit to show a badge.
 */
export async function* streamQuery(
  query: string,
  collectionId: number | undefined,
  topK: number,
): AsyncGenerator<QueryStreamEvent> {
  const startedAt = Date.now();
  const cacheKey = CacheKeys.query(query, collectionId);

  const cached = await readCachedAnswer(cacheKey);

  if (cached) {
    yield* replay(cached.answer);
    yield { type: "citation", payload: cached.citations };

    const meta: QueryMetadata = {
      ...cached.meta,
      latency_ms: Date.now() - startedAt,
      cache_hit: "query",
    };
    yield { type: "meta", meta };

    await writeQueryLog(
      query,
      collectionId,
      cached.meta.retrieved_chunk_ids,
      cached.answer,
      meta.latency_ms,
      "query",
    );
    return;
  }

  const chunks = await hybridSearch(query, collectionId, topK);

  // Prompting a model with zero sources reliably produces a hallucination and
  // always costs money. Answer from the retrieval result instead.
  if (chunks.length === 0) {
    yield* replay(NO_CONTEXT_ANSWER);
    yield { type: "citation", payload: { chunks: [] } };
    yield {
      type: "meta",
      meta: {
        latency_ms: Date.now() - startedAt,
        retrieved_chunk_ids: [],
        cache_hit: "none",
      },
    };
    await writeQueryLog(query, collectionId, [], NO_CONTEXT_ANSWER, Date.now() - startedAt, "none");
    return;
  }

  const { prompt, chunkMap } = buildContext(query, chunks);

  const stream = await llm.chat.completions.create({
    model: config.openRouterModel,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  let answer = "";

  for await (const part of stream) {
    const token = part.choices[0]?.delta?.content ?? "";
    if (token) {
      answer += token;
      yield { type: "token", token };
    }
  }

  const citations = buildCitationPayload(extractCitedSources(answer), chunkMap);
  yield { type: "citation", payload: citations };

  const chunkIds = chunks.map((chunk) => chunk.chunk_id);
  const meta: QueryMetadata = {
    latency_ms: Date.now() - startedAt,
    retrieved_chunk_ids: chunkIds,
    cache_hit: "none",
  };
  yield { type: "meta", meta };

  // Awaited, not fire-and-forget: a serverless instance is frozen the moment
  // the response ends, which silently drops any still-pending promise.
  await writeCachedAnswer(cacheKey, { answer, citations, meta });
  await writeQueryLog(query, collectionId, chunkIds, answer, meta.latency_ms, "none");
}
