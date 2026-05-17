import { pool } from "../../config/db";
import { Collection } from "../../types";
import { AppError } from "../../utils/AppError";


export async function fetchAllCollections(): Promise<Collection[]> {
  const result = await pool.query<Collection>(
    "SELECT id, name, created_at FROM collections ORDER BY created_at DESC",
  );
  return result.rows;
}

export async function insertCollection(name: string): Promise<Collection> {
  if (!name?.trim()) {
    throw new AppError(400, "Collection name is required", "INVALID_INPUT");
  }

  const result = await pool.query<Collection>(
    "INSERT INTO collections (name) VALUES ($1) RETURNING id, name, created_at",
    [name.trim()],
  );

  return result.rows[0]!;
}

export async function removeCollection(id: number): Promise<void> {
  if (isNaN(id)) {
    throw new AppError(400, "Invalid collection id", "INVALID_INPUT");
  }

  const result = await pool.query("DELETE FROM collections WHERE id = $1", [
    id,
  ]);

  if (result.rowCount === 0) {
    throw new AppError(404, "Collection not found", "NOT_FOUND");
  }
}
