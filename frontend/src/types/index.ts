// ── API response shapes ───────────────────────────────────────────────────────

export interface Collection {
  id: number;
  name: string;
  created_at: string;
}

/** A collection plus the aggregate counts the sidebar and filter render. */
export interface CollectionSummary extends Collection {
  document_count: number;
  chunk_count: number;
}

export interface IngestResponse {
  document_id: number;
  collection_id: number;
  filename: string;
  total_chunks: number;
  message: string;
}

export interface CitationChunk {
  chunk_id: number;
  document_id: number;
  filename: string;
  page_number: number | null;
  chunk_index: number;
  content_preview: string;
}

export interface CitationPayload {
  chunks: CitationChunk[];
}

export interface QueryMeta {
  latency_ms: number;
  retrieved_chunk_ids: number[];
  cache_hit: "query" | "retrieval" | "none";
}

// ── Chat message shapes ───────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  citations: CitationPayload | null;
  meta: QueryMeta | null;
  isStreaming: boolean;
  /** Set when `content` holds a failure message rather than an answer. */
  isError?: boolean;
}

// ── SSE stream state ──────────────────────────────────────────────────────────

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export interface StreamState {
  status: StreamStatus;
  errorMessage: string | null;
}
