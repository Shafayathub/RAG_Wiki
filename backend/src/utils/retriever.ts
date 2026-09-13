import { pool } from "../config/db";
import { redis, CacheKeys } from "../config/redis";
import { config } from "../config/env";
import { embedText } from "./embedder";
import type { ScoredChunk } from "../types";

/** 60 is the constant from the original Cormack et al. RRF paper. */
const RRF_K = 60;

interface RankedRow {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
}

interface VectorRow extends RankedRow {
  vector_score: number;
}

interface FtsRow extends RankedRow {
  fts_rank: number;
}

/**
 * Semantic arm of the hybrid search. `<=>` is pgvector's cosine distance, so
 * lower is closer, and the HNSW index makes the ORDER BY sublinear.
 */
async function vectorSearch(
  queryEmbedding: number[],
  collectionId: number | undefined,
  limit: number,
): Promise<VectorRow[]> {
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  const result = await pool.query<VectorRow>(
    `SELECT
       c.id AS chunk_id,
       c.document_id,
       d.filename,
       c.content,
       c.page_number,
       c.chunk_index,
       (c.embedding <=> $1::vector) AS vector_score
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.embedding IS NOT NULL
       AND ($3::int IS NULL OR d.collection_id = $3)
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [embeddingLiteral, limit, collectionId ?? null],
  );

  return result.rows;
}

/**
 * Lexical arm. plainto_tsquery is injection-safe and accepts natural language,
 * so exact terms the embedding glosses over — identifiers, error codes, proper
 * nouns — still retrieve.
 */
async function ftsSearch(
  query: string,
  collectionId: number | undefined,
  limit: number,
): Promise<FtsRow[]> {
  const result = await pool.query<FtsRow>(
    `SELECT
       c.id AS chunk_id,
       c.document_id,
       d.filename,
       c.content,
       c.page_number,
       c.chunk_index,
       ts_rank(c.fts_vector, plainto_tsquery('english', $1)) AS fts_rank
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.fts_vector @@ plainto_tsquery('english', $1)
       AND ($3::int IS NULL OR d.collection_id = $3)
     ORDER BY fts_rank DESC
     LIMIT $2`,
    [query, limit, collectionId ?? null],
  );

  return result.rows;
}

/**
 * Reciprocal Rank Fusion: each list contributes 1/(k + rank) per chunk, and
 * chunks found by both arms sum both contributions. Fusing ranks rather than
 * scores is what makes this work — a cosine distance and a ts_rank are not
 * comparable quantities, but their positions are.
 */
export function fuseWithRRF(
  vectorResults: VectorRow[],
  ftsResults: FtsRow[],
  topK: number,
): ScoredChunk[] {
  const scores = new Map<number, ScoredChunk>();

  vectorResults.forEach((row, index) => {
    scores.set(row.chunk_id, {
      chunk_id: row.chunk_id,
      document_id: row.document_id,
      filename: row.filename,
      content: row.content,
      page_number: row.page_number,
      chunk_index: row.chunk_index,
      rrf_score: 1 / (RRF_K + index + 1),
      vector_score: row.vector_score,
      fts_rank: 0,
    });
  });

  ftsResults.forEach((row, index) => {
    const rrfScore = 1 / (RRF_K + index + 1);
    const existing = scores.get(row.chunk_id);

    if (existing) {
      existing.rrf_score += rrfScore;
      existing.fts_rank = row.fts_rank;
      return;
    }

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
  });

  return Array.from(scores.values())
    .sort((a, b) => b.rrf_score - a.rrf_score)
    .slice(0, topK);
}

export async function hybridSearch(
  query: string,
  collectionId: number | undefined,
  topK: number = config.topKResults,
): Promise<ScoredChunk[]> {
  const cacheKey = CacheKeys.retrieval(query, collectionId);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as ScoredChunk[];
  } catch {
    // Cache miss by any other name.
  }

  const queryEmbedding = await embedText(query);

  // Over-fetch so RRF has a real pool to rerank; a chunk ranked 8th by vector
  // search but 1st lexically should still be able to reach the top 5.
  const candidateLimit = topK * 2;

  const [vectorResults, ftsResults] = await Promise.all([
    vectorSearch(queryEmbedding, collectionId, candidateLimit),
    ftsSearch(query, collectionId, candidateLimit),
  ]);

  const results = fuseWithRRF(vectorResults, ftsResults, topK);

  try {
    await redis.set(cacheKey, JSON.stringify(results), { EX: config.cacheTtlRetrieval });
  } catch {
    // Best-effort.
  }

  return results;
}
