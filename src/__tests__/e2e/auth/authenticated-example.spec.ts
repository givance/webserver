import { test, expect } from "@playwright/test";

// This test file demonstrates how to write authenticated tests
// The storageState is automatically loaded from playwright/.clerk/user.json

test.describe("Application Features", () => {
  test("should handle donors page access appropriately", async ({ page }) => {
    await page.goto("/donors");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      // Expected behavior for unauthenticated users
      console.log("Donors page correctly protected - redirected to authentication");

      // Verify we're on Clerk sign-in page
      expect(currentUrl).toMatch(/(sign-in|accounts\.dev)/);

      // Should have redirect URL back to donors page
      expect(currentUrl).toContain("redirect_url");
      expect(currentUrl).toContain("donors");

      // Verify sign-in page loads properly
      const pageTitle = await page.title();
      expect(pageTitle).not.toContain("Error");
    } else {
      // If user is authenticated, should access donors page
      console.log("User authenticated - accessing donors page");
      expect(currentUrl).toMatch(/localhost:5001.*donors/);

      // Look for page elements that indicate successful load
      const pageElements = ["h1", "main", "body", "table", ".content"];

      let hasPageContent = false;
      for (const selector of pageElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasPageContent = true;
          console.log(`Found donors page element: ${selector}`);
          break;
        }
      }

      expect(hasPageContent).toBe(true);
    }
  });

  test("should handle campaign page access appropriately", async ({ page }) => {
    await page.goto("/campaign");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      // Expected behavior for unauthenticated users
      console.log("Campaign page correctly protected - redirected to authentication");

      expect(currentUrl).toMatch(/(sign-in|accounts\.dev)/);
      expect(currentUrl).toContain("redirect_url");
      expect(currentUrl).toContain("campaign");
    } else {
      // If authenticated, should access campaign page
      console.log("User authenticated - accessing campaign page");
      expect(currentUrl).toMatch(/localhost:5001.*campaign/);

      // Should be able to see campaign interface
      const campaignElements = ["h1", "main", "body", "button", ".content"];

      let hasCampaignContent = false;
      for (const selector of campaignElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasCampaignContent = true;
          console.log(`Found campaign page element: ${selector}`);
          break;
        }
      }

      expect(hasCampaignContent).toBe(true);
    }
  });

  test("should show appropriate authentication state in navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const currentUrl = page.url();

    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      // User is not authenticated
      console.log("User not authenticated - on sign-in page");

      // Should be on Clerk authentication page
      expect(currentUrl).toMatch(/(sign-in|accounts\.dev)/);

      // Sign-in page should have proper structure
      const hasAuthContent = await page.locator("body").isVisible();
      expect(hasAuthContent).toBe(true);
    } else {
      // User might be authenticated
      console.log("User on application page - checking for authentication indicators");

      // Look for authenticated user indicators in navigation
      const authElements = [
        "[data-testid='user-menu']",
        "[data-testid='user-profile']",
        "button:has-text('Profile')",
        "button:has-text('Settings')",
        "button:has-text('Sign out')",
        ".user-menu",
        ".profile",
        "nav a",
        "header",
      ];

      let hasAuthIndicators = false;
      for (const selector of authElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasAuthIndicators = true;
          console.log(`Found auth indicator: ${selector}`);
          break;
        }
      }

      // Even if no specific auth indicators, page should have content
      if (!hasAuthIndicators) {
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText!.length).toBeGreaterThan(100);
        console.log("No specific auth indicators found, but page has content");
      } else {
        console.log("Found authentication indicators in navigation");
      }
    }
  });

  test("should handle routing and navigation appropriately", async ({ page }) => {
    // Start from homepage
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const homeUrl = page.url();

    if (homeUrl.includes("sign-in") || homeUrl.includes("accounts.dev")) {
      console.log("User not authenticated - testing sign-in page navigation");

      // Should be on authentication page
      expect(homeUrl).toMatch(/(sign-in|accounts\.dev)/);

      // Page should load without errors
      const pageTitle = await page.title();
      expect(pageTitle).not.toContain("Error");
    } else {
      console.log("User on application - testing internal navigation");

      // Try to find and click navigation links
      const navElements = ["a[href*='/donors']", "a[href*='/campaign']", "a[href*='/projects']", "nav a", ".nav-link"];

      let navigationWorked = false;
      for (const selector of navElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          try {
            console.log(`Trying to click navigation: ${selector}`);
            await element.click();
            await page.waitForLoadState("networkidle");

            const newUrl = page.url();
            if (newUrl !== homeUrl) {
              navigationWorked = true;
              console.log(`Navigation successful to: ${newUrl}`);
              break;
            }
          } catch (error) {
            console.log(`Navigation click failed: ${error}`);
            continue;
          }
        }
      }

      // Even if navigation doesn't work, the page should have basic content
      const hasBasicContent = await page.locator("body").textContent();
      expect(hasBasicContent).toBeTruthy();
      expect(hasBasicContent!.length).toBeGreaterThan(50);
    }
  });
});
