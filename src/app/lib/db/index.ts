import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../../lib/env";

/**
 * Create a Postgres connection pool
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

/**
 * Initialize Drizzle ORM with the Postgres connection pool
 */
export const db = drizzle(pool);

/**
 * Export a function to get a database connection for one-off queries
 * @returns A promise that resolves to a Postgres client
 */
export async function getDbClient() {
  return await pool.connect();
}
