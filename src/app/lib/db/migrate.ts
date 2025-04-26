import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env file
config({ path: resolve(process.cwd(), ".env") });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// console.log(env);

/**
 * This script applies pending migrations to the database
 * Run it manually with: pnpm tsx src/app/lib/db/migrate.ts
 */
async function runMigration() {
  // Create a Postgres connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Initialize Drizzle with the connection
    const db = drizzle(pool);

    console.log("Running migrations...");

    // Run the migrations from the specified directory
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });

    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the migration when this script is executed directly
if (require.main === module) {
  runMigration().catch(console.error);
}

// Export for programmatic usage
export { runMigration };
