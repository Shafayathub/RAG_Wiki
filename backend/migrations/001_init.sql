CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS collections (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  collection_id INTEGER     NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  filename      TEXT        NOT NULL,
  file_type     TEXT        NOT NULL CHECK (file_type IN ('pdf', 'markdown')),
  total_chunks  INTEGER     NOT NULL DEFAULT 0,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_collection
  ON documents(collection_id);

CREATE TABLE IF NOT EXISTS chunks (
  id          SERIAL PRIMARY KEY,
  document_id INTEGER     NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER     NOT NULL,
  page_number INTEGER,
  content     TEXT        NOT NULL,
  embedding   vector(1536),
  fts_vector  TSVECTOR,
  token_count INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chunks_fts
  ON chunks USING GIN (fts_vector);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id
  ON chunks(document_id);

CREATE TABLE IF NOT EXISTS query_logs (
  id                  SERIAL PRIMARY KEY,
  query_text          TEXT        NOT NULL,
  collection_id       INTEGER     REFERENCES collections(id) ON DELETE SET NULL,
  retrieved_chunk_ids INTEGER[]   NOT NULL DEFAULT '{}',
  answer_preview      TEXT,
  latency_ms          INTEGER,
  cache_hit           TEXT        CHECK (cache_hit IN ('query', 'retrieval', 'none')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_logs_created
  ON query_logs(created_at DESC);

CREATE OR REPLACE FUNCTION update_fts_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts_vector := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chunks_fts_update ON chunks;

CREATE TRIGGER chunks_fts_update
  BEFORE INSERT OR UPDATE OF content ON chunks
  FOR EACH ROW EXECUTE FUNCTION update_fts_vector();