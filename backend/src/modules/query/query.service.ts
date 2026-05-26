import { redis, CacheKeys } from "../../config/redis";
import { llm } from "../../config/openrouter";
import { pool } from "../../config/db";
import { config } from "../../config/env";
import {
  ScoredChunk,
  CitationPayload,
  QueryMetadata,
  CacheHitType,
} from "../../types";
import { hybridSearch } from "../../utils/retriever";
import { buildContext, extractCitedSources } from "../../utils/contextBuilder";

export interface QueryPipelineResult {
  answer:    string;
  citations: CitationPayload;
  meta:      QueryMetadata;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Query log — fire-and-forget, never blocks the response
// ─────────────────────────────────────────────────────────────────────────────

async function writeQueryLog(
  queryText:    string,
  collectionId: number | undefined,
  chunkIds:     number[],
  answer:       string,
  latencyMs:    number,
  cacheHit:     CacheHitType,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO query_logs
         (query_text, collection_id, retrieved_chunk_ids, answer_preview, latency_ms, cache_hit)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        queryText,
        collectionId ?? null,
        chunkIds,
        answer.slice(0, 500),
        latencyMs,
        cacheHit,
      ],
    );
  } catch (err) {
    // Log write failure is non-fatal — never surface to user
    console.error("Failed to write query log:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Build citation payload from cited source ids + chunk map
// ─────────────────────────────────────────────────────────────────────────────

function buildCitationPayload(
  citedSourceIds: string[],
  chunkMap:       Map<string, ScoredChunk>,
): CitationPayload {
  const chunks = citedSourceIds
    .map((sourceId) => {
      const chunk = chunkMap.get(sourceId);
      if (!chunk) return null;

      return {
        chunk_id:        chunk.chunk_id,
        document_id:     chunk.document_id,
        filename:        chunk.filename,
        page_number:     chunk.page_number,
        chunk_index:     chunk.chunk_index,
        content_preview: chunk.content.slice(0, 200),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return { chunks };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Non-streaming pipeline — used for cache hits
//  Returns the full result immediately so the controller can
//  replay it token-by-token over SSE (simulated streaming).
// ─────────────────────────────────────────────────────────────────────────────

export async function runQueryPipeline(
  query:        string,
  collectionId: number | undefined,
  topK:         number,
): Promise<QueryPipelineResult> {
  const startTime = Date.now();

  // ── 1. Query cache check ──────────────────────────────────────────────────
  const queryCacheKey = CacheKeys.query(query, collectionId);

  try {
    const cachedString = await redis.get(queryCacheKey);
    if (cachedString) {
      const cached = JSON.parse(cachedString) as QueryPipelineResult;
      // Update meta to reflect it was a cache hit
      cached.meta.cache_hit = "query";

      writeQueryLog(
        query,
        collectionId,
        cached.meta.retrieved_chunk_ids,
        cached.answer,
        Date.now() - startTime,
        "query",
      );

      return cached;
    }
  } catch {
    // Redis down — proceed to full pipeline
  }

  // ── 2. Hybrid retrieval (has its own retrieval cache inside) ──────────────
  const chunks = await hybridSearch(query, collectionId, topK);

  // ── 3. Build prompt ───────────────────────────────────────────────────────
  const { prompt, chunkMap } = buildContext(query, chunks);

  // ── 4. LLM call (non-streaming — collect full answer for caching) ─────────
  const completion = await llm.chat.completions.create({
    model:    config.openRouterModel,
    messages: [{ role: "user", content: prompt }],
    stream:   false,
  });

  const answer = completion.choices[0]?.message?.content ?? "";

  // ── 5. Extract citations ──────────────────────────────────────────────────
  const citedSourceIds = extractCitedSources(answer);
  const citations      = buildCitationPayload(citedSourceIds, chunkMap);
  const chunkIds       = chunks.map((c) => c.chunk_id);
  const latencyMs      = Date.now() - startTime;

  const result: QueryPipelineResult = {
    answer,
    citations,
    meta: {
      latency_ms:           latencyMs,
      retrieved_chunk_ids:  chunkIds,
      cache_hit:            "none",
    },
  };

  // ── 6. Cache the full result ──────────────────────────────────────────────
  try {
    await redis.set(queryCacheKey, JSON.stringify(result), { EX: config.cacheTtlQuery });
  } catch {
    // Cache write failed — not fatal
  }

  // ── 7. Write query log ────────────────────────────────────────────────────
  writeQueryLog(query, collectionId, chunkIds, answer, latencyMs, "none");

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Streaming pipeline — used for fresh (non-cached) queries
//  Yields tokens as they arrive so the controller can pipe
//  them directly to the SSE response.
// ─────────────────────────────────────────────────────────────────────────────

export async function* streamQueryPipeline(
  query:        string,
  collectionId: number | undefined,
  topK:         number,
): AsyncGenerator<
  | { type: "token";    token: string }
  | { type: "citation"; payload: CitationPayload }
  | { type: "meta";     meta: QueryMetadata },
  void,
  unknown
> {
  const startTime = Date.now();

  // ── 1. Retrieve ───────────────────────────────────────────────────────────
  const chunks = await hybridSearch(query, collectionId, topK);

  // ── 2. Build context ──────────────────────────────────────────────────────
  const { prompt, chunkMap } = buildContext(query, chunks);

  // ── 3. Stream from OpenRouter ─────────────────────────────────────────────
  const stream = await llm.chat.completions.create({
    model:    config.openRouterModel,
    messages: [{ role: "user", content: prompt }],
    stream:   true,
  });

  let fullAnswer = "";

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    if (token) {
      fullAnswer += token;
      yield { type: "token", token };
    }
  }

  // ── 4. Citations ──────────────────────────────────────────────────────────
  const citedSourceIds = extractCitedSources(fullAnswer);
  const citations      = buildCitationPayload(citedSourceIds, chunkMap);
  yield { type: "citation", payload: citations };

  // ── 5. Meta ───────────────────────────────────────────────────────────────
  const chunkIds  = chunks.map((c) => c.chunk_id);
  const latencyMs = Date.now() - startTime;

  const meta: QueryMetadata = {
    latency_ms:          latencyMs,
    retrieved_chunk_ids: chunkIds,
    cache_hit:           "none",
  };
  yield { type: "meta", meta };

  // ── 6. Cache the full result for future identical queries ─────────────────
  try {
    const queryCacheKey = CacheKeys.query(query, collectionId);
    await redis.set(
      queryCacheKey,
      JSON.stringify({ answer: fullAnswer, citations, meta }),
      { EX: config.cacheTtlQuery },
    );
  } catch {
    // Cache write failed — not fatal
  }

  // ── 7. Write query log ────────────────────────────────────────────────────
  writeQueryLog(query, collectionId, chunkIds, fullAnswer, latencyMs, "none");
}