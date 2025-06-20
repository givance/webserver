import { cleanupGlobalTestDatabase } from "./src/__tests__/e2e/setup/database-setup";

/**
 * Global teardown function for Playwright
 * Runs once after all tests complete
 */
async function globalTeardown() {
  console.log("🧹 Running global cleanup...");

  try {
    await cleanupGlobalTestDatabase();
    console.log("✅ Global cleanup complete");
  } catch (error) {
    console.error("❌ Global cleanup failed:", error);
    // Don't throw - we want the process to exit cleanly
  }
}

export default globalTeardown;
