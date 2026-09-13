# Hybrid Retrieval

## How hybrid retrieval combines vector and keyword search

A question is answered from whatever the retriever finds, so retrieval quality
sets the ceiling on answer quality. RAG Wiki runs two different searches over
the same corpus and merges their results, because the two fail in different
places.

**Vector search** embeds the question and finds chunks whose embeddings are
closest by cosine distance, using the pgvector `<=>` operator against an HNSW
index. It understands meaning: a question about "staff holiday entitlement"
retrieves a passage about "annual leave allowance" even though the two share no
words. What it is bad at is exactness. Identifiers, error codes, product names
and rare proper nouns get smoothed into the surrounding semantic space, so the
passage containing the literal string you asked for may not rank at all.

**Full-text search** is the mirror image. Postgres `tsvector` matching with
`ts_rank` finds chunks containing the actual terms. It nails the exact token and
completely misses the paraphrase.

Running both and fusing them means a question gets answered whether it was
phrased in the corpus vocabulary or the reader vocabulary.

Both searches run concurrently, and both over-fetch: each returns twice the
requested number of results, so the fusion step has a real pool to rerank from.
Without the over-fetch a chunk ranked eighth by vector search but first
lexically could never reach the final top five.

## What Reciprocal Rank Fusion is and why it is used here

The problem with combining two searches is that their scores are not
comparable. A cosine distance of 0.23 and a `ts_rank` of 0.08 are different
quantities in different units with different distributions. Normalising them
onto a common scale requires assumptions about those distributions that do not
hold across different corpora and different questions.

Reciprocal Rank Fusion sidesteps the problem entirely by discarding the scores
and using only the positions. Each result list contributes a score of

    1 / (k + rank)

to every chunk it contains, and a chunk that appears in both lists receives the
sum of both contributions. The constant `k` is 60, the value from the original
Cormack et al. paper.

Three properties make this the right choice:

1. **It needs no tuning.** There are no per-corpus weights to calibrate, which
   matters because the corpus here is whatever a user uploads.
2. **It rewards agreement.** A chunk both methods rank highly beats a chunk that
   only one method loves, which is exactly the signal wanted from an ensemble.
3. **It is robust to outliers.** Because only rank matters, one search returning
   a wildly miscalibrated score cannot dominate the merged ranking.

The constant `k` damps the influence of the very top positions. Without it,
first place would be worth many times second place, and a single confident
mistake at rank one would swamp the other list.

After fusion the merged list is sorted by combined score and truncated to
`top_k`, which defaults to 5.

## Grounding and citation

The retrieved chunks are formatted into the prompt, each wrapped in a
`[SOURCE:chunk_id]` tag. The model is instructed to answer only from these
sources, to cite each claim with the matching tag, and to say it cannot find
the answer rather than speculate when the sources do not contain one.

The tags in the generated answer are then parsed back out and resolved to real
document metadata: filename, page number and a text preview. That is what the
sources panel displays. Because the citation is derived from the tag the model
actually emitted, a claim cannot appear cited unless the model pointed at a
passage that genuinely exists in the retrieved set.

If retrieval returns nothing at all, the model is never called. Prompting a
model with zero sources reliably produces a hallucination and always costs
money, so the empty result is reported directly instead.
