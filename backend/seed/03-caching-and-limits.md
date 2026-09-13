# Caching, Cost Control and Reliability

## Which caching layers a query passes through

Every stage of the query pipeline that costs money or milliseconds sits behind
a Redis cache. A question passes through up to three of them, checked in order
from cheapest to most expensive to miss.

**1. The answer cache.** Keyed by the question text and the collection filter,
holding the finished answer, its citations and its metadata for one hour by
default (`CACHE_TTL_QUERY`). A hit skips retrieval and generation entirely, so
a repeated question costs nothing and returns immediately. The cached answer is
still replayed to the browser word by word, so a cache hit is visually
indistinguishable from a live generation. The client learns which happened only
from the `cache_hit` field in the metadata, which the interface renders as a
small badge.

**2. The retrieval cache.** Keyed the same way and held for thirty minutes
(`CACHE_TTL_RETRIEVAL`), storing the fused, ranked chunks. This is what a
near-miss lands on: the same question against a corpus whose answer has expired
still skips both database searches and the query embedding.

**3. The embedding cache.** Keyed by the text being embedded and held for
twenty-four hours (`CACHE_TTL_EMBEDDING`). This one is shared between ingestion
and querying, which is what makes it valuable in both directions: re-ingesting a
document that shares passages with an existing one costs nothing for the
repeated chunks, and a question whose wording matches an ingested chunk reuses
that vector.

Cache keys are namespaced by purpose and scoped by collection, so filtering to a
collection can never serve an answer computed across the whole corpus.

## Degrading rather than failing

Every cache read and write is wrapped so that a Redis outage is a performance
problem rather than an availability one. A failed read is treated as a miss and
the pipeline continues; a failed write is ignored. The readiness endpoint
reports the cache as down while still returning a healthy status, because the
application can serve correct answers without it.

The database is treated differently. It is the source of truth, so an
unreachable Postgres fails readiness with a 503 and the server refuses to start.

## Cost control

Two independent limiters protect the deployment, both backed by Redis so the
count is shared across every serverless instance rather than resetting on each
cold start.

A general per-IP rate limiter covers the whole API, defaulting to 100 requests
per fifteen minutes. Separately, a stricter cost limiter guards the one endpoint
that spends money on model calls, defaulting to 10 questions per hour per IP.
The limits differ by orders of magnitude because the underlying costs do:
listing collections is free, generating an answer is not.

Both limiters fail open. If Redis is unreachable the request proceeds, on the
grounds that an outage should not lock out legitimate users.

Uploads are bounded too. File size is capped by `MAX_FILE_SIZE_MB`, and only
PDF and Markdown are accepted, checked by extension before any parsing runs.

## Observability

Every request is stamped with an id, returned in the `X-Request-Id` header and
included in every error response body. Logs are structured JSON in production
carrying that id, the method, path, status and duration, so a user reporting a
failure can be matched to the exact log line that recorded it. Stack traces are
omitted from production logs and error messages for unexpected failures are
replaced with a generic string, because raw messages leak connection strings,
file paths and upstream payloads.

Alongside the logs, the `query_logs` table records every question, the chunks
retrieved for it, the latency and which cache tier served it, which is what
makes retrieval quality measurable after the fact rather than a matter of
impression.
