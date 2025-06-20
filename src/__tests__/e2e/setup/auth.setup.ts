import { test as setup } from "@playwright/test";
import { clerk, setupClerkTestingToken, clerkSetup } from "@clerk/testing/playwright";
import path from "path";
import fs from "fs";

const authFile = path.join(__dirname, "../../../..", "playwright/.clerk/user.json");

setup("clerk setup and authenticate", async ({ page }) => {
  console.log("🔧 Starting Clerk setup and authentication...");

  // First, ensure Clerk is set up globally
  await clerkSetup();
  console.log("✅ Clerk global setup complete");

  // Ensure the directory exists
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Check if we have the required environment variables
  if (!process.env.E2E_CLERK_USER_USERNAME || !process.env.E2E_CLERK_USER_PASSWORD) {
    console.error("❌ Missing E2E_CLERK_USER_USERNAME or E2E_CLERK_USER_PASSWORD environment variables");
    console.log("Please set these in your .env.local file:");
    console.log("E2E_CLERK_USER_USERNAME=your-test-user@example.com");
    console.log("E2E_CLERK_USER_PASSWORD=YourTestPassword123!");
    console.log("");
    console.log("Example .env.local entries:");
    console.log("E2E_CLERK_USER_USERNAME=test@example.com");
    console.log("E2E_CLERK_USER_PASSWORD=TestPassword123!");

    // Create a basic state file so tests don't crash
    const emptyState = {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:5001",
          localStorage: [],
        },
      ],
    };
    fs.writeFileSync(authFile, JSON.stringify(emptyState, null, 2));
    throw new Error("Test user credentials not configured");
  }

  try {
    // Navigate to the application
    await page.goto("/");
    console.log("📍 Navigated to homepage");

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Set up Clerk testing token before signing in
    await setupClerkTestingToken({ page });
    console.log("✅ Clerk testing token set up");

    // Use Clerk's testing utilities to sign in
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: process.env.E2E_CLERK_USER_USERNAME!,
        password: process.env.E2E_CLERK_USER_PASSWORD!,
      },
    });

    console.log("✅ Signed in with Clerk");

    // Wait for authentication to complete
    await page.waitForTimeout(2000);

    // Verify we're signed in by checking if we can access a protected route
    await page.goto("/donors");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();
    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      throw new Error("Authentication failed - still on sign-in page");
    }

    console.log("✅ Successfully authenticated - can access protected routes");

    // Save authenticated state
    await page.context().storageState({ path: authFile });
    console.log("✅ Authentication state saved");
  } catch (error) {
    console.error("❌ Authentication setup failed:", error);

    // Create a basic state file so tests don't crash
    const basicState = {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:5001",
          localStorage: [],
        },
      ],
    };
    fs.writeFileSync(authFile, JSON.stringify(basicState, null, 2));

    throw error;
  }
});
