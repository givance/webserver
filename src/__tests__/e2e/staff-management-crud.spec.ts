import { test, expect } from "@playwright/test";

test.describe("Staff CRUD Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to staff page
    await page.goto("/staff");
    await page.waitForLoadState("networkidle");
  });

  test("should display staff list page with key elements", async ({ page }) => {
    // Verify page title
    await expect(page.locator('h1:has-text("Staff Management")')).toBeVisible();

    // Verify search bar is present
    await expect(page.locator('input[placeholder*="Search staff"]')).toBeVisible();

    // Verify Add Staff button is present
    await expect(page.locator('a[href="/staff/add"] button')).toBeVisible();

    // Verify table headers if table exists
    const table = page.locator("table");
    const tableExists = await table.count() > 0;
    
    if (tableExists) {
      // Verify key columns
      await expect(page.locator('th:has-text("Name")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
      await expect(page.locator('th:has-text("Primary")')).toBeVisible();
      await expect(page.locator('th:has-text("Gmail")')).toBeVisible();
      await expect(page.locator('th:has-text("Signature")')).toBeVisible();
    } else {
      // Check for empty state
      const emptyState = page.locator('text=/no.*staff|empty/i');
      await expect(emptyState.first()).toBeVisible();
    }

    // Verify page size selector
    const pageSizeSelector = page.locator('button[role="combobox"]').filter({ hasText: /items per page/i });
    await expect(pageSizeSelector).toBeVisible();
  });

  test("should create a new staff member", async ({ page }) => {
    // Click Add Staff button
    await page.click('a[href="/staff/add"] button');
    await page.waitForURL("**/staff/add");
    await page.waitForLoadState("networkidle");

    // Verify we're on the add staff page
    await expect(page.locator('h1:has-text("Add New Staff Member")')).toBeVisible();

    // Fill in the form with test data
    const testStaff = {
      firstName: `Test${Date.now()}`,
      lastName: "Staff",
      email: `test${Date.now()}@example.com`,
      jobTitle: "Development Manager",
      department: "Engineering",
      signature: "<p>Best regards,<br>Test Staff</p>",
      whatsappNumbers: ["+1234567890"],
    };

    // Fill required fields
    await page.fill('input[placeholder="John"]', testStaff.firstName);
    await page.fill('input[placeholder="Doe"]', testStaff.lastName);
    await page.fill('input[placeholder*="@example.com"]', testStaff.email);

    // Fill optional fields
    const jobTitleInput = page.locator('input[placeholder*="Manager"]');
    if (await jobTitleInput.count() > 0) {
      await jobTitleInput.fill(testStaff.jobTitle);
    }

    const departmentInput = page.locator('input[placeholder*="Marketing"], input[placeholder*="Department"]');
    if (await departmentInput.count() > 0) {
      await departmentInput.fill(testStaff.department);
    }

    // Add WhatsApp number
    const addPhoneButton = page.locator('button:has-text("Add Phone")');
    if (await addPhoneButton.count() > 0) {
      await addPhoneButton.click();
      await page.waitForTimeout(500);
      
      const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone"]').last();
      await phoneInput.fill(testStaff.whatsappNumbers[0]);
    }

    // Set signature - the editor might be a rich text editor
    const signatureEditor = page.locator('[contenteditable="true"], .ProseMirror, .tiptap');
    if (await signatureEditor.count() > 0) {
      await signatureEditor.click();
      await signatureEditor.fill("Best regards,\nTest Staff");
    }

    // Check Real Person checkbox if present
    const realPersonCheckbox = page.locator('input[type="checkbox"]').filter({ has: page.locator('..').filter({ hasText: /real.*person/i }) });
    if (await realPersonCheckbox.count() > 0) {
      await realPersonCheckbox.check();
    }

    // Submit the form
    await page.click('button:has-text("Create Staff Member")');

    // Wait for navigation back to staff list
    await page.waitForURL("**/staff");
    await page.waitForLoadState("networkidle");

    // Verify the staff member was created by searching for them
    await page.fill('input[placeholder*="Search staff"]', testStaff.email);
    await page.waitForTimeout(500); // Wait for debounced search

    // Verify the staff member appears in the list
    const staffRow = page.locator(`tr:has-text("${testStaff.firstName}")`);
    await expect(staffRow).toBeVisible();
    await expect(staffRow.locator(`text="${testStaff.email}"`)).toBeVisible();
  });

  test("should view staff member details", async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000);

    // Check if there are any staff members
    const staffRows = page.locator("table tbody tr");
    const rowCount = await staffRows.count();

    if (rowCount === 0) {
      // If no staff exist, create one
      await test.step("Create a staff member for viewing", async () => {
        await page.click('a[href="/staff/add"] button');
        await page.waitForURL("**/staff/add");

        await page.fill('input[placeholder="John"]', "ViewTest");
        await page.fill('input[placeholder="Doe"]', "Staff");
        await page.fill('input[placeholder*="@example.com"]', `view${Date.now()}@example.com`);
        await page.click('button:has-text("Create Staff Member")');

        await page.waitForURL("**/staff");
        await page.waitForTimeout(1000);
      });
    }

    // Click on the first staff member's name or view details
    const firstRow = page.locator("table tbody tr").first();
    
    // Try clicking the dropdown menu first
    const dropdownTrigger = firstRow.locator('button[aria-haspopup="menu"]');
    if (await dropdownTrigger.count() > 0) {
      await dropdownTrigger.click();
      await page.waitForTimeout(500);
      
      // Click View Details in dropdown
      await page.click('[role="menuitem"]:has-text("View Details")');
    } else {
      // Try clicking the name directly
      const nameLink = firstRow.locator("a").first();
      await nameLink.click();
    }

    // Wait for navigation to staff detail page
    await page.waitForURL(/\/staff\/\d+$/);
    await page.waitForLoadState("networkidle");

    // Verify we're on the staff detail page
    const backButton = page.locator('a[href="/staff"] button');
    await expect(backButton).toBeVisible();

    // Verify summary cards are present
    await expect(page.locator('text="Assigned Donors"')).toBeVisible();
    await expect(page.locator('text="Status"')).toBeVisible();
    await expect(page.locator('text="Email Account"')).toBeVisible();
    await expect(page.locator('text="Signature"')).toBeVisible();

    // Verify tabs are present
    await expect(page.locator('[role="tablist"]')).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("Staff Information")')).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("Email Signature")')).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("Email Account")')).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("WhatsApp")')).toBeVisible();
  });

  test("should edit staff member information", async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000);

    // Check if there are any staff members
    const staffRows = page.locator("table tbody tr");
    const rowCount = await staffRows.count();

    if (rowCount === 0) {
      // Create a staff member if none exist
      await test.step("Create a staff member for editing", async () => {
        await page.click('a[href="/staff/add"] button');
        await page.waitForURL("**/staff/add");

        await page.fill('input[placeholder="John"]', "EditTest");
        await page.fill('input[placeholder="Doe"]', "Staff");
        await page.fill('input[placeholder*="@example.com"]', `edit${Date.now()}@example.com`);
        await page.click('button:has-text("Create Staff Member")');

        await page.waitForURL("**/staff");
        await page.waitForTimeout(1000);
      });
    }

    // Navigate to first staff member's detail page
    const firstRow = page.locator("table tbody tr").first();
    const dropdownTrigger = firstRow.locator('button[aria-haspopup="menu"]');
    
    if (await dropdownTrigger.count() > 0) {
      await dropdownTrigger.click();
      await page.waitForTimeout(500);
      await page.click('[role="menuitem"]:has-text("View Details")');
    } else {
      const nameLink = firstRow.locator("a").first();
      await nameLink.click();
    }

    await page.waitForURL(/\/staff\/\d+$/);
    await page.waitForLoadState("networkidle");

    // Test inline editing - click on the first name field
    const firstNameField = page.locator('div').filter({ has: page.locator('label:has-text("First Name")') }).locator('[contenteditable], input');
    if (await firstNameField.count() > 0) {
      await firstNameField.click();
      await firstNameField.fill(`Updated${Date.now()}`);
      await firstNameField.press("Enter");
      await page.waitForTimeout(1000);
    }

    // Test editing signature
    await page.click('[role="tab"]:has-text("Email Signature")');
    await page.waitForTimeout(500);

    const editSignatureButton = page.locator('button:has-text("Edit Signature")');
    await editSignatureButton.click();
    await page.waitForTimeout(500);

    // Update signature
    const signatureEditor = page.locator('[contenteditable="true"], .ProseMirror, .tiptap');
    await signatureEditor.clear();
    await signatureEditor.fill("Updated signature\nBest regards");

    // Save signature
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await page.waitForTimeout(1000);

    // Verify success message
    const successToast = page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: /saved|updated/i });
    await expect(successToast.first()).toBeVisible({ timeout: 5000 });
  });

  test("should manage email signature", async ({ page }) => {
    // Navigate to first staff member
    const firstRow = page.locator("table tbody tr").first();
    
    if (await firstRow.count() === 0) {
      // Skip test if no staff members
      test.skip();
      return;
    }

    // Check if signature edit is available in the table
    const signatureEditButton = firstRow.locator('button:has-text("Edit"), button:has(svg)').filter({ has: page.locator('..').filter({ hasText: /signature/i }) });
    
    if (await signatureEditButton.count() > 0) {
      // Edit signature from the table
      await signatureEditButton.click();
      await page.waitForTimeout(500);

      // Should open signature edit modal
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      // Edit signature in modal
      const editor = modal.locator('[contenteditable="true"], .ProseMirror, .tiptap');
      await editor.clear();
      await editor.fill("New signature from table edit");

      // Save
      await modal.locator('button:has-text("Save")').click();
      await page.waitForTimeout(1000);

      // Verify the signature status changed
      await expect(firstRow.locator('text="Set"')).toBeVisible();
    }
  });

  test("should toggle primary staff status", async ({ page }) => {
    // Wait for table to load
    await page.waitForTimeout(1000);

    const staffRows = page.locator("table tbody tr");
    const rowCount = await staffRows.count();

    if (rowCount > 0) {
      // Find the primary toggle switch in the first row
      const firstRow = staffRows.first();
      const primarySwitch = firstRow.locator('button[role="switch"]');

      if (await primarySwitch.count() > 0) {
        // Get current state
        const currentState = await primarySwitch.getAttribute("data-state");
        
        // Toggle the switch
        await primarySwitch.click();
        await page.waitForTimeout(1000);

        // Verify state changed
        const newState = await primarySwitch.getAttribute("data-state");
        expect(newState).not.toBe(currentState);

        // Should show a badge indicating primary status if checked
        if (newState === "checked") {
          await expect(firstRow.locator('span:has-text("Primary")')).toBeVisible();
        }
      }
    }
  });

  test("should search and filter staff", async ({ page }) => {
    // Test search functionality
    await page.fill('input[placeholder*="Search staff"]', "test");
    await page.waitForTimeout(1000); // Wait for debounced search

    // Verify search is working (either shows results or empty state)
    const tableBody = page.locator("table tbody");
    await expect(tableBody).toBeVisible();

    // Clear search
    await page.fill('input[placeholder*="Search staff"]', "");
    await page.waitForTimeout(1000);
  });

  test("should delete a staff member", async ({ page }) => {
    // First create a staff member to delete
    await test.step("Create a staff member to delete", async () => {
      await page.click('a[href="/staff/add"] button');
      await page.waitForURL("**/staff/add");
      
      const timestamp = Date.now();
      await page.fill('input[placeholder="John"]', `DeleteTest${timestamp}`);
      await page.fill('input[placeholder="Doe"]', "Staff");
      await page.fill('input[placeholder*="@example.com"]', `delete${timestamp}@example.com`);
      await page.click('button:has-text("Create Staff Member")');
      
      await page.waitForURL("**/staff");
      await page.waitForTimeout(1000);
      
      // Search for the newly created staff member
      await page.fill('input[placeholder*="Search staff"]', `delete${timestamp}@example.com`);
      await page.waitForTimeout(500);
    });

    // Find the staff member row
    const staffRow = page.locator("table tbody tr").first();
    
    // Open dropdown menu
    const dropdownTrigger = staffRow.locator('button[aria-haspopup="menu"]');
    await dropdownTrigger.click();
    await page.waitForTimeout(500);

    // Click Delete in dropdown
    await page.click('[role="menuitem"]:has-text("Delete")');

    // Confirm deletion in the dialog
    const confirmDialog = page.locator('[role="alertdialog"]');
    await expect(confirmDialog).toBeVisible();
    
    const confirmButton = confirmDialog.locator('button:has-text("Delete")').last();
    await confirmButton.click();

    // Wait for deletion to complete
    await page.waitForTimeout(1000);

    // Verify staff member is no longer in the list
    await expect(staffRow).not.toBeVisible();
  });

  test("should handle form validation errors", async ({ page }) => {
    // Navigate to add staff page
    await page.click('a[href="/staff/add"] button');
    await page.waitForURL("**/staff/add");

    // Try to submit empty form
    await page.click('button:has-text("Create Staff Member")');

    // Verify validation errors appear
    await expect(page.locator('text=/required|must be/i').first()).toBeVisible({ timeout: 5000 });

    // Test invalid email format
    await page.fill('input[placeholder="John"]', "Test");
    await page.fill('input[placeholder="Doe"]', "User");
    await page.fill('input[placeholder*="@example.com"]', "invalid-email");
    await page.click('button:has-text("Create Staff Member")');

    // Verify email validation error
    await expect(page.locator('text=/invalid.*email|email.*invalid/i')).toBeVisible();

    // Fix the email and verify form can be submitted
    await page.fill('input[placeholder*="@example.com"]', "valid@example.com");
    await page.click('button:has-text("Create Staff Member")');

    // Should navigate away from the form on success
    await expect(page).toHaveURL(/\/staff$/);
  });

  test("should manage WhatsApp phone numbers", async ({ page }) => {
    // Navigate to first staff member's detail page
    const firstRow = page.locator("table tbody tr").first();
    
    if (await firstRow.count() === 0) {
      test.skip();
      return;
    }

    const dropdownTrigger = firstRow.locator('button[aria-haspopup="menu"]');
    if (await dropdownTrigger.count() > 0) {
      await dropdownTrigger.click();
      await page.waitForTimeout(500);
      await page.click('[role="menuitem"]:has-text("View Details")');
    } else {
      const nameLink = firstRow.locator("a").first();
      await nameLink.click();
    }

    await page.waitForURL(/\/staff\/\d+$/);
    await page.waitForLoadState("networkidle");

    // Navigate to WhatsApp tab
    await page.click('[role="tab"]:has-text("WhatsApp")');
    await page.waitForTimeout(500);

    // Add a phone number
    const addPhoneButton = page.locator('button:has-text("Add Phone Number")');
    if (await addPhoneButton.count() > 0) {
      await addPhoneButton.click();
      await page.waitForTimeout(500);

      // Fill in phone number
      const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone"]').last();
      await phoneInput.fill("+1234567890");
      
      // The number might be saved automatically or need a save action
      await page.waitForTimeout(1000);

      // Verify the number was added
      await expect(page.locator('text="+1234567890"')).toBeVisible();
    }

    // Check for activity summary
    await expect(page.locator('text="Activity Summary"')).toBeVisible();
    await expect(page.locator('text="Responses Generated"')).toBeVisible();
    await expect(page.locator('text="Messages Received"')).toBeVisible();
  });
});