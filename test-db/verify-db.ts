import { setupTestDatabase, createTestSchema, cleanupTestDatabase } from "./setup-test-db";

// Test the database setup
async function verifyDatabaseSetup() {
  console.log("🧪 Testing PostgreSQL database setup...");

  const { db, pool, dbPath } = setupTestDatabase();
  await createTestSchema(pool);

  // Test data
  const TEST_USER_ID = "test_user_123";
  const TEST_ORG_ID = "test_org_123";

  try {
    // Test user creation
    await pool.query(
      `
      INSERT INTO users (id, "firstName", "lastName", email)
      VALUES ($1, $2, $3, $4)
    `,
      [TEST_USER_ID, "Test", "User", "test@example.com"]
    );

    console.log("✅ User created successfully");

    // Test organization creation
    await pool.query(
      `
      INSERT INTO organizations (id, name, slug, description, "createdBy")
      VALUES ($1, $2, $3, $4, $5)
    `,
      [TEST_ORG_ID, "Test Org", "test-org", "Test organization", TEST_USER_ID]
    );

    console.log("✅ Organization created successfully");

    // Test membership creation
    await pool.query(
      `
      INSERT INTO "organizationMemberships" ("organizationId", "userId", role)
      VALUES ($1, $2, $3)
    `,
      [TEST_ORG_ID, TEST_USER_ID, "admin"]
    );

    console.log("✅ Organization membership created successfully");

    // Test donor creation
    await pool.query(
      `
      INSERT INTO donors ("firstName", "lastName", email, "organizationId", "totalDonated", tier, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      ["John", "Doe", "john@example.com", TEST_ORG_ID, 100000, "gold", "active"]
    );

    console.log("✅ Donor created successfully");

    // Verify data
    const usersResult = await pool.query("SELECT * FROM users");
    const orgsResult = await pool.query("SELECT * FROM organizations");
    const donorsResult = await pool.query("SELECT * FROM donors");

    console.log(`
📊 Database contents:
   Users: ${usersResult.rows.length}
   Organizations: ${orgsResult.rows.length}
   Donors: ${donorsResult.rows.length}
    `);

    // Cleanup
    await cleanupTestDatabase(pool);

    console.log("✅ All database operations successful!");
  } catch (error) {
    console.error("❌ Database test failed:", error);
    await cleanupTestDatabase(pool);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  verifyDatabaseSetup().catch(console.error);
}
