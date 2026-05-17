# Phase 2 Completion Summary

## Overview
Phase 2 of the AI Research Assistant implemented the full **document ingestion pipeline** — transforming raw file uploads into searchable, semantically embedded chunks stored in PostgreSQL with pgvector. This phase also addressed several real-world issues with free-tier embedding models on OpenRouter, resulting in a production-resilient ingestion flow.

---

## What Was Accomplished

### 1. Document Chunking Utility (`src/utils/chunker.ts`)
Implemented a complete file-to-chunks pipeline supporting PDF and Markdown formats:

- **Recursive character splitter**: Breaks text on paragraph → sentence → word boundaries before hard-cutting, preserving semantic units within chunks
- **Token-aware sizing**: Uses `tiktoken` (GPT-4o vocabulary) to count tokens accurately, respecting the `CHUNK_SIZE` config
- **Sliding window overlap**: Each chunk shares `CHUNK_OVERLAP` tokens with the previous chunk to avoid losing context at boundaries
- **PDF chunking** (`chunkPdf`): Reads PDFs with `pdf-parse`, splits on form-feed (`\f`) page separators so `page_number` metadata is accurate for citations
- **Markdown chunking** (`chunkMarkdown`): Parses Markdown to HTML via `marked`, strips HTML tags, then chunks as plain text
- Fixed `pdf-parse` import issue — uses named `PDFParse` class constructor instead of default function call

### 2. Embedding Utility (`src/utils/embedder.ts`)
Implemented a batched, cache-first embedding pipeline:

- **Cache-first lookup**: Checks Upstash Redis before calling the API — cache hit = $0 cost
- **Batched API calls**: Sends chunks in batches of 20 to stay within OpenRouter's per-request token limits, with 200ms delay between batches to respect rate limits
- **Result caching**: Stores embeddings in Redis with 24-hour TTL (`CACHE_TTL_EMBEDDING`)
- **AppError integration**: All errors throw `AppError` instances with proper status codes and error codes (`EMBEDDING_FAILED`, `API_ERROR`)

#### Free-Model Compatibility Fixes
Resolved three successive issues caused by using the free Nvidia embedding model (`nvidia/llama-nemotron-embed-vl-1b-v2:free`):

| # | Problem | Fix |
|---|---------|-----|
| 1 | `TypeError: Cannot read properties of undefined (reading '0')` — `response.data` was `undefined` on API error | Wrapped API call in `try/catch`; used optional chaining `response?.data?.[0]?.embedding` |
| 2 | `"Nvidia embeddings do not support base64 encoding_format"` — OpenAI SDK defaults to `base64` | Explicitly set `encoding_format: "float"` in the API call |
| 3 | `"expected 2000 dimensions, not 2048"` — Nvidia model ignores the `dimensions` parameter, always returns 2048 | Added post-API truncation: `rawEmbedding.slice(0, config.embedDimensions)` |
| 4 | Truncation bypassed on cache hit — old 2048-dim vectors cached before fix were returned as-is | Applied same truncation logic on the cache-hit path |

### 3. Ingest Service (`src/modules/ingest/ingest.service.ts`)
Implemented the full ingestion pipeline orchestrating all utilities:

- **`upsertCollection`**: Creates or retrieves a collection by name using `ON CONFLICT DO UPDATE` — idempotent, safe to call repeatedly
- **`insertDocument`**: Creates a document record linked to the collection
- **`bulkInsertChunks`**: Single-transaction bulk insert using PostgreSQL `unnest()` to send all chunks in one round-trip (vs N individual INSERTs), with automatic rollback on failure
- **`ingestDocument`**: Top-level orchestrator that runs the full pipeline: upsert collection → insert document → chunk file → embed chunks → bulk insert — always cleans up the temp file in `finally`

### 4. Ingest Controller (`src/modules/ingest/ingest.controller.ts`)
Replaced the Phase 1 placeholder (501) with a fully functional upload controller:

- **Multer configuration**: Disk storage in OS temp dir, timestamp-prefixed filenames to avoid collisions
- **File type filter**: Allows only `.pdf`, `.md`, `.markdown`; rejects others with a 400 `AppError`
- **File size limit**: Enforced from `MAX_FILE_SIZE_MB` config; returns 413 on overflow
- **Body validation**: Validates `collection_name` via Zod schema
- **Error forwarding**: All errors passed to `next()` for the global error handler

### 5. Global Error Handler (`src/middleware/errorHandler.ts` + `src/app.ts`)
The error handler existed in Phase 1 but was **not wired into the Express app**. Fixed by:

- Importing `errorHandler` in `app.ts`
- Registering `app.use(errorHandler)` as the final middleware (after the 404 handler)

This ensures all `AppError`, `ZodError`, and unhandled errors are returned as **formatted JSON** instead of Express's default HTML error page:

```json
{
  "error": "Descriptive error message",
  "code": "ERROR_CODE"
}
```

### 6. Database Schema Updates

#### `migrations/001_init.sql` (updated)
- Added `chunks` table with `embedding vector(2000)` column (pgvector)
- Added HNSW index on `embedding` for fast approximate nearest-neighbor search
- Added `fts_vector TSVECTOR` column with GIN index for full-text search
- Added trigger `chunks_fts_update` to auto-populate `fts_vector` on insert/update
- Added `query_logs` table for tracking queries, latency, and cache hit status

#### `migrations/002_update_embedding_dim.sql` (new)
- `ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(2000)` — migrates existing `vector(1536)` columns from Phase 1 to the correct 2000 dimensions
- Drops and recreates the HNSW index around the column type change
- Required because `CREATE TABLE IF NOT EXISTS` skips already-existing tables — `ALTER TABLE` is the correct tool for modifying live schema

---

## Key Technical Decisions

### Why `vector(2000)` and not `vector(2048)`?
pgvector's HNSW index has a **hard cap of 2000 dimensions**. The Nvidia model outputs 2048. Truncating to 2000 is safe because Matryoshka-style embedding models encode the most important semantic information in the leading dimensions.

### Why `unnest()` for bulk inserts?
Sending N chunks as a single `unnest()` query means **one database round-trip** instead of N. For a 200-chunk document this is the difference between ~2 seconds and ~100ms.

### Why batch embeddings in groups of 20?
OpenRouter (and OpenAI) enforce per-request token limits. Batches of 20 chunks stay well under the ceiling while being far faster than sequential one-at-a-time calls.

### Why truncate on both cache hit AND API response?
The truncation code was added after some embeddings were already cached at 2048 dimensions. Applying truncation on the cache-read path ensures stale cache entries are corrected transparently without needing a cache flush.

---

## Current Status

- ✅ `POST /api/v1/ingest` — fully functional, accepts PDF and Markdown files
- ✅ Files chunked, embedded, and stored in PostgreSQL with pgvector
- ✅ Redis embedding cache working (cost-saving on repeated content)
- ✅ Global error handler returning formatted JSON on all error paths
- ✅ HNSW vector index operational for similarity search
- ✅ Full-text search index (`fts_vector`) populated via trigger
- ✅ Schema migration system working (`pnpm run migrate`)
- ⚠️ `POST /api/v1/query` — still returns 501 (planned for Phase 3)

---

## Files Added / Modified in Phase 2

| File | Status | Description |
|------|--------|-------------|
| `backend/src/utils/chunker.ts` | Added | PDF + Markdown → `RawChunk[]` pipeline |
| `backend/src/utils/embedder.ts` | Added | Batch embedding with Redis cache + dimension truncation |
| `backend/src/modules/ingest/ingest.service.ts` | Modified | Full ingestion orchestration |
| `backend/src/modules/ingest/ingest.controller.ts` | Modified | Multer upload + validation; replaced 501 placeholder |
| `backend/src/app.ts` | Modified | Wired `errorHandler` middleware |
| `backend/migrations/001_init.sql` | Modified | Added `chunks`, `query_logs` tables + indexes + FTS trigger |
| `backend/migrations/002_update_embedding_dim.sql` | Added | `ALTER` column from `vector(1536)` → `vector(2000)` |
| `backend/.env` | Modified | `EMBED_DIMENSIONS=2000`, model configs |

---

## Next Steps (Phase 3 — Query Pipeline)

1. Implement `POST /api/v1/query` endpoint
2. Embed the incoming query using the same `embedder.ts` utility
3. Run hybrid search: pgvector cosine similarity + PostgreSQL full-text search
4. Combine results using Reciprocal Rank Fusion (RRF) scoring
5. Pass retrieved chunks as context to the LLM (OpenRouter)
6. Stream the LLM response via SSE (`text/event-stream`)
7. Emit `token`, `citation`, and `meta` SSE events per the `SSEEvent` type
8. Log query metadata to `query_logs` table
