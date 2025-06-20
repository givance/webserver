import { test, expect } from "@playwright/test";

test.describe("Donors CRUD Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to donors page
    await page.goto("/donors");
    await page.waitForLoadState("networkidle");
  });

  test("should display donors list page with key elements", async ({ page }) => {
    // Verify page title
    await expect(page.locator('h1:has-text("Donor Management")')).toBeVisible();

    // Verify search bar is present
    await expect(page.locator('input[placeholder="Search donors..."]')).toBeVisible();

    // Verify Add Donor button is present
    await expect(page.locator('a[href="/donors/add"] button:has-text("Add Donor")')).toBeVisible();

    // Verify table is present (even if empty)
    const tableOrEmptyState = page.locator('table, text:has-text("No donors found")');
    await expect(tableOrEmptyState.first()).toBeVisible();

    // Verify filter controls
    await expect(page.locator('label:has-text("List:")')).toBeVisible();
    await expect(page.locator('label:has-text("Assigned to:")')).toBeVisible();
    await expect(page.locator('input#only-researched')).toBeVisible();
  });

  test("should create a new donor", async ({ page }) => {
    // Click Add Donor button
    await page.click('a[href="/donors/add"] button:has-text("Add Donor")');
    await page.waitForLoadState("networkidle");

    // Verify we're on the add donor page
    await expect(page.locator('h1:has-text("Add New Donor")')).toBeVisible();

    // Fill in the form with test data
    const testDonor = {
      firstName: `Test${Date.now()}`,
      lastName: "Donor",
      email: `test${Date.now()}@example.com`,
      phone: "(555) 123-4567",
      address: "123 Test Street",
      city: "Test City",
      state: "NY",
      postalCode: "10001",
      country: "United States",
      notes: "This is a test donor created by e2e tests",
    };

    // Fill required fields
    await page.fill('input[placeholder="John"]', testDonor.firstName);
    await page.fill('input[placeholder="Doe"]', testDonor.lastName);
    await page.fill('input[placeholder="john.doe@example.com"]', testDonor.email);

    // Fill optional fields
    await page.fill('input[placeholder="(555) 123-4567"]', testDonor.phone);
    await page.fill('input[placeholder="123 Main St"]', testDonor.address);
    await page.fill('input[placeholder="New York"]', testDonor.city);
    await page.fill('input[placeholder="NY"]', testDonor.state);
    await page.fill('input[placeholder="10001"]', testDonor.postalCode);
    await page.fill('input[placeholder="United States"]', testDonor.country);

    // Fill notes
    await page.fill('textarea[placeholder*="Additional information"]', testDonor.notes);

    // Select gender
    await page.click('button:has-text("Select gender")');
    await page.click('div[role="option"]:has-text("Male")');

    // Submit the form
    await page.click('button:has-text("Create Donor")');

    // Wait for navigation back to donors list
    await page.waitForURL("**/donors");
    await page.waitForLoadState("networkidle");

    // Verify the donor was created by searching for them
    await page.fill('input[placeholder="Search donors..."]', testDonor.email);
    await page.waitForTimeout(500); // Wait for debounced search

    // Verify the donor appears in the list
    const donorRow = page.locator(`tr:has-text("${testDonor.firstName}")`);
    await expect(donorRow).toBeVisible();
    await expect(donorRow.locator(`text="${testDonor.email}"`)).toBeVisible();
  });

  test("should view donor details", async ({ page }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    
    // Check if there are any donor rows in the table
    const tableRows = page.locator("table tbody tr");
    const rowCount = await tableRows.count();
    
    if (rowCount === 0) {
      // If no donors exist, create one
      await test.step("Create a donor for viewing", async () => {
        await page.click('a[href="/donors/add"] button');
        await page.waitForURL("**/donors/add");
        
        await page.fill('input[placeholder="John"]', "ViewTest");
        await page.fill('input[placeholder="Doe"]', "Donor");
        await page.fill('input[placeholder="john.doe@example.com"]', `view${Date.now()}@example.com`);
        await page.click('button:has-text("Create Donor")');
        
        await page.waitForURL("**/donors");
        await page.waitForTimeout(2000);
      });
    }

    // Find and click the first donor link
    const donorLink = page.locator("table tbody tr a[href*='/donors/']").first();
    await expect(donorLink).toBeVisible({ timeout: 10000 });
    
    // Get the donor name before clicking
    const donorName = await donorLink.textContent();
    await donorLink.click();

    // Wait for navigation to donor detail page
    await page.waitForURL(/\/donors\/\d+$/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Verify we're on the donor detail page by checking for tabs
    const tabsList = page.locator('[role="tablist"]');
    await expect(tabsList).toBeVisible({ timeout: 10000 });
    
    // Verify all expected tabs are present
    await expect(page.locator('button[role="tab"]:has-text("Overview")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Donations")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Communications")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Research")')).toBeVisible();

    // Verify some content is visible
    await expect(page.locator('h3').first()).toBeVisible();
    
    // Verify the page has loaded some donor information
    const pageContent = page.locator('main, [role="main"], .container').first();
    await expect(pageContent).toBeVisible();
  });

  test("should edit donor information", async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    
    // Check if there are any donors
    const tableRows = page.locator("table tbody tr");
    const rowCount = await tableRows.count();
    
    if (rowCount === 0) {
      // Create a donor if none exist
      await test.step("Create a donor for editing", async () => {
        await page.click('a[href="/donors/add"] button');
        await page.waitForURL("**/donors/add");
        
        await page.fill('input[placeholder="John"]', "EditTest");
        await page.fill('input[placeholder="Doe"]', "Donor");
        await page.fill('input[placeholder="john.doe@example.com"]', `edit${Date.now()}@example.com`);
        await page.fill('input[placeholder="(555) 123-4567"]', "(555) 111-2222");
        await page.fill('textarea[placeholder*="Additional information"]', "Initial notes");
        await page.click('button:has-text("Create Donor")');
        
        await page.waitForURL("**/donors");
        await page.waitForTimeout(2000);
      });
    }

    // Navigate to first donor's detail page
    const donorLink = page.locator("table tbody tr a[href*='/donors/']").first();
    await donorLink.click();
    
    await page.waitForURL(/\/donors\/\d+$/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Test editing notes
    const notesSection = page.locator('div:has(h3:text("Notes"))');
    await expect(notesSection).toBeVisible({ timeout: 10000 });
    
    // Click Edit button for notes
    const editNotesButton = notesSection.locator('button:has-text("Edit")');
    await editNotesButton.click();
    
    // Update notes
    const notesTextarea = notesSection.locator('textarea');
    await expect(notesTextarea).toBeVisible();
    await notesTextarea.clear();
    await notesTextarea.fill("Updated notes from e2e test - " + new Date().toISOString());
    
    // Save notes
    const saveButton = notesSection.locator('button:has-text("Save")');
    await saveButton.click();
    
    // Wait for save to complete
    await page.waitForTimeout(1000);
    
    // Verify notes were updated - the textarea should be hidden and the text should be visible
    await expect(notesTextarea).not.toBeVisible();
    await expect(notesSection).toContainText("Updated notes from e2e test");

    // Test inline editing for email
    // Find email field by looking for the Mail icon
    const emailContainer = page.locator('div').filter({ 
      has: page.locator('svg[class*="lucide-mail"], svg[class*="mail"]') 
    }).first();
    
    if (await emailContainer.isVisible()) {
      // Hover over the email field
      await emailContainer.hover();
      await page.waitForTimeout(500);
      
      // Try to find and click an edit button or the field itself
      const emailField = emailContainer.locator('span, p, div').filter({ hasText: /@/ }).first();
      if (await emailField.isVisible()) {
        await emailField.click();
        await page.waitForTimeout(500);
        
        // Look for input field that appears
        const emailInput = page.locator('input[type="email"], input[type="text"]').filter({ hasText: /@/ });
        if (await emailInput.count() > 0) {
          const newEmail = `updated${Date.now()}@example.com`;
          await emailInput.clear();
          await emailInput.fill(newEmail);
          await emailInput.press("Enter");
          
          // Wait for update
          await page.waitForTimeout(1000);
          
          // Verify email was updated
          await expect(emailContainer).toContainText(newEmail);
        }
      }
    }
  });

  test("should search and filter donors", async ({ page }) => {
    // Test search functionality
    await page.fill('input[placeholder="Search donors..."]', "test");
    await page.waitForTimeout(1000); // Wait for debounced search

    // Verify search is working (either shows results or empty state)
    const tableBody = page.locator("table tbody");
    await expect(tableBody).toBeVisible();
    
    // Clear search
    await page.fill('input[placeholder="Search donors..."]', "");
    await page.waitForTimeout(1000);

    // Test filter by list - click the Select trigger instead of button
    const listFilterTrigger = page.locator('[id="list-filter"]').or(page.locator('button:has-text("All Lists")')).first();
    await listFilterTrigger.click();
    await page.waitForTimeout(500);
    
    // Look for "Not in any list" option
    const notInAnyListOption = page.locator('[role="option"]:has-text("Not in any list")');
    if (await notInAnyListOption.count() > 0) {
      await notInAnyListOption.click();
      await page.waitForTimeout(1000);
      
      // Reset by selecting "All Lists"
      await listFilterTrigger.click();
      await page.locator('[role="option"]:has-text("All Lists")').click();
      await page.waitForTimeout(500);
    }

    // Test filter by assigned staff
    const staffFilterTrigger = page.locator('[id="staff-filter"]').or(page.locator('button:has-text("All Staff")')).first();
    await staffFilterTrigger.click();
    await page.waitForTimeout(500);
    
    const unassignedOption = page.locator('[role="option"]:has-text("Unassigned")');
    if (await unassignedOption.count() > 0) {
      await unassignedOption.click();
      await page.waitForTimeout(1000);
      
      // Reset by selecting "All Staff"
      await staffFilterTrigger.click();
      await page.locator('[role="option"]:has-text("All Staff")').click();
      await page.waitForTimeout(500);
    }

    // Test "Show only researched donors" checkbox
    const researchedCheckbox = page.locator('input#only-researched');
    await researchedCheckbox.check();
    await page.waitForTimeout(1000);
    
    // Uncheck to reset
    await researchedCheckbox.uncheck();
    await page.waitForTimeout(500);
  });

  test("should handle bulk operations", async ({ page }) => {
    // Wait for page to load completely
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    
    // Check if there are any donors in the list
    const tableRows = page.locator("table tbody tr");
    let rowCount = await tableRows.count();
    
    // If no donors exist, create some
    if (rowCount === 0) {
      await test.step("Create donors for bulk operations", async () => {
        for (let i = 0; i < 3; i++) {
          await page.click('a[href="/donors/add"] button');
          await page.waitForURL("**/donors/add");
          
          await page.fill('input[placeholder="John"]', `BulkTest${i}`);
          await page.fill('input[placeholder="Doe"]', "Donor");
          await page.fill('input[placeholder="john.doe@example.com"]', `bulk${i}-${Date.now()}@example.com`);
          await page.click('button:has-text("Create Donor")');
          
          await page.waitForURL("**/donors");
          await page.waitForTimeout(1000);
        }
      });
      
      // Update row count after creating donors
      rowCount = await tableRows.count();
    }
    
    // Now perform bulk operations
    if (rowCount > 0) {
      // Click Select All Matching button
      const selectAllButton = page.locator('button:has-text("Select All Matching")');
      await expect(selectAllButton).toBeVisible();
      await selectAllButton.click();
      await page.waitForTimeout(1000);
      
      // Verify selection indicator appears
      const selectionIndicator = page.locator('span').filter({ hasText: /\d+ donors? selected/ });
      await expect(selectionIndicator).toBeVisible({ timeout: 5000 });
      
      // Look for "Create List from Selected" button
      const createListButton = page.locator('button').filter({ hasText: /Create List from Selected/ });
      await expect(createListButton).toBeVisible({ timeout: 5000 });
      
      // Click to create a list
      await createListButton.click();
      
      // Wait for dialog to appear
      const dialog = page.locator('div[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      
      // Fill in list name
      const listNameInput = dialog.locator('input#list-name');
      await expect(listNameInput).toBeVisible();
      const timestamp = Date.now();
      const listName = `Test List ${timestamp}`;
      await listNameInput.fill(listName);
      
      // Find and click the Create List button in the dialog
      const createButton = dialog.locator('button:has-text("Create List")').last();
      await createButton.click();
      
      // Wait for success message - use a more flexible pattern
      const successToast = page.locator('div').filter({ hasText: /Created list.*with \d+ donors?/ });
      await expect(successToast).toBeVisible({ timeout: 10000 });
      
      // Wait for dialog to close
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
      
      // Deselect all
      const deselectButton = page.locator('button:has-text("Deselect All")');
      if (await deselectButton.isVisible()) {
        await deselectButton.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test("should delete a donor", async ({ page }) => {
    // First create a donor to delete
    await test.step("Create a donor to delete", async () => {
      await page.click('a[href="/donors/add"] button:has-text("Add Donor")');
      const timestamp = Date.now();
      await page.fill('input[placeholder="John"]', `DeleteTest${timestamp}`);
      await page.fill('input[placeholder="Doe"]', "Donor");
      await page.fill('input[placeholder="john.doe@example.com"]', `delete${timestamp}@example.com`);
      await page.click('button:has-text("Create Donor")');
      await page.waitForURL("**/donors");
      
      // Search for the newly created donor
      await page.fill('input[placeholder="Search donors..."]', `delete${timestamp}@example.com`);
      await page.waitForTimeout(500);
    });

    // Find the delete button in the donor row
    const donorRow = page.locator("table tbody tr").first();
    const deleteButton = donorRow.locator('button[aria-label*="Delete"], button:has(svg.lucide-trash)');
    
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      
      // Confirm deletion in the dialog
      const confirmButton = page.locator('button:has-text("Delete")').filter({ hasText: /^Delete$/ });
      await confirmButton.click();
      
      // Wait for deletion to complete
      await page.waitForTimeout(1000);
      
      // Verify donor is no longer in the list
      await expect(donorRow).not.toBeVisible();
    }
  });

  test("should handle form validation errors", async ({ page }) => {
    // Navigate to add donor page
    await page.click('a[href="/donors/add"] button:has-text("Add Donor")');
    await page.waitForLoadState("networkidle");

    // Try to submit empty form
    await page.click('button:has-text("Create Donor")');

    // Verify validation errors appear
    await expect(page.locator('text="First name must be at least 2 characters"')).toBeVisible();
    await expect(page.locator('text="Last name must be at least 2 characters"')).toBeVisible();
    await expect(page.locator('text="Invalid email address"')).toBeVisible();

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