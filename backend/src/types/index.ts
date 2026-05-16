// All domain types — single source of truth

export interface Collection {
  id: number;
  name: string;
  created_at: Date;
}

export interface Document {
  id: number;
  collection_id: number;
  filename: string;
  file_type: "pdf" | "markdown";
  total_chunks: number;
  uploaded_at: Date;
}

export interface Chunk {
  id: number;
  document_id: number;
  chunk_index: number;
  page_number: number | null;
  content: string;
  embedding: number[] | null;
  token_count: number;
  created_at: Date;
}

export interface RawChunk {
  content: string;
  chunk_index: number;
  page_number: number | null;
  token_count: number;
}

export interface EmbeddedChunk extends RawChunk {
  embedding: number[];
}

export interface ScoredChunk {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
  rrf_score: number;
  vector_score: number;
  fts_rank: number;
}

export interface IngestResponse {
  document_id: number;
  collection_id: number;
  filename: string;
  total_chunks: number;
  message: string;
}

export interface QueryRequest {
  query: string;
  collection_id?: number;
  top_k?: number;
}

export interface CitationPayload {
  chunks: Array<{
    chunk_id: number;
    document_id: number;
    filename: string;
    page_number: number | null;
    chunk_index: number;
    content_preview: string;
  }>;
}

export type CacheHitType = "query" | "retrieval" | "none";

export interface QueryMetadata {
  latency_ms: number;
  retrieved_chunk_ids: number[];
  cache_hit: CacheHitType;
}

export type SSEEvent =
  | { event: "token"; data: string }
  | { event: "citation"; data: CitationPayload }
  | { event: "meta"; data: QueryMetadata }
  | { event: "error"; data: { message: string } };

export interface AppConfig {
  port: number;
  nodeEnv: "development" | "production" | "test";
  databaseUrl: string;
  RedisUrl: string;
  RedisToken: string;
  openaiApiKey: string;
  openaiChatModel: string;
  openaiEmbedModel: string;
  embedDimensions: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  llmRateLimitWindowMs: number;
  llmRateLimitMax: number;
  chunkSize: number;
  chunkOverlap: number;
  topKResults: number;
  maxFileSizeMb: number;
  cacheTtlQuery: number;
  cacheTtlEmbedding: number;
  cacheTtlRetrieval: number;
}


