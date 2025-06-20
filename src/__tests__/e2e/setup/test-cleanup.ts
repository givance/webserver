import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql, or, like } from "drizzle-orm";
import {
  users,
  organizations,
  organizationMemberships,
  donors,
  projects,
  emailGenerationSessions,
  staff,
  donations,
} from "../../../app/lib/db/schema";

/**
 * Clean up test data between tests to prevent race conditions
 * This removes data created by tests but preserves base test data
 */
export async function cleanupBetweenTests() {
  const testDatabaseUrl = process.env.DATABASE_URL;
  if (!testDatabaseUrl) {
    console.log("⚠️ No DATABASE_URL found, skipping cleanup");
    return;
  }

  const pool = new Pool({
    connectionString: testDatabaseUrl,
  });

  const db = drizzle(pool, {
    schema: {
      users,
      organizations,
      organizationMemberships,
      donors,
      projects,
      emailGenerationSessions,
      staff,
      donations,
    },
  });

  try {
    console.log("🧹 Cleaning up test-created data...");

    // Clean up test donors (identified by test patterns)
    const testDonorPatterns = [
      "Test%", // TestDonor123, Test1234
      "ViewTest%", // ViewTestDonor
      "EditTest%", // EditTestDonor
      "BulkTest%", // BulkTestDonor
    ];

    for (const pattern of testDonorPatterns) {
      await db.delete(donors).where(like(donors.firstName, pattern));
    }

    // Clean up donors with test email patterns
    await db
      .delete(donors)
      .where(
        or(
          like(donors.email, "test%@example.com"),
          like(donors.email, "view%@example.com"),
          like(donors.email, "edit%@example.com"),
          like(donors.email, "bulk%@example.com")
        )
      );

    // Clean up test projects
    await db
      .delete(projects)
      .where(
        or(
          like(projects.name, "Test Project %"),
          like(projects.name, "TestProject%"),
          like(projects.name, "View Test Project %"),
          like(projects.name, "Edit Test Project %"),
          like(projects.name, "Donations Test Project %")
        )
      );

    // Clean up test staff
    await db.delete(staff).where(or(like(staff.firstName, "Test%"), like(staff.email, "test%@example.com")));

    // Clean up test campaigns
    await db
      .delete(emailGenerationSessions)
      .where(
        or(
          like(emailGenerationSessions.jobName, "Test Campaign %"),
          like(emailGenerationSessions.jobName, "Delete Test %")
        )
      );

    console.log("✅ Test data cleanup complete");
  } catch (error) {
    console.error("❌ Test cleanup failed:", error);
    // Don't throw - let tests continue
  } finally {
    await pool.end();
  }
}

/**
 * Reset database to base test state
 * Use this for tests that need a completely clean slate
 */
export async function resetToBaseState() {
  const testDatabaseUrl = process.env.DATABASE_URL;
  if (!testDatabaseUrl) {
    console.log("⚠️ No DATABASE_URL found, skipping reset");
    return;
  }

  const pool = new Pool({
    connectionString: testDatabaseUrl,
  });

  const db = drizzle(pool, {
    schema: {
      users,
      organizations,
      organizationMemberships,
      donors,
      projects,
      emailGenerationSessions,
      staff,
      donations,
    },
  });

  try {
    console.log("🔄 Resetting to base test state...");

    // Delete all data except base test data
    await db.delete(donations);
    await db.delete(emailGenerationSessions);

    // Keep only the 3 base test donors (Alice, Bob, Carol)
    await db.delete(donors).where(sql`external_id NOT IN ('DONOR_001', 'DONOR_002', 'DONOR_003')`);

    // Keep only base test staff
    await db.delete(staff).where(sql`first_name NOT IN ('Primary', 'Secondary')`);

    // Keep only "General Fund" project
    await db.delete(projects).where(sql`name != 'General Fund'`);

    console.log("✅ Reset to base state complete");
  } catch (error) {
    console.error("❌ Reset to base state failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}
