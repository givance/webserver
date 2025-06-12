import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema"; // Import all schema objects

// Ensure DATABASE_URL is set.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

/**
 * PostgreSQL connection pool.
 */
const pool = new Pool({
  // ssl: true,
  connectionString: process.env.DATABASE_URL,
});

/**
 * Drizzle ORM instance, configured with the schema and connection pool.
 * This 'db' instance will be used for all database interactions throughout the application.
 */
export const db = drizzle(pool, { schema });

// It might be beneficial to also export the schema for direct use if needed.
export * as allSchema from "./schema";

// Type definitions for convenience, inferring from the schema.
// Example: export type User = typeof schema.users.$inferSelect;
// These can be added as needed in the respective data access files or here.

/**
 * Export a function to get a database connection for one-off queries
 * @returns A promise that resolves to a Postgres client
 */
export async function getDbClient() {
  return await pool.connect();
}
