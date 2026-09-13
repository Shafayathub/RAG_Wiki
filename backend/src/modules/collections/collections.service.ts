import { pool } from "../../config/db";
import { AppError } from "../../utils/AppError";
import type { CollectionSummary } from "../../types";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/**
 * Counts come from the same round trip as the list. The alternative — one
 * count query per collection — is the classic N+1 and shows up immediately in
 * the sidebar, which renders on every page load.
 */
export async function fetchAllCollections(): Promise<CollectionSummary[]> {
  const result = await pool.query<CollectionSummary>(
    `SELECT
       c.id,
       c.name,
       c.created_at,
       COUNT(DISTINCT d.id)::int          AS document_count,
       COALESCE(SUM(d.total_chunks), 0)::int AS chunk_count
     FROM collections c
     LEFT JOIN documents d ON d.collection_id = c.id
     GROUP BY c.id, c.name, c.created_at
     ORDER BY c.created_at DESC`,
  );

  return result.rows;
}

export async function insertCollection(name: string): Promise<CollectionSummary> {
  try {
    const result = await pool.query<CollectionSummary>(
      `INSERT INTO collections (name)
       VALUES ($1)
       RETURNING id, name, created_at, 0 AS document_count, 0 AS chunk_count`,
      [name],
    );
    return result.rows[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, `A collection named "${name}" already exists.`, "DUPLICATE_COLLECTION");
    }
    throw err;
  }
}

export async function removeCollection(id: number): Promise<void> {
  // documents and chunks cascade from the collections foreign key.
  const result = await pool.query("DELETE FROM collections WHERE id = $1", [id]);

  if (result.rowCount === 0) {
    throw new AppError(404, "Collection not found", "NOT_FOUND");
  }
}
