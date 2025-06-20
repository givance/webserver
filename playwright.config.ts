import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Load environment variables - try .env.test first, then .env.local
dotenv.config({ path: path.resolve(__dirname, ".env.test") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// Debug environment variables
console.log("🔍 Environment check:");
console.log("E2E_CLERK_USER_USERNAME:", process.env.E2E_CLERK_USER_USERNAME ? "✅ Set" : "❌ Missing");
console.log("E2E_CLERK_USER_PASSWORD:", process.env.E2E_CLERK_USER_PASSWORD ? "✅ Set" : "❌ Missing");
console.log("CLERK_PUBLISHABLE_KEY:", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "✅ Set" : "❌ Missing");

// Ensure Clerk env vars are set
process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./src/__tests__/e2e",
  /* Run tests in files in parallel */
  fullyParallel: false, // Disable for database tests
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5001",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Show browser by default (remove this line to run headless) */
    headless: false,
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup - runs clerk setup and authentication
    {
      name: "setup",
      testMatch: "**/setup/auth.setup.ts",
    },

    // Authenticated tests (requires auth state)
    {
      name: "Authenticated tests",
      use: {
        ...devices["Desktop Chrome"],
        // Use prepared Clerk auth state
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: [
        "**/authenticated-*.spec.ts",
        "**/dashboard.spec.ts",
        "**/campaign-management.spec.ts",
        "**/donor-management.spec.ts",
        "**/login.spec.ts",
      ],
      dependencies: ["setup"],
    },

    // Core tests (no auth required)
    {
      name: "Core tests",
      use: {
        ...devices["Desktop Chrome"],
      },
      testMatch: ["**/database-only.spec.ts", "**/auth.spec.ts", "**/smoke-tests.spec.ts", "**/accessibility.spec.ts"],
      testIgnore: [
        "**/authenticated-*.spec.ts",
        "**/dashboard.spec.ts",
        "**/campaign-management.spec.ts",
        "**/donor-management.spec.ts",
        "**/login.spec.ts",
      ],
      dependencies: ["setup"],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "PORT=5001 npm run dev",
    port: 5001,
    reuseExistingServer: false, // Always start fresh test server
    stdout: "pipe", // Show server output for debugging
    stderr: "pipe",
    timeout: 120000, // 2 minutes to start
  },
});
