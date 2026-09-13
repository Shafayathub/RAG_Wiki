# RAG Wiki Architecture

RAG Wiki answers questions about documents you upload. It never answers from
model memory: every response is generated from passages retrieved out of your
own corpus, and every claim carries a citation back to the passage it came from.

## The two pipelines

The system has exactly two paths through it.

**Ingestion** runs when a document is uploaded. The file is parsed, split into
overlapping chunks, embedded into vectors, and written to Postgres in a single
transaction alongside a full-text search vector.

**Query** runs when a question is asked. The question is embedded, two searches
run in parallel, their results are fused into one ranking, the top passages are
formatted into a prompt, and the language model streams an answer back token by
token over Server-Sent Events.

## How documents are chunked before they are embedded

Chunking decides what retrieval can ever find, so it is done deliberately
rather than by slicing at a fixed character count.

The chunker uses recursive character splitting. It tries to break on paragraph
boundaries first. If a paragraph is still larger than the token budget it falls
back to single line breaks, then sentences, then words, and only as a last
resort does it cut on raw token boundaries. The effect is that a chunk boundary
lands where a human would put one, so a chunk holds a complete thought instead
of half a sentence.

Two settings govern the result:

- `CHUNK_SIZE` is the maximum tokens in a chunk, 512 by default.
- `CHUNK_OVERLAP` is how many tokens are repeated at the start of the next
  chunk, 50 by default.

The overlap exists because a fact that straddles a boundary would otherwise be
unretrievable in both neighbouring chunks: each would hold only half of it, and
neither half would match the question. Repeating the tail of one chunk at the
head of the next means the whole fact appears intact somewhere.

PDFs are chunked one page at a time, so the page number recorded against each
chunk is accurate. A citation that names the wrong page is worse than no
citation at all, because it destroys the reader trust the citation was meant to
create. Markdown has no pages, so those chunks are cited by chunk index instead.

Token counts come from the same BPE tokenizer family the embedding model uses,
so the budget reflects what the model actually sees rather than a character
approximation.

## Storage

Postgres holds everything, with the pgvector extension providing the vector
type and index. Four tables carry the system:

- `collections` groups documents under a name.
- `documents` records one row per ingested file.
- `chunks` holds the text, its embedding, and its full-text search vector.
- `query_logs` records what was asked, what was retrieved, how long it took,
  and whether a cache served it.

Keeping the vectors and the text in the same database is what makes hybrid
search a single join rather than a distributed query across two systems.
