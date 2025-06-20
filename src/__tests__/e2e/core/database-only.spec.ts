import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { setupTestDatabase, createTestSchema, cleanupTestDatabase } from "../../../../test-db/setup-test-db";

test.describe("SQLite Database Setup Tests", () => {
  // Use unique IDs for each test run to avoid conflicts
  const TEST_ORG_ID = `org_test_db_${Date.now()}`;
  const TEST_USER_ID = `user_test_db_${Date.now()}`;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let dbPath: string;

  test.beforeAll(async () => {
    console.log("🗄️ Setting up test data in SQLite database...");

    // Setup SQLite database
    const dbSetup = setupTestDatabase();
    sqlite = dbSetup.sqlite;
    db = dbSetup.db;
    dbPath = dbSetup.dbPath;

    // Create schema
    createTestSchema(sqlite);

    // Clean up any existing test data
    sqlite.exec(`
      DELETE FROM emailGenerationSessions WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM donors WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM projects WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM organizationMemberships WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM organizations WHERE id = '${TEST_ORG_ID}';
      DELETE FROM users WHERE id = '${TEST_USER_ID}';
    `);

    // Create test user first (required for foreign key in organizations)
    sqlite
      .prepare(
        `
      INSERT INTO users (id, firstName, lastName, email)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(TEST_USER_ID, "Database", "Tester", "db-test@example.com");

    // Create test organization
    sqlite
      .prepare(
        `
      INSERT INTO organizations (id, name, slug, description, createdBy)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(
        TEST_ORG_ID,
        "Database Test Nonprofit",
        "db-test-nonprofit",
        "A test nonprofit for database testing",
        TEST_USER_ID
      );

    // Create organization membership
    sqlite
      .prepare(
        `
      INSERT INTO organizationMemberships (organizationId, userId, role)
      VALUES (?, ?, ?)
    `
      )
      .run(TEST_ORG_ID, TEST_USER_ID, "admin");

    // Create test donors
    const testDonors = [
      {
        firstName: "Alice",
        lastName: "Database",
        email: "alice.db@example.com",
        organizationId: TEST_ORG_ID,
        totalDonated: 250000, // $2500
        tier: "platinum",
        status: "active",
      },
      {
        firstName: "Bob",
        lastName: "SQL",
        email: "bob.sql@example.com",
        organizationId: TEST_ORG_ID,
        totalDonated: 100000, // $1000
        tier: "gold",
        status: "active",
      },
      {
        firstName: "Carol",
        lastName: "SQLite",
        email: "carol.sqlite@example.com",
        organizationId: TEST_ORG_ID,
        totalDonated: 50000, // $500
        tier: "silver",
        status: "active",
      },
    ];

    const insertDonor = sqlite.prepare(`
      INSERT INTO donors (firstName, lastName, email, organizationId, totalDonated, tier, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    testDonors.forEach((donor) => {
      insertDonor.run(
        donor.firstName,
        donor.lastName,
        donor.email,
        donor.organizationId,
        donor.totalDonated,
        donor.tier,
        donor.status
      );
    });

    // Create test project
    sqlite
      .prepare(
        `
      INSERT INTO projects (name, description, organizationId, goal, active)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run("Database Test Project", "A test project for database testing", TEST_ORG_ID, 1000000, 1); // 1 for true in SQLite

    // Create test email generation sessions (campaigns)
    const insertSession = sqlite.prepare(`
      INSERT INTO emailGenerationSessions (organizationId, userId, jobName, instruction, chatHistory, selectedDonorIds, previewDonorIds, totalDonors, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertSession.run(
      TEST_ORG_ID,
      TEST_USER_ID,
      "Database Test Campaign 1",
      "Help Us Test the Database",
      "[]",
      "[]",
      "[]",
      3,
      "DRAFT"
    );

    insertSession.run(
      TEST_ORG_ID,
      TEST_USER_ID,
      "Database Test Campaign 2",
      "SQLite Performance Test",
      "[]",
      "[]",
      "[]",
      2,
      "COMPLETED"
    );

    console.log("✅ Test data setup complete");
  });

  test.afterAll(async () => {
    console.log("🧹 Cleaning up test data...");

    // Clean up test data
    sqlite.exec(`
      DELETE FROM emailGenerationSessions WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM donors WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM projects WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM organizationMemberships WHERE organizationId = '${TEST_ORG_ID}';
      DELETE FROM organizations WHERE id = '${TEST_ORG_ID}';
      DELETE FROM users WHERE id = '${TEST_USER_ID}';
    `);

    sqlite.close();
    cleanupTestDatabase(dbPath);
    console.log("✅ Cleanup complete");
  });

  test("should create and verify database tables", async () => {
    // Verify tables exist
    const tables = sqlite
      .prepare(
        `
      SELECT name FROM sqlite_master WHERE type='table'
    `
      )
      .all() as { name: string }[];

    const expectedTables = [
      "users",
      "organizations",
      "organizationMemberships",
      "donors",
      "projects",
      "emailGenerationSessions",
    ];

    for (const expectedTable of expectedTables) {
      const tableExists = tables.some((table) => table.name === expectedTable);
      expect(tableExists).toBe(true);
      console.log(`✅ Table '${expectedTable}' exists`);
    }
  });

  test("should verify SQLite database contains test data", async () => {
    // This test verifies our SQLite setup is working by checking the database directly
    const donorCount = sqlite
      .prepare("SELECT COUNT(*) as count FROM donors WHERE organizationId = ?")
      .get(TEST_ORG_ID) as { count: number };
    const orgCount = sqlite.prepare("SELECT COUNT(*) as count FROM organizations WHERE id = ?").get(TEST_ORG_ID) as {
      count: number;
    };
    const campaignCount = sqlite
      .prepare("SELECT COUNT(*) as count FROM emailGenerationSessions WHERE organizationId = ?")
      .get(TEST_ORG_ID) as { count: number };

    console.log(`Database verification:
      - Donors: ${donorCount.count}
      - Organizations: ${orgCount.count}
      - Campaigns: ${campaignCount.count}`);

    expect(donorCount.count).toBe(3);
    expect(orgCount.count).toBe(1);
    expect(campaignCount.count).toBe(2);

    // Also verify the data content
    const donors = sqlite
      .prepare("SELECT firstName, lastName FROM donors WHERE organizationId = ? ORDER BY firstName")
      .all(TEST_ORG_ID);
    expect(donors).toHaveLength(3);
    expect(donors[0]).toMatchObject({ firstName: "Alice", lastName: "Database" });
    expect(donors[1]).toMatchObject({ firstName: "Bob", lastName: "SQL" });
    expect(donors[2]).toMatchObject({ firstName: "Carol", lastName: "SQLite" });

    console.log("✅ SQLite database verification passed");
  });

  test("should handle database queries and updates", async () => {
    // Test UPDATE operations
    sqlite
      .prepare("UPDATE donors SET tier = ? WHERE firstName = ? AND organizationId = ?")
      .run("diamond", "Alice", TEST_ORG_ID);

    // Verify the update
    const updatedDonor = sqlite
      .prepare("SELECT tier FROM donors WHERE firstName = ? AND organizationId = ?")
      .get("Alice", TEST_ORG_ID) as { tier: string };

    expect(updatedDonor.tier).toBe("diamond");
    console.log("✅ Database UPDATE operation successful");

    // Test JOIN operations
    const donorsWithOrg = sqlite
      .prepare(
        `
      SELECT d.firstName, d.lastName, o.name as orgName
      FROM donors d
      JOIN organizations o ON d.organizationId = o.id
      WHERE d.organizationId = ?
    `
      )
      .all(TEST_ORG_ID);

    expect(donorsWithOrg).toHaveLength(3);
    expect(donorsWithOrg[0]).toHaveProperty("orgName", "Database Test Nonprofit");
    console.log("✅ Database JOIN operation successful");
  });

  test("should respect foreign key constraints", async () => {
    // Try to insert a donor with a non-existent organization
    expect(() => {
      sqlite
        .prepare(
          `
        INSERT INTO donors (firstName, lastName, email, organizationId, totalDonated, tier, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run("Test", "User", "test@example.com", "non-existent-org", 1000, "bronze", "active");
    }).toThrow(); // Should throw foreign key constraint error

    console.log("✅ Foreign key constraints are working");
  });
});
