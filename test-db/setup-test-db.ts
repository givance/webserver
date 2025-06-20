import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";

// Database file path
const TEST_DB_PATH = path.join(__dirname, "test.sqlite");

export function setupTestDatabase() {
  console.log("🗄️ Setting up SQLite test database...");

  // Remove existing test database if it exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    console.log("Removed existing test database");
  }

  // Create new SQLite database
  const sqlite = new Database(TEST_DB_PATH);
  const db = drizzle(sqlite);

  // Enable foreign keys
  sqlite.pragma("foreign_keys = ON");

  console.log("✅ SQLite test database created at:", TEST_DB_PATH);

  return { db, sqlite, dbPath: TEST_DB_PATH };
}

export function createTestSchema(sqlite: Database.Database) {
  console.log("📋 Creating database schema...");

  // Create tables using raw SQLite exec
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      lastName TEXT,
      email TEXT UNIQUE,
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      createdBy TEXT,
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS organizationMemberships (
      id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
      organizationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      createdAt INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(organizationId, userId)
    );

    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT,
      lastName TEXT,
      email TEXT,
      phone TEXT,
      organizationId TEXT NOT NULL,
      totalDonated INTEGER DEFAULT 0,
      tier TEXT,
      status TEXT DEFAULT 'active',
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      organizationId TEXT NOT NULL,
      goal INTEGER,
      active INTEGER DEFAULT 1,
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS emailGenerationSessions (
      id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
      organizationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      jobName TEXT,
      instruction TEXT,
      chatHistory TEXT DEFAULT '[]',
      selectedDonorIds TEXT DEFAULT '[]',
      previewDonorIds TEXT DEFAULT '[]',
      totalDonors INTEGER DEFAULT 0,
      status TEXT DEFAULT 'DRAFT',
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  console.log("✅ Database schema created successfully");
}

export function cleanupTestDatabase(dbPath: string) {
  console.log("🧹 Cleaning up test database...");
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log("✅ Test database cleaned up");
  }
}

// If run directly
if (require.main === module) {
  const { db, sqlite, dbPath } = setupTestDatabase();
  createTestSchema(sqlite);
  sqlite.close();
  console.log("✅ Test database setup complete");
}
