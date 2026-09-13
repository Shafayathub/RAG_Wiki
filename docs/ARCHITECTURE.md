# Architecture

This document explains what the system does and, more usefully, why each choice
was made over the alternatives.

---

## The shape of the problem

A language model asked about your private documents has two failure modes. It
either refuses, because it was never trained on them, or it invents a plausible
answer. Retrieval-Augmented Generation fixes this by finding the relevant
passages first and putting them in the prompt, so the model summarises evidence
rather than recalling facts.

That moves the problem rather than removing it. The answer can now only be as
good as the passages retrieved, and the user still has to trust that the model
used them faithfully. So the two questions that shape everything below are:

1. **Retrieval quality.** Did the right passages come back?
2. **Verifiability.** Can the reader check the answer against its sources?

---

## System overview

```
Browser (React 19)
   |  POST /api/v1/query    Server-Sent Events
   |  POST /api/v1/ingest   multipart
   v
Express 5  ->  request context, CORS, rate limits, validation
   |
   +--> Ingestion:  parse -> chunk -> embed -> store
   |
   +--> Query:      cache -> hybrid retrieve -> fuse -> prompt -> stream
   |
   v
Postgres + pgvector (source of truth)     Redis (caches, rate limits)
   |
   v
OpenRouter (embeddings and chat completions)
```

---

## Ingestion

### Parsing

PDFs go through `pdf-parse`; Markdown is rendered and stripped to plain text so
the embedding sees prose rather than syntax. Only these two formats are
accepted, checked by extension before any parsing runs.

### Chunking

Chunking decides what retrieval can ever find, so it is not a fixed-size slice.

The chunker splits recursively, trying paragraph breaks first, then single
newlines, then sentence boundaries, then spaces, and finally cutting on token
boundaries when nothing else remains. A chunk boundary therefore lands where a
human would put one, and a chunk holds a complete thought.

Two implementation details matter more than they look:

**Pieces keep their separator.** Each fragment carries the delimiter that
followed it, so concatenating fragments reproduces the source text exactly. An
earlier version rejoined fragments with a newline regardless of how they were
split, which both corrupted the text and inflated token counts, because token
counts are not additive across an arbitrary join.

**Counts are computed once per fragment and summed while packing.** Re-encoding
a growing candidate on every step makes chunking quadratic in the length of a
page. The assembled chunk is then re-encoded once so the stored `token_count` is
exact rather than an estimate.

Neighbouring chunks overlap by `CHUNK_OVERLAP` tokens. Without it, a fact
straddling a boundary is unretrievable in both neighbours: each holds half, and
neither half matches the question.

PDFs are chunked one page at a time so `page_number` is accurate. A citation
naming the wrong page is worse than none, because it destroys the trust the
citation existed to create.

### Embedding

Embeddings are requested in batches of twenty inputs per call rather than one
call per chunk, which is the difference between one round trip and twenty. The
response is indexed by its own `index` field, not by array position, because
providers are permitted to return results out of order.

Every embedding passes through a shared Redis cache keyed by text, so ingesting
a document that repeats passages from an existing one is free for those chunks.

Vectors are truncated to `EMBED_DIMENSIONS` before storage. Some providers
ignore the `dimensions` parameter and return their native width, and the column
is a fixed `vector(N)` whose HNSW index caps at 2000. Doing this in one place
means the ingestion and query paths cannot disagree about width, which they
previously did.

### Storage

All chunks for a document are inserted in a single transaction using `unnest`
to expand parallel arrays into rows. One round trip instead of N, and a failure
part-way leaves no half-ingested document. A trigger maintains the `tsvector`
column, so the lexical index can never drift from the text.

---

## Retrieval

### Why two searches

**Vector search** finds meaning. It matches "staff holiday entitlement" to
"annual leave allowance" with no shared words. It is weak on exactness:
identifiers, error codes and rare proper nouns get smoothed into the surrounding
semantic space.

**Full-text search** is the mirror image. `tsvector` matching with `ts_rank`
finds the literal term and misses every paraphrase.

The failure modes are complementary, so running both covers questions phrased in
either the corpus vocabulary or the reader vocabulary. Both run concurrently
against the same database, and both over-fetch at twice `top_k` so the fusion
step has a real pool to rerank from. Without the over-fetch, a chunk ranked
eighth by vector search but first lexically could never reach the final five.

### Why Reciprocal Rank Fusion

Merging two searches means merging incomparable numbers. A cosine distance and a
`ts_rank` are different quantities with different distributions, and normalising
them onto a shared scale needs assumptions that do not survive a change of
corpus.

RRF discards the scores and uses only positions. Each list contributes
`1 / (k + rank)` to every chunk it contains, and a chunk in both lists gets the
sum. `k` is 60, from the original Cormack et al. paper.

Three properties earn it the place:

- **No tuning.** No per-corpus weights, which matters when the corpus is
  whatever a user uploads.
- **Rewards agreement.** A chunk both methods rank highly beats one only a
  single method likes, which is the whole point of an ensemble.
- **Robust to outliers.** Only rank matters, so one miscalibrated score cannot
  dominate.

`k` also damps the top of each list. Without it, first place would be worth many
times second, and one confident mistake at rank one would swamp the other list.

---

## Generation and citation

Retrieved chunks are wrapped in `[SOURCE:chunk_id]` tags in the prompt. The
model is told to answer only from them, to cite each claim with the matching
tag, and to say it cannot find the answer rather than speculate.

The tags in the generated answer are then parsed out and resolved against the
chunk map built during retrieval. A citation can only render if the model
pointed at a passage that was genuinely supplied, so the sources panel cannot
show a fabricated reference. Tags naming an unknown chunk are dropped.

If retrieval returns nothing, the model is never called. Prompting with zero
sources reliably hallucinates and always costs money, so the empty result is
reported directly.

---

## Streaming

Answers stream over Server-Sent Events. `EventSource` is unusable here because
it is GET-only and the question, filter and `top_k` belong in a body, so the
client uses `fetch` with a stream reader.

Three details make it work in practice:

**The parser is incremental.** A network chunk has no relationship to a message
boundary: one read can deliver half a field or three whole messages. The parser
buffers across reads and emits only complete messages.

**Renders are batched.** Tokens arrive far faster than React should re-render,
so they accumulate and flush on animation frames.

**Cache hits are replayed.** A cached answer is streamed word by word within a
fixed time budget, so it is visually identical to a live generation. The client
learns the difference only from `cache_hit` in the metadata.

---

## Caching

Three tiers, checked cheapest-miss first:

| Tier | Key | TTL | Saves on a hit |
|---|---|---|---|
| Answer | question + collection | 1 hour | Everything |
| Retrieval | question + collection | 30 min | Both searches and the query embedding |
| Embedding | text | 24 hours | One provider call |

The embedding tier is shared between ingestion and querying, which is what makes
it pay in both directions.

Keys are namespaced by purpose and scoped by collection, so a filtered query can
never be served an answer computed over the whole corpus.

---

## Failure modes

Chosen deliberately, and tested:

**Redis down is slower, not broken.** Every cache read and write is wrapped:
a failed read is a miss, a failed write is ignored. Both rate limiters fail
open, because an outage should not lock out legitimate users. Readiness stays
green, because the application still returns correct answers.

**Postgres down is fatal.** It is the source of truth, so readiness returns 503
and the standalone server refuses to start.

**Unexpected errors do not leak.** In production the underlying message is
replaced with a generic string, since raw messages carry connection strings,
file paths and upstream payloads. The request id in the response ties the
report to the exact log line.

**Mid-stream failures still reach the client.** Once the 200 status line is
committed, the status cannot change, so the failure travels in-band as an SSE
`error` event.

**A disconnected client stops costing money.** Abandoning the loop closes the
upstream model stream.

---

## Serverless considerations

The deployment target is one Vercel function, which constrains several choices:

- **One Postgres connection per instance.** Every concurrent request is its own
  instance; a large pool per instance exhausts the database limit.
- **Lazy Redis connect, reused per instance.** Connecting on module load would
  pay the cost on every cold start whether or not the route needs it.
- **Pure-JS tokenizer.** The WASM `tiktoken` build needs a manual `free()` to
  avoid leaking across invocations and is fragile to bundle.
- **Post-response writes are awaited.** An instance freezes the moment the
  response ends, silently dropping any promise still in flight, so the cache
  write and the analytics insert are awaited rather than fired and forgotten.

---

## Data model

```
collections --< documents --< chunks
                                 embedding   vector(N), HNSW, cosine
                                 fts_vector  tsvector, GIN, trigger-maintained

query_logs          what was asked, what was retrieved, latency, cache tier
schema_migrations   which migration files have run
```

`query_logs` is what makes retrieval quality measurable after the fact instead
of a matter of impression: every question, the chunks that answered it, the
latency and the cache tier are all recorded.

---

## Deliberate limitations

Honest about what this is not:

- **No authentication.** Every collection is public to anyone with the URL.
  Multi-tenancy would need a users table and a tenant column on every query.
- **No reranking model.** A cross-encoder over the fused top 20 would likely
  beat RRF alone, at the cost of latency and another model dependency.
- **No incremental reindexing.** Changing `CHUNK_SIZE` or the embedding model
  requires re-ingesting everything.
- **Ingestion is synchronous.** A very large PDF can approach the function
  timeout. A queue with a worker is the standard fix.
- **English-only full-text search.** The `tsvector` uses the `english`
  configuration; other languages need their own.
