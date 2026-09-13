import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pool } from "../config/db";
import { SEED_COLLECTION_NAME } from "../config/env";
import { closeRedis, ensureRedis } from "../config/redis";
import { ingestDocument } from "../modules/ingest/ingest.service";
import { logger } from "../utils/logger";

const SEED_DIR = path.resolve(__dirname, "../../seed");
export const DEMO_COLLECTION = SEED_COLLECTION_NAME;

/**
 * Populates the demo collection so a first-time visitor sees a working answer
 * instead of an empty state. Safe to re-run: the collection is cleared first,
 * so seeding twice does not duplicate every chunk.
 */
async function seed(): Promise<void> {
  await ensureRedis().catch(() => {
    logger.warn("Redis unavailable — seeding without the embedding cache");
  });

  const files = (await readdir(SEED_DIR)).filter((file) => file.endsWith(".md")).sort();

  if (files.length === 0) {
    throw new Error(`No markdown files found in ${SEED_DIR}`);
  }

  const deleted = await pool.query("DELETE FROM collections WHERE name = $1", [
    DEMO_COLLECTION,
  ]);
  if (deleted.rowCount) {
    logger.info("Cleared the existing demo collection", { name: DEMO_COLLECTION });
  }

  // ingestDocument owns the file it is given and deletes it when finished, so
  // it is handed a copy rather than the repository original.
  const staging = await mkdtemp(path.join(os.tmpdir(), "ragwiki-seed-"));

  try {
    for (const file of files) {
      const copy = path.join(staging, file);
      await copyFile(path.join(SEED_DIR, file), copy);

      const result = await ingestDocument(copy, file, DEMO_COLLECTION, {
        // The operator seeding the demo is exactly who the protection exists for.
        allowProtected: true,
      });
      logger.info("Seeded document", {
        file,
        chunks: result.total_chunks,
        documentId: result.document_id,
      });
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  logger.info("Seeding complete", { collection: DEMO_COLLECTION, documents: files.length });
}

seed()
  .catch((err: unknown) => {
    logger.error("Seeding failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([pool.end(), closeRedis()]);
  });
