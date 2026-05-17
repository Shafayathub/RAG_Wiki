-- Update embedding column from vector(1536) to vector(2000)
-- nvidia/llama-nemotron-embed-vl-1b-v2 outputs 2048 dims, but pgvector
-- HNSW indexes cap at 2000. We request 2000 dims from the API via
-- the EMBED_DIMENSIONS env var — no quality loss worth worrying about.

-- Drop the HNSW index first (it depends on the column type)
DROP INDEX IF EXISTS idx_chunks_embedding_hnsw;

-- Alter the column dimension
ALTER TABLE chunks
  ALTER COLUMN embedding TYPE vector(2000);

-- Recreate the HNSW index
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops);
