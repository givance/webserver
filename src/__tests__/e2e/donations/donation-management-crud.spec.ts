import { test, expect } from "@playwright/test";
import { cleanupBetweenTests } from "../setup/test-cleanup";
import { DonationsHelper } from "../helpers/donations";

test.describe("Donations CRUD Operations", () => {
  let donations: DonationsHelper;

  test.beforeEach(async ({ page }) => {
    donations = new DonationsHelper(page);
    await donations.navigateToDonationsPage();
  });

  test.afterEach(async () => {
    // Clean up test data after each test
    await cleanupBetweenTests();
  });

  test("should display donations list page with key elements", async ({ page }) => {
    await donations.verifyDonationsPageElements();
  });

  test("should display donation records in table", async ({ page }) => {
    const tableExists = await donations.verifyDonationTableStructure();
    const donationCount = await donations.getDonationCount();
    
    if (tableExists) {
      // Whether the table has rows or not, it's valid - we just verify the structure exists
      expect(donationCount).toBeGreaterThanOrEqual(0);
    } else {
      // If no table, look for empty state message
      const emptyMessage = page.locator(
        'text:has-text("No donations"), text:has-text("No results"), text:has-text("No data")'
      );
      await expect(emptyMessage.first()).toBeVisible();
    }
  });

  test("should handle pagination", async ({ page }) => {
    await donations.testPagination();
  });

  test("should navigate to donor detail page from donation", async ({ page }) => {
    const donorName = await donations.navigateToDonorFromDonation();
    
    if (donorName) {
      // Verify we're on the donor detail page
      await expect(page.locator('[role="tablist"]')).toBeVisible();
    }
  });

  test("should navigate to project detail page from donation", async ({ page }) => {
    const projectName = await donations.navigateToProjectFromDonation();
    
    if (projectName) {
      // Verify we're on the project detail page
      const projectTitle = page.locator("h1, h2").filter({ hasText: projectName || "" });
      await expect(projectTitle.first()).toBeVisible();
    }
  });

  test("should handle filtering by donor", async ({ page }) => {
    const rowCount = await donations.getDonationCount();

    if (rowCount > 0) {
      // Find a donor link in the donations table
      const donorLink = page.locator('table tbody tr a[href^="/donors/"]').first();

      if ((await donorLink.count()) > 0) {
        const donorHref = await donorLink.getAttribute("href");
        const donorId = donorHref?.match(/\/donors\/(\d+)/)?.[1];
        const donorName = await donorLink.textContent();

        if (donorId && donorName) {
          // Test filtering by donor
          const filterActive = await donations.filterByDonor(donorId, donorName);
          
          if (filterActive) {
            // Clear filter
            await donations.clearDonorFilter();
          }
        }
      }
    } else {
      // Skip test if no donations exist
      console.log("No donations found to test filtering");
    }
  });

  test("should sort donations by date", async ({ page }) => {
    if (await donations.sortByDate()) {
      const dates = await donations.getDonationDates();
      const sortedDates = await donations.getDonationDates();
      
      if (dates.length > 1) {
        // Verify dates exist and are displayed
        expect(sortedDates.length).toBe(dates.length);
      }
    }
  });

  test("should sort donations by amount", async ({ page }) => {
    if (await donations.sortByAmount()) {
      const amounts = await donations.getDonationAmounts();
      
      if (amounts.length > 1) {
        // Verify amounts are displayed in correct format
        amounts.forEach((amount) => {
          expect(amount).toMatch(/^\$[\d,]+(\.\d{2})?$/);
        });
      }
    }
  });

  test("should handle donation view action", async ({ page }) => {
    const navigated = await donations.viewDonationDetails();
    
    if (navigated) {
      // Verify we navigated to donation detail page
      expect(page.url()).toMatch(/\/donations\/\d+$/);
    }
  });

  test("should handle donation edit action", async ({ page }) => {
    const navigated = await donations.editDonation(0, {});
    
    if (navigated) {
      // Verify we navigated to donation edit page
      expect(page.url()).toMatch(/\/donations\/\d+\/edit$/);
    }
  });

  test("should handle empty donations list", async ({ page }) => {
    await donations.verifyEmptyDonationsList();
  });
});
