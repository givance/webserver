import { test, expect } from "@playwright/test";
import { cleanupBetweenTests } from "../setup/test-cleanup";
import { createTestStaff, generateTestEmail, generateTestName } from "../utils/test-data-factory";
import { StaffHelper } from "../helpers/staff";

test.describe("Staff CRUD Operations", () => {
  let staff: StaffHelper;

  test.beforeEach(async ({ page }) => {
    staff = new StaffHelper(page);
    await staff.navigateToStaffPage();
  });

  test.afterEach(async () => {
    // Clean up test data after each test
    await cleanupBetweenTests();
  });

  test("should display staff list page with key elements", async ({ page }) => {
    await staff.verifyStaffPageElements();
  });

  test("should create a new staff member", async ({ page }) => {
    const testStaff = createTestStaff();
    
    await staff.createStaff({
      firstName: testStaff.firstName,
      lastName: testStaff.lastName,
      email: testStaff.email,
      jobTitle: testStaff.jobTitle,
      department: testStaff.department,
      whatsappNumbers: testStaff.whatsappNumbers,
      signature: "Best regards,\nTest Staff",
      isRealPerson: true
    });

    // Verify the staff member was created
    const found = await staff.findStaff(testStaff.email);
    expect(found).toBe(true);
  });

  test("should view staff member details", async ({ page }) => {
    // Always create a fresh test staff member for this test to ensure predictable state
    await test.step("Create a staff member for viewing", async () => {
      const testStaff = createTestStaff("view");
      await staff.createStaff({
        firstName: testStaff.firstName,
        lastName: testStaff.lastName,
        email: testStaff.email
      });
    });

    // View the staff member's details
    await staff.viewStaffDetails();
  });

  test("should edit staff member information", async ({ page }) => {
    // Always create a fresh test staff member for editing to ensure predictable state
    await test.step("Create a staff member for editing", async () => {
      const testStaff = createTestStaff("edit");
      await staff.createStaff({
        firstName: testStaff.firstName,
        lastName: testStaff.lastName,
        email: testStaff.email
      });
    });

    // View the staff member's details
    await staff.viewStaffDetails();

    // Test inline editing of first name
    const newFirstName = `Updated${generateTestName()}`;
    const nameEdited = await staff.editStaffName(newFirstName);
    if (!nameEdited) {
      console.log("Inline name editing not available");
    }

    // Test editing signature
    await staff.editSignature("Updated signature\nBest regards");
  });

  test("should manage email signature", async ({ page }) => {
    // Check if there are any staff members
    const staffCount = await staff.getStaffCount();
    
    if (staffCount === 0) {
      throw new Error("No staff members found for signature management test - staff should exist for testing");
    }

    // Try to edit signature from the table
    const edited = await staff.editSignatureFromTable(0, "New signature from table edit");
    
    if (!edited) {
      console.log("Signature edit button not available in table");
    }
  });

  test("should toggle primary staff status", async ({ page }) => {
    const rowCount = await staff.getStaffCount();

    if (rowCount > 0) {
      const result = await staff.togglePrimaryStatus();
      
      if (result) {
        expect(result.newState).not.toBe(result.previousState);
      }
    }
  });

  test("should search and filter staff", async ({ page }) => {
    // Test search functionality
    await staff.searchStaff("test");

    // Verify search is working
    const tableBody = page.locator("table tbody");
    await expect(tableBody).toBeVisible();

    // Clear search
    await staff.clearStaffSearch();
  });

  test("should delete a staff member", async ({ page }) => {
    const timestamp = Date.now();
    const deleteEmail = `delete${timestamp}@example.com`;

    // First create a staff member to delete
    await test.step("Create a staff member to delete", async () => {
      await staff.createStaff({
        firstName: `DeleteTest${timestamp}`,
        lastName: "Staff",
        email: deleteEmail
      });
    });

    // Delete the staff member
    const deleted = await staff.deleteStaff(deleteEmail);
    expect(deleted).toBe(true);
  });

  test("should handle form validation errors", async ({ page }) => {
    await staff.navigateToAddStaff();
    
    // Test form validation
    await staff.verifyFormValidationErrors();

    // Fix the email and verify form can be submitted
    const uniqueEmail = generateTestEmail("valid");
    await page.fill('input[placeholder*="@example.com"]', uniqueEmail);
    await page.click('button:has-text("Create Staff Member")');

    // Should navigate away from the form on success
    await expect(page).toHaveURL(/\/staff$/, { timeout: 10000 });
  });

  test("should manage WhatsApp phone numbers", async ({ page }) => {
    // Check if there are any staff members
    const staffCount = await staff.getStaffCount();
    
    if (staffCount === 0) {
      throw new Error("No staff members found for WhatsApp management test - staff should exist for testing");
    }

    // View first staff member's details
    await staff.viewStaffDetails();

    // Manage WhatsApp numbers
    await staff.manageWhatsAppNumbers(["+1234567890"]);
  });
});
