import { setupTestDatabase, createTestSchema, cleanupTestDatabase } from "./setup-test-db";

// Test the database setup
async function verifyDatabaseSetup() {
  console.log("🧪 Testing SQLite database setup...");

  const { db, sqlite, dbPath } = setupTestDatabase();
  createTestSchema(sqlite);

  // Test data
  const TEST_USER_ID = "test_user_123";
  const TEST_ORG_ID = "test_org_123";

  try {
    // Test user creation
    sqlite
      .prepare(
        `
      INSERT INTO users (id, firstName, lastName, email)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(TEST_USER_ID, "Test", "User", "test@example.com");

    console.log("✅ User created successfully");

    // Test organization creation
    sqlite
      .prepare(
        `
      INSERT INTO organizations (id, name, slug, description, createdBy)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(TEST_ORG_ID, "Test Org", "test-org", "Test organization", TEST_USER_ID);

    console.log("✅ Organization created successfully");

    // Test membership creation
    sqlite
      .prepare(
        `
      INSERT INTO organizationMemberships (organizationId, userId, role)
      VALUES (?, ?, ?)
    `
      )
      .run(TEST_ORG_ID, TEST_USER_ID, "admin");

    console.log("✅ Organization membership created successfully");

    // Test donor creation
    sqlite
      .prepare(
        `
      INSERT INTO donors (firstName, lastName, email, organizationId, totalDonated, tier, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run("John", "Doe", "john@example.com", TEST_ORG_ID, 100000, "gold", "active");

    console.log("✅ Donor created successfully");

    // Verify data
    const users = sqlite.prepare("SELECT * FROM users").all();
    const orgs = sqlite.prepare("SELECT * FROM organizations").all();
    const donors = sqlite.prepare("SELECT * FROM donors").all();

    console.log(`
📊 Database contents:
   Users: ${users.length}
   Organizations: ${orgs.length}
   Donors: ${donors.length}
    `);

    // Cleanup
    sqlite.close();
    cleanupTestDatabase(dbPath);

    console.log("✅ All database operations successful!");
  } catch (error) {
    console.error("❌ Database test failed:", error);
    sqlite.close();
    cleanupTestDatabase(dbPath);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  verifyDatabaseSetup().catch(console.error);
}
