import { test, expect } from "@playwright/test";

test.describe("Campaign CRUD Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Start from the main page to access campaign functionality
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display existing campaigns list", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Verify page elements
    await expect(page.locator('h1:has-text("Existing Campaigns")')).toBeVisible();

    // Verify table headers if campaigns exist
    const table = page.locator("table");
    if (await table.count() > 0) {
      await expect(page.locator('th:has-text("Campaign Name")')).toBeVisible();
      await expect(page.locator('th:has-text("Donors")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
      await expect(page.locator('th:has-text("Progress")')).toBeVisible();
      await expect(page.locator('th:has-text("Actions")')).toBeVisible();
    } else {
      // Check for empty state
      const emptyState = page.locator('text=/no.*campaign|empty/i');
      await expect(emptyState.first()).toBeVisible();
    }

    // Verify Create Campaign button
    const createButton = page.locator('button:has-text("Create Campaign"), a:has-text("Create Campaign")');
    await expect(createButton.first()).toBeVisible();
  });

  test("should create a new campaign - full workflow", async ({ page }) => {
    // Navigate to campaign creation
    await page.goto("/campaign");
    await page.waitForLoadState("networkidle");

    // Step 1: Select Donors
    await test.step("Select donors for campaign", async () => {
      await expect(page.locator('h1:has-text("Select Donors")')).toBeVisible();

      // Check if there are any donors available
      const donorCheckboxes = page.locator('input[type="checkbox"][data-donor-id], table tbody tr input[type="checkbox"]');
      const checkboxCount = await donorCheckboxes.count();

      if (checkboxCount === 0) {
        // If no donors, we need to create some first
        test.skip();
        return;
      }

      // Select first 2 donors
      const selectCount = Math.min(2, checkboxCount);
      for (let i = 0; i < selectCount; i++) {
        await donorCheckboxes.nth(i).check();
        await page.waitForTimeout(200);
      }

      // Verify selection count is shown
      const selectedCount = page.locator('text=/\\d+ donor.*selected/i');
      await expect(selectedCount).toBeVisible();

      // Click Next
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);
    });

    // Step 2: Campaign Name
    await test.step("Set campaign name", async () => {
      await expect(page.locator('h1:has-text("Campaign Name")')).toBeVisible();

      // Fill campaign name
      const campaignName = `Test Campaign ${Date.now()}`;
      const nameInput = page.locator('input#campaignName');
      await nameInput.fill(campaignName);

      // Verify character counter
      await expect(page.locator('text=/\\d+\\/255/i')).toBeVisible();

      // Verify summary card shows donor count
      await expect(page.locator('text=/\\d+ donor/i')).toBeVisible();

      // Click Next
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);
    });

    // Step 3: Select Template
    await test.step("Select email template", async () => {
      await expect(page.locator('h1:has-text("Select Template")')).toBeVisible();

      // Select first available template or "Create from scratch"
      const templateOptions = page.locator('input[type="radio"][name="template"]');
      const templateCount = await templateOptions.count();

      if (templateCount > 0) {
        // Click the first template option
        await templateOptions.first().click();
      } else {
        // Use create from scratch if no templates
        const fromScratch = page.locator('text="Create from scratch"');
        await fromScratch.click();
      }

      // Click Next
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);
    });

    // Step 4: Write Instructions
    await test.step("Write instructions and generate preview", async () => {
      await expect(page.locator('h1:has-text("Write Instructions")')).toBeVisible();

      // Type instructions
      const instructionInput = page.locator('textarea[placeholder*="instruction"], textarea').first();
      await instructionInput.fill("Write a brief thank you email to each donor for their support. Keep it personal and warm.");

      // Send instructions
      const sendButton = page.locator('button:has-text("Send")');
      await sendButton.click();

      // Wait for AI response and preview emails
      await page.waitForTimeout(3000); // Wait for AI to generate preview

      // Check if preview emails are shown
      const previewSection = page.locator('text="Preview Emails"');
      await expect(previewSection).toBeVisible({ timeout: 30000 });

      // Verify we can start bulk generation
      const bulkGenerateButton = page.locator('button:has-text("Start Bulk Generation")');
      await expect(bulkGenerateButton).toBeVisible();

      // For testing, we won't actually start bulk generation as it's expensive
      // Instead, verify the UI is ready
      await expect(page.locator('text=/preview.*email/i')).toBeVisible();
    });
  });

  test("should edit an existing campaign", async ({ page }) => {
    // First, navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Check if there are any campaigns
    const campaignRows = page.locator("table tbody tr");
    const rowCount = await campaignRows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Find a campaign that can be edited (Draft, Completed, or Failed status)
    let editableRow = null;
    for (let i = 0; i < rowCount; i++) {
      const row = campaignRows.nth(i);
      const status = await row.locator('[class*="badge"]').textContent();
      
      if (status && ["Draft", "Completed", "Failed"].some(s => status.includes(s))) {
        editableRow = row;
        break;
      }
    }

    if (!editableRow) {
      test.skip();
      return;
    }

    // Click Edit button
    const editButton = editableRow.locator('button:has-text("Edit")');
    await editButton.click();

    // Should navigate to edit page
    await page.waitForURL(/\/campaign\/edit\/\d+/);
    await page.waitForLoadState("networkidle");

    // Verify we're in edit mode - should go directly to Write Instructions step
    await expect(page.locator('h1:has-text("Write Instructions")')).toBeVisible();

    // Verify campaign data is loaded
    const instructionInput = page.locator('textarea[placeholder*="instruction"], textarea').first();
    await expect(instructionInput).toBeVisible();

    // Add new instruction
    const currentText = await instructionInput.inputValue();
    await instructionInput.fill(currentText + "\n\nAlso mention our upcoming events.");

    // Send the updated instruction
    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // Wait for response
    await page.waitForTimeout(3000);

    // Verify we can generate more emails
    const generateMoreButton = page.locator('button:has-text("Generate More")');
    await expect(generateMoreButton).toBeVisible();
  });

  test("should view campaign results and details", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Find a campaign with "Ready to Send" or "Completed" status
    const campaignRows = page.locator("table tbody tr");
    const rowCount = await campaignRows.count();

    if (rowCount === 0) {
      test.skip();
      return;
    }

    let viewableRow = null;
    for (let i = 0; i < rowCount; i++) {
      const row = campaignRows.nth(i);
      const status = await row.locator('[class*="badge"]').textContent();
      
      if (status && ["Ready to Send", "Completed", "In Progress"].some(s => status.includes(s))) {
        viewableRow = row;
        break;
      }
    }

    if (!viewableRow) {
      test.skip();
      return;
    }

    // Click View button
    const viewButton = viewableRow.locator('button:has-text("View")');
    await viewButton.click();

    // Should navigate to results page
    await page.waitForURL(/\/campaign\/results\/\w+/);
    await page.waitForLoadState("networkidle");

    // Verify campaign results page elements
    await expect(page.locator('h1').first()).toBeVisible();

    // Verify summary cards
    await expect(page.locator('text="Total Donors"')).toBeVisible();
    await expect(page.locator('text="Generated Emails"')).toBeVisible();
    await expect(page.locator('text="Sent Emails"')).toBeVisible();

    // Verify tabs
    const tabs = page.locator('[role="tablist"]');
    if (await tabs.count() > 0) {
      await expect(page.locator('[role="tab"]:has-text("Emails")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Chat History")')).toBeVisible();
    }

    // Verify email list or empty state
    const emailList = page.locator('[data-email-preview], .email-preview');
    const emptyState = page.locator('text=/no.*email|empty/i');
    
    const hasEmails = await emailList.count() > 0;
    const isEmpty = await emptyState.count() > 0;
    
    expect(hasEmails || isEmpty).toBeTruthy();
  });

  test("should handle campaign status changes", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Look for campaigns with different statuses
    const statusBadges = page.locator('[class*="badge"]').filter({ hasText: /Draft|Pending|Ready to Send|Failed/i });
    
    if (await statusBadges.count() === 0) {
      test.skip();
      return;
    }

    // Verify status badge styling
    const draftBadge = statusBadges.filter({ hasText: "Draft" }).first();
    if (await draftBadge.count() > 0) {
      await expect(draftBadge).toHaveClass(/secondary|gray/);
    }

    const readyBadge = statusBadges.filter({ hasText: "Ready to Send" }).first();
    if (await readyBadge.count() > 0) {
      await expect(readyBadge).toHaveClass(/success|green/);
    }

    const failedBadge = statusBadges.filter({ hasText: "Failed" }).first();
    if (await failedBadge.count() > 0) {
      await expect(failedBadge).toHaveClass(/destructive|error|red/);
    }
  });

  test("should save generated emails to drafts", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Find a campaign with "Ready to Send" status
    const campaignRows = page.locator("table tbody tr");
    let targetRow = null;

    for (let i = 0; i < await campaignRows.count(); i++) {
      const row = campaignRows.nth(i);
      const status = await row.locator('[class*="badge"]').textContent();
      
      if (status && status.includes("Ready to Send")) {
        targetRow = row;
        break;
      }
    }

    if (!targetRow) {
      test.skip();
      return;
    }

    // Click Save to Drafts button
    const saveButton = targetRow.locator('button:has-text("Save to Drafts")');
    await saveButton.click();

    // Handle confirmation dialog
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify dialog shows campaign details
    await expect(dialog.locator('text=/save.*draft/i')).toBeVisible();
    await expect(dialog.locator('text=/\\d+.*email/i')).toBeVisible();

    // Click confirm button
    const confirmButton = dialog.locator('button:has-text("Save"), button:has-text("Confirm")').last();
    await confirmButton.click();

    // Wait for success message
    const successToast = page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: /saved|success/i });
    await expect(successToast.first()).toBeVisible({ timeout: 10000 });
  });

  test("should retry failed campaign generation", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Find a campaign with "Failed" status
    const campaignRows = page.locator("table tbody tr");
    let failedRow = null;

    for (let i = 0; i < await campaignRows.count(); i++) {
      const row = campaignRows.nth(i);
      const status = await row.locator('[class*="badge"]').textContent();
      
      if (status && status.includes("Failed")) {
        failedRow = row;
        break;
      }
    }

    if (!failedRow) {
      // No failed campaigns to retry
      test.skip();
      return;
    }

    // Click Retry button
    const retryButton = failedRow.locator('button:has-text("Retry")');
    await retryButton.click();

    // Verify status changes to Pending or In Progress
    await page.waitForTimeout(2000);
    
    const newStatus = await failedRow.locator('[class*="badge"]').textContent();
    expect(newStatus).toMatch(/Pending|In Progress|Generating/i);
  });

  test("should delete a campaign", async ({ page }) => {
    // First create a draft campaign that we can safely delete
    await page.goto("/campaign");
    await page.waitForLoadState("networkidle");

    // Quick campaign creation for deletion test
    const donorCheckboxes = page.locator('input[type="checkbox"][data-donor-id], table tbody tr input[type="checkbox"]');
    if (await donorCheckboxes.count() > 0) {
      await donorCheckboxes.first().check();
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Set campaign name
      await page.fill('input#campaignName', `Delete Test ${Date.now()}`);
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(500);

      // Skip template and instructions - just save as draft
      // Navigate back to campaigns list
      await page.goto("/existing-campaigns");
      await page.waitForLoadState("networkidle");
    }

    // Find a campaign to delete (preferably Draft status)
    const campaignRows = page.locator("table tbody tr");
    let deleteRow = null;

    for (let i = 0; i < await campaignRows.count(); i++) {
      const row = campaignRows.nth(i);
      const status = await row.locator('[class*="badge"]').textContent();
      const name = await row.locator("td").first().textContent();
      
      if (status && status.includes("Draft") && name && name.includes("Delete Test")) {
        deleteRow = row;
        break;
      }
    }

    if (!deleteRow) {
      // Try any draft campaign
      for (let i = 0; i < await campaignRows.count(); i++) {
        const row = campaignRows.nth(i);
        const status = await row.locator('[class*="badge"]').textContent();
        
        if (status && status.includes("Draft")) {
          deleteRow = row;
          break;
        }
      }
    }

    if (!deleteRow) {
      test.skip();
      return;
    }

    // Click Delete button
    const deleteButton = deleteRow.locator('button:has-text("Delete")');
    await deleteButton.click();

    // Handle confirmation dialog
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify delete confirmation message
    await expect(dialog.locator('text=/delete.*campaign/i')).toBeVisible();
    await expect(dialog.locator('text=/cannot.*undone/i')).toBeVisible();

    // Click confirm delete
    const confirmButton = dialog.locator('button:has-text("Delete")').last();
    await confirmButton.click();

    // Wait for deletion
    await page.waitForTimeout(2000);

    // Verify campaign is removed from list
    await expect(deleteRow).not.toBeVisible();
  });

  test("should search and paginate campaigns", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Check if there are campaigns
    const table = page.locator("table");
    if (await table.count() === 0) {
      test.skip();
      return;
    }

    // Test search if search input exists
    const searchInput = page.locator('input[placeholder*="Search"]');
    if (await searchInput.count() > 0) {
      await searchInput.fill("test");
      await page.waitForTimeout(1000); // Wait for search

      // Verify table updates or shows no results
      const tableBody = page.locator("table tbody");
      await expect(tableBody).toBeVisible();

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(1000);
    }

    // Test pagination if available
    const paginationControls = page.locator('[aria-label*="pagination"], [class*="pagination"]');
    if (await paginationControls.count() > 0) {
      // Check for next page button
      const nextButton = page.locator('button[aria-label="Next page"], button:has-text("Next")');
      if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForTimeout(1000);

        // Verify page changed
        await expect(page.locator("table tbody")).toBeVisible();

        // Go back to first page
        const prevButton = page.locator('button[aria-label="Previous page"], button:has-text("Previous")');
        if (await prevButton.count() > 0) {
          await prevButton.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });
});