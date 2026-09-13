-- Align the embedding column with the default model.
--
-- Migration 002 widened the column to vector(2000) for an Nvidia model that
-- returns 2048 dimensions. The default configuration now uses
-- text-embedding-3-small at 1536, and pgvector requires the column width to
-- match the vectors inserted exactly: a mismatch fails every insert and every
-- similarity query.
--
-- Existing rows must go. A vector produced by a different model is not
-- comparable with one produced by this model even after truncation, so keeping
-- them would silently degrade retrieval rather than fail loudly. On a fresh
-- database this deletes nothing.
--
-- Re-ingest documents after this runs.
--
-- To use a different embedding model, change EMBED_DIMENSIONS and add a new
-- migration setting the same width here. pgvector caps HNSW at 2000.

DELETE FROM chunks;

DROP INDEX IF EXISTS idx_chunks_embedding_hnsw;

ALTER TABLE chunks
  ALTER COLUMN embedding TYPE vector(1536);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- total_chunks now overstates every document, since their chunks are gone.
UPDATE documents SET total_chunks = 0;
