import { test, expect } from "@playwright/test";
import { cleanupBetweenTests } from "../setup/test-cleanup";
import { createTestDonor, generateTestEmail, generateTestName } from "../utils/test-data-factory";
import { DonorsHelper } from "../helpers/donors";

test.describe("Donors CRUD Operations", () => {
  let donors: DonorsHelper;

  test.beforeEach(async ({ page }) => {
    donors = new DonorsHelper(page);
    await donors.navigateToDonorsPage();
  });

  test.afterEach(async () => {
    // Clean up test data after each test
    await cleanupBetweenTests();
  });

  test("should display donors list page with key elements", async ({ page }) => {
    await donors.verifyDonorsPageElements();
  });

  test("should create a new donor", async ({ page }) => {
    const testDonor = createTestDonor();
    
    await donors.createDonor({
      firstName: testDonor.firstName,
      lastName: testDonor.lastName,
      email: testDonor.email,
      phone: testDonor.phone,
      address: testDonor.address,
      city: testDonor.city,
      state: testDonor.state,
      postalCode: testDonor.postalCode,
      country: testDonor.country,
      notes: testDonor.notes,
      gender: "Male"
    });

    // Verify the donor was created
    const found = await donors.findDonor(testDonor.email);
    expect(found).toBe(true);
  });

  test("should view donor details", async ({ page }) => {
    // Always create a fresh test donor for this test to ensure predictable state
    await test.step("Create a donor for viewing", async () => {
      const testDonor = createTestDonor("view");
      await donors.createDonor({
        firstName: testDonor.firstName,
        lastName: testDonor.lastName,
        email: testDonor.email
      });
    });

    // View the first donor's details
    const donorName = await donors.viewDonorDetails();
    
    // Verify donor detail elements
    await donors.verifyDonorDetailElements();
    
    // Verify we're on the correct page
    await expect(page.url()).toMatch(/\/donors\/\d+$/);
    
    // Verify donor name is displayed
    if (donorName) {
      const pageTitle = page.locator("h1").first();
      const titleText = await pageTitle.textContent();
      if (titleText) {
        expect(titleText.toLowerCase()).toContain(donorName.split(" ")[0].toLowerCase());
      }
    }
  });

  test("should edit donor information", async ({ page }) => {
    // Always create a fresh test donor for editing to ensure predictable state
    await test.step("Create a donor for editing", async () => {
      const testDonor = createTestDonor("edit");
      await donors.createDonor({
        firstName: testDonor.firstName,
        lastName: testDonor.lastName,
        email: testDonor.email,
        phone: "(555) 111-2222",
        notes: "Initial notes"
      });
    });

    // Navigate to the donor's detail page
    await donors.viewDonorDetails();

    // Test editing notes
    const updatedNotes = "Updated notes from e2e test - " + new Date().toISOString();
    await donors.editDonorNotes(updatedNotes);

    // Test inline editing for phone
    const phoneUpdated = await donors.editDonorPhone("(555) 987-6543");
    if (!phoneUpdated) {
      console.log("Phone inline edit not available, skipping");
    }
  });

  test("should search and filter donors", async ({ page }) => {
    // Test search functionality
    await donors.searchDonors("test");
    
    // Verify search is working
    const tableBody = page.locator("table tbody");
    await expect(tableBody).toBeVisible();

    // Clear search
    await donors.clearDonorSearch();

    // Test filter by list
    await donors.filterByList("Not in any list");
    await donors.filterByList("All Lists");

    // Test filter by assigned staff
    await donors.filterByStaff("Unassigned");
    await donors.filterByStaff("All Staff");

    // Test "Show only researched donors" checkbox
    await donors.toggleResearchedOnly(true);
    await donors.toggleResearchedOnly(false);
  });

  test("should handle bulk operations", async ({ page }) => {
    // Check if there are any donors in the list
    let rowCount = await donors.getDonorCount();

    // If no donors exist, create some
    if (rowCount === 0) {
      await test.step("Create donors for bulk operations", async () => {
        for (let i = 0; i < 3; i++) {
          await donors.createDonor({
            firstName: `BulkTest${i}`,
            lastName: "Donor",
            email: generateTestEmail(`bulk${i}`)
          });
        }
      });

      // Update row count after creating donors
      rowCount = await donors.getDonorCount();
    }

    // Now perform bulk operations
    if (rowCount > 0) {
      // Select first 2-3 donors
      const selectedCount = await donors.selectDonors(3);
      
      if (selectedCount > 0) {
        // Create list from selected donors
        const timestamp = Date.now();
        const listName = `Test List ${timestamp}`;
        await donors.createListFromSelected(listName);
      }
    }
  });

  test("should delete a donor", async ({ page }) => {
    // First create a donor to delete
    const timestamp = Date.now();
    const deleteEmail = `delete${timestamp}@example.com`;
    
    await test.step("Create a donor to delete", async () => {
      await donors.createDonor({
        firstName: `DeleteTest${timestamp}`,
        lastName: "Donor",
        email: deleteEmail
      });
    });

    // Delete the donor
    const deleted = await donors.deleteDonor(deleteEmail);
    expect(deleted).toBe(true);
  });

  test("should handle form validation errors", async ({ page }) => {
    await donors.navigateToAddDonor();
    
    // Test form validation
    await donors.verifyFormValidationErrors();

    // Test invalid email format
    await page.fill('input[placeholder="John"]', "Test");
    await page.fill('input[placeholder="Doe"]', "User");
    await page.fill('input[placeholder="john.doe@example.com"]', "invalid-email");
    await page.click('button:has-text("Create Donor")');

    // Verify email validation error
    await expect(page.locator('text="Invalid email address"')).toBeVisible();

    // Fix the email and verify form can be submitted
    await page.fill('input[placeholder="john.doe@example.com"]', "valid@example.com");
    await page.click('button:has-text("Create Donor")');

    // Should navigate away from the form
    await expect(page).toHaveURL(/\/donors$/);
  });
});
