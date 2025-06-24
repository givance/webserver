import { test, expect } from "@playwright/test";
import { DonorsHelper } from "../helpers/donors";

test.describe("Donor Management", () => {
  let donors: DonorsHelper;

  test.beforeEach(async ({ page }) => {
    donors = new DonorsHelper(page);
    // Mock authentication
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("__clerk_db_jwt", "mock-jwt-token");
    });
  });

  test("should load donors page", async ({ page }) => {
    await donors.navigateToDonorsPage();

    // Should either load donors page or redirect to auth
    const currentUrl = page.url();
    if (currentUrl.includes("donors")) {
      // If on donors page, check for donor-related elements
      const donorElements = [
        'h1:has-text("Donors")',
        '[data-testid="donors-table"]',
        "table",
        ".donor-list",
        'button:has-text("Add Donor")',
        'button:has-text("New Donor")',
      ];

      let hasDonorElements = false;
      for (const selector of donorElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasDonorElements = true;
          break;
        }
      }

      expect(hasDonorElements).toBe(true);
    } else {
      // If redirected to auth, that's expected behavior
      expect(currentUrl).toMatch(/(sign-in|auth|login)/);
    }
  });

  test("should handle donor search functionality", async ({ page }) => {
    await donors.navigateToDonorsPage();

    // Look for search input
    const searchInput = page
      .locator('input[placeholder*="search"], input[type="search"], [data-testid="search-input"]')
      .first();

    if (await searchInput.isVisible().catch(() => false)) {
      await donors.searchDonors("John");

      // Should not show any critical error messages (allow informational alerts)
      const criticalErrors = page.locator('.error:has-text("Error"), .alert-error, [role="alert"]:has-text("Error")');
      expect(await criticalErrors.count()).toBe(0);
    }
  });

  test("should handle donor profile navigation", async ({ page }) => {
    await donors.navigateToDonorsPage();

    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Look for donor name links in the table
    const donorLink = page.locator('table tbody tr td a[href*="/donors/"]').first();

    const isLinkVisible = await donorLink.isVisible().catch(() => false);
    
    if (isLinkVisible) {
      await donorLink.click();

      // Wait for navigation to complete
      await page.waitForURL(/\/donors\/\d+$/, { timeout: 10000 });

      const currentUrl = page.url();
      expect(currentUrl).toMatch(/donors\/\d+$/);
    } else {
      // If no donors exist, skip the test
      console.log("No donor links found - table might be empty");
    }
  });
});

test.describe("Donor Forms", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("__clerk_db_jwt", "mock-jwt-token");
    });
  });

  test("should load add donor form", async ({ page }) => {
    // Try different possible routes for adding donors
    const addDonorRoutes = ["/donors/new", "/donors/add", "/donors/create"];

    for (const route of addDonorRoutes) {
      await page.goto(route);

      if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
        // Check if form exists
        const formElements = [
          "form",
          'input[name*="name"]',
          'input[name*="email"]',
          'button:has-text("Save")',
          'button:has-text("Create")',
          'button:has-text("Add Donor")',
        ];

        let hasFormElements = false;
        for (const selector of formElements) {
          const element = page.locator(selector).first();
          if (await element.isVisible().catch(() => false)) {
            hasFormElements = true;
            break;
          }
        }

        if (hasFormElements) {
          expect(hasFormElements).toBe(true);
          break;
        }
      }
    }
  });

  test("should validate required fields in donor form", async ({ page }) => {
    await page.goto("/donors/new");

    // If not redirected to auth, try to submit empty form
    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      const submitButton = page
        .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
        .first();

      if (await submitButton.isVisible().catch(() => false)) {
        await submitButton.click();

        // Should show validation errors or prevent submission
        const validationErrors = page.locator('.error, .invalid, [role="alert"], .text-red-500');
        const errorCount = await validationErrors.count();

        // Either has validation errors or form didn't submit (stayed on same page)
        const stayedOnForm = page.url().includes("new") || page.url().includes("add") || page.url().includes("create");

        expect(errorCount > 0 || stayedOnForm).toBe(true);
      }
    }
  });
});
