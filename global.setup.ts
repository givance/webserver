import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Configure Playwright with Clerk
setup("global setup", async ({}) => {
  console.log("🔧 Setting up Clerk for testing...");
  await clerkSetup();
  console.log("✅ Clerk setup complete");
});
