// ── API response shapes ───────────────────────────────────────────────────────

export interface Collection {
  id: number;
  name: string;
  created_at: string;
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
}

// ── SSE stream state ──────────────────────────────────────────────────────────

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export interface StreamState {
  status: StreamStatus;
  errorMessage: string | null;
}
