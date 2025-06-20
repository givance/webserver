import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  users,
  organizations,
  organizationMemberships,
  donors,
  projects,
  emailGenerationSessions,
  staff,
} from "../../../app/lib/db/schema";
import * as dotenv from "dotenv";
import path from "path";

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

/**
 * Setup PostgreSQL test database with schema and test data
 */
export async function setupGlobalTestDatabase() {
  console.log("🗄️ Setting up PostgreSQL test database...");

  // Get database URL from test environment
  const testDatabaseUrl = process.env.DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("DATABASE_URL not found in .env.test file");
  }

  console.log(`📡 Connecting to test database: ${testDatabaseUrl.replace(/\/\/.*@/, "//***@")}`);

  // Create database connection
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
    },
  });

  try {
    console.log("🧹 Cleaning existing test data...");
    await cleanupTestData(db);

    console.log("📋 Running database migrations...");
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });

    console.log("📋 Creating test data...");
    await createTestData(db);

    console.log("✅ PostgreSQL test database setup complete");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Clean up existing test data
 */
async function cleanupTestData(db: ReturnType<typeof drizzle>) {
  try {
    // Delete in order of dependencies (child tables first)
    await db.delete(emailGenerationSessions);
    await db.delete(donors);
    await db.delete(projects);
    await db.delete(staff);
    await db.delete(organizationMemberships);
    await db.delete(organizations);
    await db.delete(users);

    console.log("✅ Existing test data cleaned up");
  } catch (error) {
    console.log("⚠️ Cleanup warning (expected for first run):", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Create test data using Drizzle ORM
 */
async function createTestData(db: ReturnType<typeof drizzle>) {
  const testUserId = "user_2yl6QlrDHV2dq83Yql2WS9LZWpo";
  const testOrgId = "org_2yl9dNO866AsVhdsRMmTr2CtJ4a";

  console.log("👤 Creating test user...");
  await db.insert(users).values({
    id: testUserId,
    firstName: "Test",
    lastName: "User",
    email: "testuser@test.com",
    profileImageUrl: null,
    emailSignature: "Best regards,\nTest User",
    memory: [],
    dismissedMemories: [],
    stages: [],
  });

  console.log("🏢 Creating test organization...");
  await db.insert(organizations).values({
    id: testOrgId,
    name: "Test Org",
    slug: "test-org",
    imageUrl: null,
    createdBy: testUserId,
    websiteUrl: "https://test-org.example.com",
    websiteSummary: "A test organization for end-to-end testing",
    description: "Test organization for E2E tests with comprehensive donor management",
    shortDescription: "Test org for E2E",
    writingInstructions: "Write in a friendly, professional tone",
    donorJourneyText: "Our donors go through awareness, engagement, donation, and retention stages",
    donorJourney: { nodes: [], edges: [] },
    memory: [],
  });

  console.log("👥 Creating organization membership...");
  await db.insert(organizationMemberships).values({
    organizationId: testOrgId,
    userId: testUserId,
    role: "admin",
  });

  console.log("👨‍💼 Creating test staff...");
  await db.insert(staff).values([
    {
      organizationId: testOrgId,
      firstName: "Primary",
      lastName: "Staff",
      email: "primary@test-org.example.com",
      isRealPerson: true,
      isPrimary: true,
      signature: "Best regards,\nPrimary Staff\nTest Organization",
    },
    {
      organizationId: testOrgId,
      firstName: "Secondary",
      lastName: "Staff",
      email: "secondary@test-org.example.com",
      isRealPerson: true,
      isPrimary: false,
      signature: "Sincerely,\nSecondary Staff",
    },
  ]);

  console.log("📂 Creating test project...");
  const [project] = await db
    .insert(projects)
    .values({
      organizationId: testOrgId,
      name: "General Fund",
      description: "General donations for the organization",
      active: true,
      goal: 100000, // $1000 in cents
      tags: ["general", "fundraising"],
    })
    .returning();

  console.log("👥 Creating test donors...");
  const [donor1, donor2, donor3] = await db
    .insert(donors)
    .values([
      {
        organizationId: testOrgId,
        externalId: "DONOR_001",
        firstName: "Alice",
        lastName: "Johnson",
        displayName: "Alice Johnson",
        email: "alice@example.com",
        phone: "555-0101",
        address: "123 Main St, Springfield, CA 90210",
        state: "CA",
        isCouple: false,
        gender: "female",
        notes: "Regular donor, prefers email communication",
        assignedToStaffId: null,
        currentStageName: "engaged",
        classificationReasoning: "Regular donation pattern",
        predictedActions: null,
        highPotentialDonor: false,
      },
      {
        organizationId: testOrgId,
        externalId: "DONOR_002",
        firstName: "Bob",
        lastName: "Smith",
        displayName: "Bob Smith",
        email: "bob@example.com",
        phone: "555-0102",
        address: "456 Oak Ave, New York, NY 10001",
        state: "NY",
        isCouple: false,
        gender: "male",
        notes: "Major donor, high engagement",
        assignedToStaffId: null,
        currentStageName: "committed",
        classificationReasoning: "High donation amounts and frequency",
        predictedActions: null,
        highPotentialDonor: true,
      },
      {
        organizationId: testOrgId,
        externalId: "DONOR_003",
        firstName: "Carol",
        lastName: "Davis",
        displayName: "Carol Davis",
        email: "carol@example.com",
        phone: "555-0103",
        address: "789 Pine St, Austin, TX 73301",
        state: "TX",
        isCouple: false,
        gender: "female",
        notes: "New donor, potential for growth",
        assignedToStaffId: null,
        currentStageName: "new",
        classificationReasoning: "Recent first-time donor",
        predictedActions: null,
        highPotentialDonor: false,
      },
    ])
    .returning();

  console.log("📧 Creating test email campaigns...");
  await db.insert(emailGenerationSessions).values([
    {
      organizationId: testOrgId,
      userId: testUserId,
      instruction: "Create a thank you email for recent donors focusing on impact",
      refinedInstruction:
        "Create personalized thank you emails highlighting the specific impact of each donor's contribution",
      chatHistory: JSON.stringify([
        { role: "user", content: "I want to thank recent donors" },
        { role: "assistant", content: "I'll help you create personalized thank you emails" },
      ]),
      selectedDonorIds: JSON.stringify([donor1.id, donor2.id]),
      previewDonorIds: JSON.stringify([donor1.id]),
      status: "COMPLETED",
      triggerJobId: "test_job_1",
      totalDonors: 2,
      completedDonors: 2,
      errorMessage: null,
      completedAt: new Date(),
      jobName: "E2E Test Campaign 1",
      templateId: null,
    },
    {
      organizationId: testOrgId,
      userId: testUserId,
      instruction: "Send year-end appeal to all donors with giving summary",
      refinedInstruction: "Create year-end appeal emails with personalized giving summaries and impact stories",
      chatHistory: JSON.stringify([
        { role: "user", content: "I need to send year-end appeals" },
        { role: "assistant", content: "I'll create personalized year-end appeals with giving summaries" },
      ]),
      selectedDonorIds: JSON.stringify([donor1.id, donor2.id, donor3.id]),
      previewDonorIds: JSON.stringify([donor1.id, donor2.id]),
      status: "PENDING",
      triggerJobId: "test_job_2",
      totalDonors: 3,
      completedDonors: 0,
      errorMessage: null,
      completedAt: null,
      jobName: "E2E Test Campaign 2",
      templateId: null,
    },
  ]);

  console.log("✅ Test data creation complete");
}

/**
 * Clean up test database (for teardown)
 */
export async function cleanupGlobalTestDatabase() {
  console.log("🧹 Cleaning up test database...");

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
    },
  });

  try {
    await cleanupTestData(db);
    console.log("✅ Test database cleanup complete");
  } catch (error) {
    console.error("❌ Database cleanup failed:", error);
  } finally {
    await pool.end();
  }
}

// If run directly
if (require.main === module) {
  setupGlobalTestDatabase()
    .then(() => {
      console.log("✅ Test database setup complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Test database setup failed:", error);
      process.exit(1);
    });
}
