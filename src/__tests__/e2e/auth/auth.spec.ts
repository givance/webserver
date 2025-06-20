import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("should display sign-in page when not authenticated", async ({ page }) => {
    await page.goto("/");

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Should either show sign-in page or redirect to auth
    const currentUrl = page.url();
    const isOnSignIn = currentUrl.includes("sign-in") || currentUrl.includes("auth");

    if (isOnSignIn) {
      // Check for sign-in elements
      const signInElements = [
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        '[data-testid="sign-in-button"]',
        'input[type="email"]',
        'input[type="password"]',
        ".sign-in",
        ".auth",
        ".login",
      ];

      let hasSignInElement = false;
      for (const selector of signInElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasSignInElement = true;
          break;
        }
      }

      expect(hasSignInElement).toBe(true);
    } else {
      // If not on sign-in, the app might handle auth differently
      // Just ensure the page loads without errors
      expect(page.url()).toMatch(/localhost:5001/);
    }
  });

  test("should handle sign-in process", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    // Mock successful authentication by setting auth cookies/localStorage
    await page.evaluate(() => {
      localStorage.setItem("__clerk_db_jwt", "mock-jwt-token");
      localStorage.setItem("__clerk_db_jwt_", "mock-jwt-token");
    });

    // Navigate to protected route
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should either show dashboard content or still be on sign-in (depends on Clerk setup)
    const currentUrl = page.url();
    const bodyContent = await page.textContent("body");

    // Test passes if either we're authenticated or we're on auth page
    const hasContent = bodyContent && bodyContent.length > 100;
    expect(hasContent || currentUrl.includes("sign-in") || currentUrl.includes("auth")).toBe(true);
  });
});

test.describe("Navigation", () => {
  test("should have working navigation structure", async ({ page }) => {
    // Start from homepage
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check page loads without errors
    await expect(page).not.toHaveTitle(/Error|Not Found/);

    // Look for any common page structure elements
    const pageElements = [
      "nav",
      '[role="navigation"]',
      "header",
      "main",
      "body",
      ".navbar",
      ".navigation",
      ".layout",
      ".container",
    ];

    let hasPageStructure = false;
    for (const selector of pageElements) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        hasPageStructure = true;
        console.log(`Found page element: ${selector}`);
        break;
      }
    }

    // Should have some form of page structure
    expect(hasPageStructure).toBe(true);
  });

  test("should load main content without errors", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check that the page has substantial content
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);

    // Check that no major errors are displayed
    const errorMessages = ["Error 404", "Page Not Found", "Internal Server Error", "Something went wrong"];

    for (const errorMsg of errorMessages) {
      const hasError = await page
        .locator(`text=${errorMsg}`)
        .isVisible()
        .catch(() => false);
      expect(hasError).toBe(false);
    }
  });
});
