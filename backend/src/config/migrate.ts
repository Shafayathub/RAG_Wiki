import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createPool } from "./db";
import { logger } from "../utils/logger";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

/**
 * Applies every .sql file in migrations/ exactly once, in filename order, and
 * records what ran. Without the ledger a migration that is not idempotent
 * silently re-runs on every deploy.
 */
async function migrate(): Promise<void> {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    );
    const alreadyApplied = new Set(applied.rows.map((row) => row.filename));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      logger.warn("No migration files found", { dir: MIGRATIONS_DIR });
      return;
    }

    let ran = 0;

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        logger.debug("Skipping applied migration", { file });
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
      logger.info("Applying migration", { file });

      // Each file is one transaction: a failure halfway through leaves the
      // schema exactly as it was, and the ledger row is rolled back with it.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }

    logger.info("Migrations complete", { applied: ran, total: files.length });
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err: unknown) => {
  logger.error("Migration run failed", err);
  process.exit(1);
});
