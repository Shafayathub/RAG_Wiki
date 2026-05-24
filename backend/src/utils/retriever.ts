import { pool } from "../config/db";
import { redis, CacheKeys } from "../config/redis";
import { llm } from "../config/openrouter";
import { config } from "../config/env";
import { ScoredChunk } from "../types";

// ── RRF constant — 60 is the standard value from the original paper ───────────
const RRF_K = 60;

// ─────────────────────────────────────────────────────────────────────────────
//  Step 1 — Embed the query (with cache)
//  Same cache layer as the embedder — if the user asks the same
//  question twice we skip the OpenRouter call entirely.
// ─────────────────────────────────────────────────────────────────────────────

async function embedQuery(query: string): Promise<number[]> {
  const cacheKey = CacheKeys.embedding(query);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      // Parse cached embedding string back to number array
      return JSON.parse(cached) as number[];
    }
  } catch {
    // Redis down or parse error — proceed without cache
  }

  try {
    const response = await llm.embeddings.create({
      model: config.openRouterEmbedModel,
      input: query,
      dimensions: config.embedDimensions,
      encoding_format: "float",
    });

    // Debug: Log the response structure to understand what we're getting
    if (
      !response.data ||
      !Array.isArray(response.data) ||
      response.data.length === 0
    ) {
      throw new Error(
        `Invalid embedding response: ${JSON.stringify(response)}`,
      );
    }

    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error("No embedding returned from OpenRouter");

    try {
      // Store embedding as JSON string in Redis
      await redis.set(cacheKey, JSON.stringify(embedding), {
        EX: config.cacheTtlEmbedding,
      });
    } catch {
      // Cache write failed — not fatal
    }

    return embedding;
  } catch (error: any) {
    // Re-throw with more context
    throw new Error(`Failed to create embedding: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Step 2a — Vector search
//  Uses pgvector's <=> operator (cosine distance).
//  Lower distance = more similar.
//  We pull 2× top_k candidates here so RRF has enough to rerank from.
// ─────────────────────────────────────────────────────────────────────────────

interface VectorResult {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
  vector_score: number;
}

async function vectorSearch(
  queryEmbedding: number[],
  collectionId: number | undefined,
  limit: number,
): Promise<VectorResult[]> {
  // Format embedding as pgvector literal: '[x,y,z,...]'
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  const result = await pool.query<VectorResult>(
    `SELECT
       c.id            AS chunk_id,
       c.document_id,
       d.filename,
       c.content,
       c.page_number,
       c.chunk_index,
       (c.embedding <=> $1::vector) AS vector_score
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ${collectionId ? "JOIN collections col ON col.id = d.collection_id AND col.id = $3" : ""}
     WHERE c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    collectionId
      ? [embeddingLiteral, limit, collectionId]
      : [embeddingLiteral, limit],
  );

  return result.rows;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Step 2b — Full-text search (BM25 via tsvector)
//  plainto_tsquery is injection-safe and handles natural language
//  input without requiring the user to know tsquery syntax.
//  ts_rank returns a float — higher = more relevant.
// ─────────────────────────────────────────────────────────────────────────────

interface FtsResult {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
  fts_rank: number;
}

async function ftsSearch(
  query: string,
  collectionId: number | undefined,
  limit: number,
): Promise<FtsResult[]> {
  const result = await pool.query<FtsResult>(
    `SELECT
       c.id            AS chunk_id,
       c.document_id,
       d.filename,
       c.content,
       c.page_number,
       c.chunk_index,
       ts_rank(c.fts_vector, plainto_tsquery('english', $1)) AS fts_rank
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ${collectionId ? "JOIN collections col ON col.id = d.collection_id AND col.id = $3" : ""}
     WHERE c.fts_vector @@ plainto_tsquery('english', $1)
     ORDER BY fts_rank DESC
     LIMIT $2`,
    collectionId ? [query, limit, collectionId] : [query, limit],
  );

  return result.rows;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Step 3 — RRF fusion
//  Merges two ranked lists into one using Reciprocal Rank Fusion.
//  Each chunk gets: 1/(k + rank) from each list it appears in.
//  Chunks in both lists get the sum of both scores.
// ─────────────────────────────────────────────────────────────────────────────

function fuseWithRRF(
  vectorResults: VectorResult[],
  ftsResults: FtsResult[],
  topK: number,
): ScoredChunk[] {
  // Map of chunk_id → accumulated score + metadata
  const scores = new Map<number, ScoredChunk>();

  // Score from vector search
  vectorResults.forEach((row, index) => {
    const rrfScore = 1 / (RRF_K + index + 1);
    scores.set(row.chunk_id, {
      chunk_id: row.chunk_id,
      document_id: row.document_id,
      filename: row.filename,
      content: row.content,
      page_number: row.page_number,
      chunk_index: row.chunk_index,
      rrf_score: rrfScore,
      vector_score: row.vector_score,
      fts_rank: 0,
    });
  });

  // Add score from FTS (or accumulate if chunk already scored)
  ftsResults.forEach((row, index) => {
    const rrfScore = 1 / (RRF_K + index + 1);
    const existing = scores.get(row.chunk_id);

    if (existing) {
      // Chunk appeared in both lists — sum the scores
      existing.rrf_score += rrfScore;
      existing.fts_rank = row.fts_rank;
    } else {
      scores.set(row.chunk_id, {
        chunk_id: row.chunk_id,
        document_id: row.document_id,
        filename: row.filename,
        content: row.content,
        page_number: row.page_number,
        chunk_index: row.chunk_index,
        rrf_score: rrfScore,
        vector_score: 0,
        fts_rank: row.fts_rank,
      });
    }
  });

  // Sort by RRF score descending, return top-K
  return Array.from(scores.values())
    .sort((a, b) => b.rrf_score - a.rrf_score)
    .slice(0, topK);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API — hybridSearch
//  This is the only function imported by other modules.
//  Handles retrieval cache so repeated queries skip all DB calls.
// ─────────────────────────────────────────────────────────────────────────────

export async function hybridSearch(
  query: string,
  collectionId: number | undefined,
  topK: number = config.topKResults,
): Promise<ScoredChunk[]> {
  // ── Retrieval cache check ─────────────────────────────────────────────────
  const cacheKey = CacheKeys.retrieval(query, collectionId);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      // Parse cached results back to ScoredChunk array
      return JSON.parse(cached) as ScoredChunk[];
    }
  } catch {
    // Redis down or parse error — proceed without cache
  }

  // ── Embed the query ───────────────────────────────────────────────────────
  const queryEmbedding = await embedQuery(query);

  // ── Run both searches in parallel ─────────────────────────────────────────
  // 2× topK candidates gives RRF enough pool to rerank from
  const candidateLimit = topK * 2;

  const [vectorResults, ftsResults] = await Promise.all([
    vectorSearch(queryEmbedding, collectionId, candidateLimit),
    ftsSearch(query, collectionId, candidateLimit),
  ]);

  // ── Fuse with RRF ─────────────────────────────────────────────────────────
  const results = fuseWithRRF(vectorResults, ftsResults, topK);

  // ── Cache the result ──────────────────────────────────────────────────────
  try {
    // Store results as JSON string in Redis
    await redis.set(cacheKey, JSON.stringify(results), {
      EX: config.cacheTtlRetrieval,
    });
  } catch {
    // Cache write failed — not fatal
  }

  return results;
}
