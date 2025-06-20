import { clerkSetup } from "@clerk/testing/playwright";
import { setupGlobalTestDatabase } from "./src/__tests__/e2e/setup/database-setup";

// Global setup function for Playwright
async function globalSetup() {
  console.log("🔧 Setting up test environment...");

  console.log("🗄️ Setting up test database...");
  await setupGlobalTestDatabase();

  console.log("🔧 Setting up Clerk for testing...");
  await clerkSetup();

  console.log("✅ Global setup complete");
}

export default globalSetup;
