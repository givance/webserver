import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as dotenv from "dotenv";
import path from "path";

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

/**
 * Setup PostgreSQL test database for standalone testing
 * This is a wrapper around the main database setup for backward compatibility
 */
export function setupTestDatabase() {
  console.log("🗄️ Setting up PostgreSQL test database...");

  // Get database URL from test environment
  const testDatabaseUrl = process.env.DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("DATABASE_URL not found in .env.test file");
  }

  console.log(`📡 Connecting to: ${testDatabaseUrl.replace(/\/\/.*@/, "//***@")}`);

  // Create PostgreSQL connection
  const pool = new Pool({
    connectionString: testDatabaseUrl,
  });

  const db = drizzle(pool);

  console.log("✅ PostgreSQL test database connection established");

  return { db, pool, dbPath: testDatabaseUrl };
}

/**
 * Create test schema using Drizzle migrations
 */
export async function createTestSchema(pool: Pool) {
  console.log("📋 Creating database schema...");

  const db = drizzle(pool);

  try {
    // Run migrations to create schema
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    console.log("✅ Database schema created successfully");
  } catch (error) {
    console.error("❌ Schema creation failed:", error);
    throw error;
  }
}

/**
 * Clean up PostgreSQL test database
 */
export async function cleanupTestDatabase(pool: Pool) {
  console.log("🧹 Cleaning up test database...");

  try {
    await pool.end();
    console.log("✅ Test database connection closed");
  } catch (error) {
    console.error("❌ Database cleanup failed:", error);
  }
}

// If run directly (for backward compatibility)
if (require.main === module) {
  (async () => {
    try {
      const { pool } = setupTestDatabase();
      await createTestSchema(pool);
      await cleanupTestDatabase(pool);
      console.log("✅ Test database setup complete");
      process.exit(0);
    } catch (error) {
      console.error("❌ Test database setup failed:", error);
      process.exit(1);
    }
  })();
}
