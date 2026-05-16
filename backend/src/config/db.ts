import { Pool } from "pg";
import { config } from "./env";

//DB
export const pool = new Pool({
  connectionString: `${config.databaseUrl}`,
});

export async function checkDbConnection(): Promise<void> {
  try {
    await pool.query(`SELECT 1`);
    console.log("DB connected");
  } catch (err) {
    console.error("DB connection failed:", err);
    throw err;
  }
}
