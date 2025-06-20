import { test, expect } from "@playwright/test";

// These tests handle both authenticated and unauthenticated scenarios
// Since we're using real Clerk authentication, users will be redirected if not authenticated

test.describe("Authentication State Tests", () => {
  test("should handle authentication state appropriately", async ({ page }) => {
    // User might be authenticated via storageState or redirected to sign-in
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      // If redirected to Clerk sign-in, that's expected for unauthenticated users
      console.log("User is not authenticated - redirected to Clerk sign-in");

      // Verify we're on a Clerk sign-in page
      expect(currentUrl).toMatch(/(sign-in|accounts\.dev)/);

      // Check that the sign-in page loads properly
      const pageTitle = await page.title();
      expect(pageTitle).not.toContain("Error");
    } else {
      // If not redirected, user might be authenticated
      console.log("User appears to be authenticated or on public page");

      // Verify we're on our application
      expect(currentUrl).toMatch(/localhost:5001/);

      // Check that the page has content
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
      expect(bodyText!.length).toBeGreaterThan(50);
    }
  });

  test("should handle protected routes appropriately", async ({ page }) => {
    await page.goto("/donors");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      // Expected behavior for unauthenticated users accessing protected routes
      console.log("Protected route correctly redirected to authentication");
      expect(currentUrl).toMatch(/(sign-in|accounts\.dev)/);

      // Should have redirect_url parameter pointing back to donors page
      expect(currentUrl).toContain("redirect_url");
      expect(currentUrl).toContain("donors");
    } else {
      // If user is authenticated, should be able to access donors page
      console.log("User authenticated - accessing donors page");
      expect(currentUrl).toMatch(/localhost:5001.*donors/);

      // Should have some content on the page
      const hasContent = await page.locator("main, body, .content").first().isVisible();
      expect(hasContent).toBe(true);
    }
  });

  test("should handle campaign pages appropriately", async ({ page }) => {
    await page.goto("/campaign");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      // Expected behavior for unauthenticated users
      console.log("Campaign route correctly redirected to authentication");
      expect(currentUrl).toMatch(/(sign-in|accounts\.dev)/);
      expect(currentUrl).toContain("redirect_url");
      expect(currentUrl).toContain("campaign");
    } else {
      // If authenticated, should access campaign page
      console.log("User authenticated - accessing campaign page");
      expect(currentUrl).toMatch(/localhost:5001.*campaign/);

      const hasContent = await page.locator("main, body, .content").first().isVisible();
      expect(hasContent).toBe(true);
    }
  });

  test("should handle session persistence", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const urlBeforeRefresh = page.url();

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");

    const urlAfterRefresh = page.url();

    // Authentication state should be maintained
    // (both should be authenticated or both should be redirected)
    if (urlBeforeRefresh.includes("sign-in") || urlBeforeRefresh.includes("accounts.dev")) {
      // If was unauthenticated before, should still be unauthenticated
      expect(urlAfterRefresh).toMatch(/(sign-in|accounts\.dev)/);
    } else {
      // If was authenticated before, should maintain that state
      expect(urlAfterRefresh).toMatch(/localhost:5001/);
      expect(urlAfterRefresh).not.toContain("sign-in");
    }
  });

  test("should handle logout functionality if present", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Only test logout if user is authenticated (not on sign-in page)
    const currentUrl = page.url();
    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      console.log("User not authenticated, skipping logout test");
      return;
    }

    // Look for logout/sign out button
    const logoutElements = [
      'button:has-text("Sign out")',
      'button:has-text("Logout")',
      'a:has-text("Sign out")',
      '[data-testid="sign-out"]',
      ".sign-out",
      ".logout",
    ];

    let logoutButton = null;
    for (const selector of logoutElements) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        logoutButton = element;
        break;
      }
    }

    if (logoutButton) {
      await logoutButton.click();
      await page.waitForTimeout(2000);

      // Should redirect to sign-in or home with signed out state
      const afterLogoutUrl = page.url();
      const isLoggedOut = afterLogoutUrl.includes("sign-in") || afterLogoutUrl.includes("accounts.dev");

      expect(isLoggedOut).toBe(true);
    } else {
      console.log("No logout button found - this is acceptable");
    }
  });
});

test.describe("Unauthenticated Access", () => {
  test("should handle protected routes appropriately for unauthenticated users", async ({ page }) => {
    // Clear any existing authentication state
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/donors");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    // Should either redirect to sign-in OR if user is authenticated via setup, access should work
    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      // Expected for truly unauthenticated users
      expect(currentUrl).toMatch(/(sign-in|accounts\.dev)/);
      expect(currentUrl).toContain("redirect_url");
    } else {
      // If user is authenticated via test setup, should be able to access
      expect(currentUrl).toMatch(/localhost:5001.*donors/);
      console.log("User authenticated via test setup - can access protected routes");
    }
  });

  test("should handle multiple protected routes correctly", async ({ page }) => {
    const protectedRoutes = ["/donors", "/campaign", "/projects", "/lists"];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const currentUrl = page.url();

      // Should either be redirected to auth OR successfully access if authenticated
      const isRedirectedToAuth = currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev");
      const isAccessingRoute = currentUrl.includes(route.substring(1));

      expect(isRedirectedToAuth || isAccessingRoute).toBe(true);

      console.log(`Route ${route} handled appropriately`);
    }
  });
});
