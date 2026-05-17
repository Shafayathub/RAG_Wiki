import { Pool } from "pg";
import fs from "fs";
import path from "path";
import "dotenv/config";

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), "migrations");

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 001, 002, 003 order

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  const client = await pool.connect();

  try {
    for (const file of files) {
      const sqlText = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

      console.log(`▶  Running: ${file}`);

      // Execute the entire file as one query — pg handles
      // multi-statement SQL fine when sent to the server directly
      await client.query(sqlText);

      console.log(`✅  ${file} done`);
    }

    console.log("🎉  All migrations complete");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("❌  Migration failed:", err);
  process.exit(1);
});
