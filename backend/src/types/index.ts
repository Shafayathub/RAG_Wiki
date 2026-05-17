// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface Collection {
  id:         number;
  name:       string;
  created_at: Date;
}

export interface Document {
  id:            number;
  collection_id: number;
  filename:      string;
  file_type:     "pdf" | "markdown";
  total_chunks:  number;
  uploaded_at:   Date;
}

export interface Chunk {
  id:          number;
  document_id: number;
  chunk_index: number;
  page_number: number | null;
  content:     string;
  embedding:   number[] | null;
  token_count: number;
  created_at:  Date;
}

export interface QueryLog {
  id:                   number;
  query_text:           string;
  collection_id:        number | null;
  retrieved_chunk_ids:  number[];
  answer_preview:       string;
  latency_ms:           number;
  cache_hit:            CacheHitType;
  created_at:           Date;
}

// ── Pipeline intermediates ────────────────────────────────────────────────────

/** Text chunk before DB insert — no id yet */
export interface RawChunk {
  content:     string;
  chunk_index: number;
  page_number: number | null;
  token_count: number;
}

/** RawChunk + its embedding vector — ready for DB insert */
export interface EmbeddedChunk extends RawChunk {
  embedding: number[];
}

/** Chunk returned from hybrid search with combined RRF score */
export interface ScoredChunk {
  chunk_id:    number;
  document_id: number;
  filename:    string;
  content:     string;
  page_number: number | null;
  chunk_index: number;
  rrf_score:   number;   // final combined rank score
  vector_score: number;  // cosine distance
  fts_rank:    number;   // full-text search rank
}

// ── API shapes ────────────────────────────────────────────────────────────────

export interface IngestResponse {
  document_id:  number;
  collection_id: number;
  filename:     string;
  total_chunks: number;
  message:      string;
}

export interface QueryRequest {
  query:         string;
  collection_id?: number;
  top_k?:        number;
}

export interface CitationPayload {
  chunks: Array<{
    chunk_id:        number;
    document_id:     number;
    filename:        string;
    page_number:     number | null;
    chunk_index:     number;
    content_preview: string;  // first 200 chars
  }>;
}

export type CacheHitType = "query" | "retrieval" | "none";

export interface QueryMetadata {
  latency_ms:           number;
  retrieved_chunk_ids:  number[];
  cache_hit:            CacheHitType;
}

// ── SSE event union ───────────────────────────────────────────────────────────
// Every message streamed from POST /api/query has one of these shapes.

export type SSEEvent =
  | { event: "token";    data: string }
  | { event: "citation"; data: CitationPayload }
  | { event: "meta";     data: QueryMetadata }
  | { event: "error";    data: { message: string } };

// ── Config ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  port:                 number;
  nodeEnv:              "development" | "production" | "test";
  databaseUrl:          string;
  redisUrl:             string;
  openRouterApiKey:     string;
  openRouterModel:      string;
  openRouterEmbedModel: string;
  embedDimensions:      number;
  rateLimitWindowMs:    number;
  rateLimitMaxRequests: number;
  llmRateLimitWindowMs: number;
  llmRateLimitMax:      number;
  chunkSize:            number;
  chunkOverlap:         number;
  topKResults:          number;
  maxFileSizeMb:        number;
  cacheTtlQuery:        number;
  cacheTtlEmbedding:    number;
  cacheTtlRetrieval:    number;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}