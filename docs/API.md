# API Reference

Base path: `/api/v1`

All responses are JSON except `POST /query`, which is a Server-Sent Events
stream. Every response carries an `X-Request-Id` header, and every error body
repeats it as `request_id`.

---

## Errors

All failures share one shape:

```json
{
  "error": "Human readable message",
  "code": "MACHINE_CODE",
  "request_id": "0f2c8a1e-..."
}
```

Validation failures add a `details` array naming each offending field:

```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "request_id": "0f2c8a1e-...",
  "details": [{ "field": "query", "message": "query is required" }]
}
```

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body or params failed schema validation |
| `NO_FILE` | 400 | Upload had no `file` field |
| `INVALID_FILE_TYPE` | 400 | Extension is not PDF or Markdown |
| `DEMO_READ_ONLY` | 403 | Destructive endpoint on a demo deployment, no admin token |
| `NOT_FOUND` | 404 | No such route or collection |
| `DUPLICATE_COLLECTION` | 409 | A collection with that name exists |
| `FILE_TOO_LARGE` | 413 | Upload exceeded `MAX_FILE_SIZE_MB` |
| `EMPTY_DOCUMENT` | 422 | Parsed to zero chunks |
| `RATE_LIMIT_EXCEEDED` | 429 | Per-IP request limit |
| `LLM_RATE_LIMIT_EXCEEDED` | 429 | Per-IP question budget; includes `retry_after_seconds` |
| `EMBEDDING_PROVIDER_ERROR` | 502 | Embedding provider unreachable |
| `INTERNAL_ERROR` | 500 | Unexpected failure; message is deliberately generic |

Unexpected errors never echo the underlying message in production, because raw
messages carry connection strings, file paths and upstream payloads.

---

## Health

### `GET /health`

Liveness. Touches no dependency, so it still answers during an outage.

```json
{ "status": "ok", "uptime_s": 1423, "timestamp": "2026-01-01T00:00:00.000Z" }
```

### `GET /api/v1/health`

Readiness, reporting each dependency separately. Returns 503 only when Postgres
is unreachable: Redis is a cache, so losing it degrades latency and rate
limiting without making answers wrong.

```json
{
  "status": "ok",
  "checks": {
    "database": { "ok": true },
    "cache": { "ok": false, "error": "connection refused" }
  },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

## Collections

### `GET /api/v1/collections`

Lists collections with aggregate counts, computed in the same query rather than
one count per row.

```json
{
  "data": [
    {
      "id": 1,
      "name": "Q4 Reports",
      "created_at": "2026-01-01T00:00:00.000Z",
      "document_count": 3,
      "chunk_count": 412
    }
  ]
}
```

### `POST /api/v1/collections`

```json
{ "name": "Q4 Reports" }
```

`name` is trimmed, required, and at most 100 characters. Returns 201 with the
created collection, or 409 if the name is taken.

Creating a collection explicitly is optional: uploading to a name that does not
exist creates it.

### `DELETE /api/v1/collections/:id`

Deletes the collection and, by cascade, its documents and chunks.

On a deployment with `DEMO_MODE=true` this requires a matching `X-Admin-Token`
header, compared in constant time. Without it the response is 403
`DEMO_READ_ONLY`.

Returns `{ "message": "Collection deleted" }`, or 404 if there was no such
collection.

---

## Ingestion

### `POST /api/v1/ingest`

`multipart/form-data` with:

| Field | Type | Notes |
|---|---|---|
| `file` | file | `.pdf`, `.md` or `.markdown`, up to `MAX_FILE_SIZE_MB` |
| `collection_name` | text | Created if it does not exist |

```bash
curl -X POST https://your-app.vercel.app/api/v1/ingest \
  -F "file=@handbook.pdf" \
  -F "collection_name=Handbook"
```

Returns 201:

```json
{
  "data": {
    "document_id": 12,
    "collection_id": 3,
    "filename": "handbook.pdf",
    "total_chunks": 148,
    "message": "Document ingested successfully"
  }
}
```

The request completes only after the document has been parsed, chunked,
embedded and committed, so it is slow in proportion to document size. Chunks are
inserted in one transaction using `unnest`, so a failure part-way leaves no
half-ingested document behind.

---

## Query

### `POST /api/v1/query`

Returns `text/event-stream`. Rate limited per IP by `LLM_RATE_LIMIT_MAX`.

```json
{
  "query": "How does hybrid retrieval work?",
  "collection_id": 3,
  "top_k": 5
}
```

| Field | Required | Notes |
|---|---|---|
| `query` | yes | 1 to 1000 characters, trimmed |
| `collection_id` | no | Omit to search everything |
| `top_k` | no | 1 to 20, defaults to `TOP_K_RESULTS` |

#### Event sequence

Events always arrive in this order, and a cache hit is indistinguishable from a
live generation apart from `cache_hit` in the metadata.

**`token`** — repeated, one fragment of the answer. Data is a JSON string.

```
event: token
data: "Hybrid retrieval "
```

**`citation`** — once, after the last token.

```
event: citation
data: {"chunks":[{"chunk_id":91,"document_id":12,"filename":"handbook.pdf","page_number":4,"chunk_index":17,"content_preview":"Reciprocal rank fusion merges..."}]}
```

**`meta`** — once.

```
event: meta
data: {"latency_ms":1840,"retrieved_chunk_ids":[91,88,12],"cache_hit":"none"}
```

`cache_hit` is `query` when the answer came from cache and `none` when it was
generated.

**`done`** — terminates the stream.

```
event: done
data: {}
```

**`error`** — sent instead of `done` when generation fails after the headers
have gone out. Once the 200 status line is committed there is no way to change
it, so the failure has to travel in-band.

```
event: error
data: {"message":"The answer stream failed. Please try again."}
```

A failure *before* streaming starts is an ordinary JSON error response.

#### Consuming the stream

`EventSource` cannot be used: it is GET-only, and the question and filters
belong in a request body. Use `fetch` with a reader. A network chunk has no
relationship to a message boundary, so the buffer must persist across reads.
`frontend/src/lib/sse.ts` is a small parser that handles this correctly.

```js
const response = await fetch("/api/v1/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "How does hybrid retrieval work?" }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  process(decoder.decode(value, { stream: true }));
}
```

#### When nothing is retrieved

If retrieval returns no chunks the model is never called. The stream carries a
message saying the answer is not in the documents, an empty citation payload and
normal metadata. Prompting with zero sources reliably produces a hallucination
and always costs money.
