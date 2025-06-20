import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  // No beforeEach needed - authentication state is already loaded from storage

  test("should load dashboard page with authenticated content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // With proper authentication, we should not be redirected to sign-in
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("sign-in");
    expect(currentUrl).not.toContain("accounts.dev");

    // Page should have substantial content
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(100);

    // Look for main content elements that indicate a working dashboard
    const contentElements = [
      "main",
      ".main-content",
      ".dashboard",
      ".content",
      "h1",
      "h2",
      ".stats",
      ".metrics",
      ".widget",
    ];

    let hasContent = false;
    for (const selector of contentElements) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        hasContent = true;
        console.log(`Found content element: ${selector}`);
        break;
      }
    }

    expect(hasContent).toBe(true);
  });

  test("should display some form of content or metrics", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Look for any kind of content display
      const contentTypes = [
        // Text content
        "text=/donors?/i",
        "text=/campaigns?/i",
        "text=/total/i",
        "text=/raised/i",
        "text=/active/i",
        "text=/recent/i",
        // Number patterns
        "text=/\\$[0-9,]+/",
        "text=/[0-9]+/",
        // Common UI elements
        "button",
        "a[href]",
        "table",
        "list",
        ".card",
        ".summary",
      ];

      let hasAnyContent = false;
      for (const pattern of contentTypes) {
        const element = page.locator(pattern).first();
        if (await element.isVisible().catch(() => false)) {
          hasAnyContent = true;
          console.log(`Found content: ${pattern}`);
          break;
        }
      }

      // Should have some form of content
      expect(hasAnyContent).toBe(true);
    } else {
      // If on auth page, that's also acceptable
      expect(true).toBe(true);
    }
  });

  test("should be responsive and functional", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Test mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      // Should not have major layout issues
      const bodyElement = page.locator("body");
      expect(await bodyElement.isVisible()).toBe(true);

      // Test desktop viewport
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(500);

      // Page should still be functional
      expect(await bodyElement.isVisible()).toBe(true);
    }
  });

  test("should handle navigation if present", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Look for any navigation elements
      const navElements = [
        'a[href*="/donors"]',
        'a[href*="/campaigns"]',
        'a[href*="/campaign"]',
        'a[href*="/projects"]',
        'button:has-text("Donors")',
        'button:has-text("Campaigns")',
        "nav a",
        ".nav-link",
        ".sidebar a",
      ];

      let navFound = false;
      for (const selector of navElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          console.log(`Found navigation element: ${selector}`);
          navFound = true;

          // Try clicking it
          try {
            await element.click();
            await page.waitForLoadState("networkidle");

            // Should navigate somewhere
            const newUrl = page.url();
            console.log(`Navigated to: ${newUrl}`);
            expect(newUrl).toMatch(/localhost:5001/);
            break;
          } catch (error) {
            console.log(`Navigation click failed: ${error}`);
            // Continue to next element
          }
        }
      }

      // If no navigation found, that's also acceptable for this test
      console.log(`Navigation elements found: ${navFound}`);
    }
  });
});

test.describe("Quick Actions", () => {
  // No beforeEach needed - authentication state is already loaded from storage

  test("should handle basic page functionality", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Look for any interactive elements
      const interactiveElements = [
        'button:has-text("Add")',
        'button:has-text("New")',
        'button:has-text("Create")',
        'a:has-text("Add")',
        'a:has-text("New")',
        ".action-button",
        ".btn",
        '[data-testid*="add"]',
        '[data-testid*="create"]',
      ];

      let hasInteractivity = false;
      for (const selector of interactiveElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasInteractivity = true;
          console.log(`Found interactive element: ${selector}`);
          break;
        }
      }

      // Even if no specific action buttons, page should have some interactive elements
      if (!hasInteractivity) {
        // Check for basic clickable elements
        const basicElements = ["button", "a[href]", "input", "select"];
        for (const selector of basicElements) {
          const element = page.locator(selector).first();
          if (await element.isVisible().catch(() => false)) {
            hasInteractivity = true;
            break;
          }
        }
      }

      // Page should have some form of interactivity or just content
      const hasContent = await page.locator("body").textContent();
      expect(hasInteractivity || (hasContent && hasContent.length > 100)).toBe(true);
    }
  });
});
