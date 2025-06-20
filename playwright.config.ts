import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Load environment variables - try .env.test first, then .env.local
dotenv.config({ path: path.resolve(__dirname, ".env.test") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// Ensure Clerk env vars are set
process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./src/__tests__/e2e",
  /* Global setup - runs once before all tests */
  globalSetup: require.resolve("./global.setup.ts"),
  /* Global teardown - runs once after all tests */
  globalTeardown: require.resolve("./global.teardown.ts"),
  /* Run tests in files in parallel */
  fullyParallel: false, // Disable for database tests
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Force sequential execution to prevent race conditions */
  workers: 1,
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

    /* Run in headless mode by default */
    headless: true,
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup - runs clerk setup and authentication
    {
      name: "setup",
      testMatch: "**/setup/auth.setup.ts",
    },

    // Authentication tests
    {
      name: "auth",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: "**/auth/**/*.spec.ts",
      dependencies: ["setup"],
    },

    // Campaign tests (requires auth)
    {
      name: "campaigns",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: "**/campaigns/**/*.spec.ts",
      dependencies: ["setup"],
    },

    // Donor tests (requires auth)
    {
      name: "donors",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: "**/donors/**/*.spec.ts",
      dependencies: ["setup"],
    },

    // Donation tests (requires auth)
    {
      name: "donations",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: "**/donations/**/*.spec.ts",
      dependencies: ["setup"],
    },

    // Project tests (requires auth)
    {
      name: "projects",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: "**/projects/**/*.spec.ts",
      dependencies: ["setup"],
    },

    // Staff tests (requires auth)
    {
      name: "staff",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: "**/staff/**/*.spec.ts",
      dependencies: ["setup"],
    },

    // Core tests (database, dashboard, smoke tests, accessibility)
    {
      name: "core",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: "**/core/**/*.spec.ts",
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
    env: {
      ...process.env,
      // Use PostgreSQL test database for the web server
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/givance_test",
    },
  },
});
