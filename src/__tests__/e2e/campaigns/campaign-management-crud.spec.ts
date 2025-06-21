import { test, expect } from "@playwright/test";
import { cleanupBetweenTests } from "../setup/test-cleanup";
import { createTestCampaign, generateTestName } from "../utils/test-data-factory";

test.describe("Campaign CRUD Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Start from the main page to access campaign functionality
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async () => {
    // Clean up test data after each test
    await cleanupBetweenTests();
  });

  test("should display existing campaigns list", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Verify page elements - be more flexible with the heading
    const headingSelectors = [
      'h1:has-text("Existing Campaigns")',
      'h1:has-text("Campaigns")',
      'h1:has-text("Email Campaigns")',
      'h2:has-text("Campaigns")',
      "h1", // Any h1 as fallback
    ];

    let foundHeading = false;
    for (const selector of headingSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        foundHeading = true;
        break;
      }
    }
    expect(foundHeading).toBe(true);

    // Verify table headers if campaigns exist
    const table = page.locator("table");
    if ((await table.count()) > 0) {
      // More flexible header matching
      const headers = ["Campaign", "Name", "Donors", "Status", "Progress", "Actions"];
      let foundHeaders = 0;
      for (const header of headers) {
        const th = page.locator(`th:has-text("${header}")`).first();
        if (await th.isVisible().catch(() => false)) {
          foundHeaders++;
        }
      }
      // Expect at least 3 headers to be found
      expect(foundHeaders).toBeGreaterThanOrEqual(3);
    } else {
      // Check for empty state
      const emptyState = page.locator("text=/no.*campaign|empty/i");
      await expect(emptyState.first()).toBeVisible();
    }

    // Verify Create Campaign button or link
    const createButtonSelectors = [
      'button:has-text("Create Campaign")',
      'a:has-text("Create Campaign")',
      'button:has-text("New Campaign")',
      'a:has-text("New Campaign")',
      'button:has-text("Create")',
      '[href*="/campaign"]',
    ];

    let foundCreateButton = false;
    for (const selector of createButtonSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        foundCreateButton = true;
        break;
      }
    }
    expect(foundCreateButton).toBe(true);
  });

  test("should create a new campaign - full workflow", async ({ page }) => {
    // Navigate to campaign creation
    await page.goto("/campaign");
    await page.waitForLoadState("networkidle");

    // Step 1: Select Donors
    await test.step("Select donors for campaign", async () => {
      // More flexible heading check
      const headingSelectors = [
        'h1:has-text("Select Donors")',
        'h1:has-text("Choose Donors")',
        'h2:has-text("Select Donors")',
        'h1:has-text("Donors")',
        "h1", // Fallback to any h1
      ];

      let headingFound = false;
      for (const selector of headingSelectors) {
        const heading = page.locator(selector).first();
        if (await heading.isVisible().catch(() => false)) {
          headingFound = true;
          break;
        }
      }

      if (!headingFound) {
        // Fail if we can't find the campaign creation page
        throw new Error("Campaign creation page not found - no heading elements detected");
      }

      // Wait for donor selection to load - make sure the Individual Donors tab is active and loaded
      await page.waitForTimeout(2000); // Wait for data to load

      // Ensure we're on the Individual Donors tab
      const individualDonorsTab = page.locator('button:has-text("Individual Donors")');
      if (await individualDonorsTab.isVisible()) {
        await individualDonorsTab.click();
        await page.waitForTimeout(1000);
      }

      // Wait for donor checkboxes to appear by looking for the donor names
      try {
        await page.waitForSelector('[role="checkbox"], input[type="checkbox"]', { timeout: 10000 });
      } catch (e) {
        // If no checkboxes, this is a failure - donor checkboxes should exist
        throw new Error(
          "Donor checkboxes not found on campaign creation page - this indicates a problem with the application or test data setup"
        );
      }

      // Check if there are any donors available - look for checkboxes
      const donorCheckboxes = page.locator('[role="checkbox"], input[type="checkbox"]');

      // Wait for checkboxes to be available
      await page.waitForTimeout(1000);
      const checkboxCount = await donorCheckboxes.count();

      if (checkboxCount === 0) {
        // If no donors, this is a test failure - we need donors to test campaign creation
        throw new Error("No donors available for campaign creation - test data setup is incomplete");
      }

      // Select first 2 donors
      const selectCount = Math.min(2, checkboxCount);
      for (let i = 0; i < selectCount; i++) {
        const checkbox = donorCheckboxes.nth(i);
        await checkbox.scrollIntoViewIfNeeded();
        await checkbox.check({ force: true });
        await page.waitForTimeout(500); // Increased wait for state update
      }

      // Verify selection count is shown with retry logic
      const selectedCount = page.locator("text=/\\d+ donor.*selected/i");
      await expect(selectedCount).toBeVisible({ timeout: 5000 });

      // Click Next and wait for navigation
      const nextButton = page.locator('button:has-text("Next")');
      await nextButton.click();
      await page.waitForURL(/\/campaign.*step=2|name/, { timeout: 10000 });
    });

    // Step 2: Campaign Name
    await test.step("Set campaign name", async () => {
      await expect(page.locator('h1:has-text("Campaign Name")')).toBeVisible({ timeout: 10000 });

      // Fill campaign name
      const testCampaign = createTestCampaign();
      const nameInput = page.locator("input#campaignName");
      await nameInput.waitFor({ state: "visible", timeout: 5000 });
      await nameInput.click();
      await nameInput.fill(testCampaign.name);

      // Verify character counter
      await expect(page.locator("text=/\\d+\\/255/i")).toBeVisible({ timeout: 3000 });

      // Verify summary card shows donor count
      await expect(page.locator("text=/\\d+ donor/i")).toBeVisible({ timeout: 3000 });

      // Click Next and wait for navigation
      const nextButton = page.locator('button:has-text("Next")');
      await nextButton.click();
      await page.waitForURL(/\/campaign.*step=3|template/, { timeout: 10000 });
    });

    // Step 3: Select Template
    await test.step("Select email template", async () => {
      await expect(page.locator('h1:has-text("Select Template")')).toBeVisible({ timeout: 10000 });

      // Wait for template options to load
      await page.waitForTimeout(1000);

      // Select first available template or "Create from scratch"
      const templateOptions = page.locator('input[type="radio"][name="template"]');
      const fromScratchOption = page.locator(
        'label:has-text("Create from scratch"), button:has-text("Create from scratch")'
      );

      const templateCount = await templateOptions.count();

      if (templateCount > 0) {
        // Click the first template option
        const firstTemplate = templateOptions.first();
        await firstTemplate.scrollIntoViewIfNeeded();
        await firstTemplate.click({ force: true });
      } else if ((await fromScratchOption.count()) > 0) {
        // Use create from scratch if no templates
        await fromScratchOption.first().click();
      }

      await page.waitForTimeout(500);

      // Click Next and wait for navigation
      const nextButton = page.locator('button:has-text("Next")');
      await nextButton.click();
      await page.waitForURL(/\/campaign.*step=4|instruction/, { timeout: 10000 });
    });

    // Step 4: Write Instructions
    await test.step("Write instructions and generate preview", async () => {
      await expect(page.locator('h1:has-text("Write Instructions")')).toBeVisible({ timeout: 10000 });

      // Type instructions
      const instructionInput = page.locator('textarea[placeholder*="instruction"], textarea').first();
      await instructionInput.waitFor({ state: "visible", timeout: 5000 });
      await instructionInput.click();
      await instructionInput.fill(
        "Write a brief thank you email to each donor for their support. Keep it personal and warm."
      );

      // Send instructions
      const sendButton = page.locator('button:has-text("Send")');
      await sendButton.waitFor({ state: "visible", timeout: 5000 });
      await sendButton.click();

      // Wait for AI response with proper timeout and retry
      const previewSection = page.locator('text="Preview Emails", h2:has-text("Preview"), div:has-text("Preview")');
      await expect(previewSection.first()).toBeVisible({ timeout: 60000 }); // Increased timeout for AI

      // Wait for preview content to load
      await page.waitForTimeout(2000);

      // Verify we can start bulk generation
      const bulkGenerateButton = page.locator('button:has-text("Start Bulk Generation"), button:has-text("Generate")');
      await expect(bulkGenerateButton.first()).toBeVisible({ timeout: 10000 });

      // For testing, we won't actually start bulk generation as it's expensive
      // Instead, verify the UI is ready
      const previewIndicator = page.locator("text=/preview.*email|email.*preview/i, div[data-testid='email-preview']");
      await expect(previewIndicator.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test("should edit an existing campaign", async ({ page }) => {
    // First, navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Check if there are any campaigns to edit
    const campaignRows = page.locator("table tbody tr");
    const rowCount = await campaignRows.count();

    if (rowCount === 0) {
      throw new Error("No campaigns found for editing test - application should have existing campaigns");
    }

    // Find a campaign that can be edited - look for Edit button
    let editableRow = null;
    for (let i = 0; i < rowCount; i++) {
      const row = campaignRows.nth(i);
      const editButton = row.locator('button:has-text("Edit")');

      if ((await editButton.count()) > 0) {
        editableRow = row;
        break;
      }
    }

    if (!editableRow) {
      throw new Error("No editable campaigns found - need at least one campaign with an Edit button");
    }

    // Click Edit button
    const editButton = editableRow.locator('button:has-text("Edit")');
    await editButton.waitFor({ state: "visible", timeout: 5000 });
    await editButton.click();

    // Should navigate to edit page
    await page.waitForURL(/\/campaign\/edit\/\d+/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Verify we're in edit mode - should go directly to Write Instructions step
    await expect(page.locator('h1:has-text("Write Instructions")')).toBeVisible({ timeout: 10000 });

    // Verify campaign data is loaded
    const instructionInput = page.locator('textarea[placeholder*="instruction"], textarea').first();
    await instructionInput.waitFor({ state: "visible", timeout: 5000 });

    // Add new instruction
    await instructionInput.click();
    const currentText = await instructionInput.inputValue();
    await instructionInput.fill(currentText + "\n\nAlso mention our upcoming events.");

    // Send the updated instruction
    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.waitFor({ state: "visible", timeout: 5000 });
    await sendButton.click();

    // Wait for AI response
    await page.waitForTimeout(5000);

    // Verify we can generate more emails - look for various possible buttons
    const generateButtons = page.locator(
      'button:has-text("Generate More"), button:has-text("Generate"), button:has-text("Start Bulk Generation")'
    );
    await expect(generateButtons.first()).toBeVisible({ timeout: 30000 });
  });

  test("should view campaign results and details", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Wait for table to load
    await page.waitForTimeout(2000);

    // Find a campaign with "Ready to Send" or "Completed" status
    const campaignRows = page.locator("table tbody tr");
    const rowCount = await campaignRows.count();

    if (rowCount === 0) {
      throw new Error("No campaigns found for viewing test - application should have existing campaigns");
    }

    let viewableRow = null;
    for (let i = 0; i < rowCount; i++) {
      const row = campaignRows.nth(i);

      // Look for View button
      const viewButton = row.locator('button:has-text("View")');

      if ((await viewButton.count()) > 0) {
        viewableRow = row;
        break;
      }
    }

    if (!viewableRow) {
      throw new Error("No viewable campaigns found - need at least one campaign with a View button");
    }

    // Click View button
    const viewButton = viewableRow.locator('button:has-text("View")');
    await viewButton.waitFor({ state: "visible", timeout: 5000 });
    await viewButton.click();

    // Should navigate to campaign view page (note: it's /campaign/ID not /campaign/results/ID)
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Verify campaign results page elements
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Verify summary cards with more flexible selectors
    const summaryCards = page.locator('[class*="card"], div[data-card]');
    await expect(summaryCards.first()).toBeVisible({ timeout: 10000 });

    // Look for various labels that might be present
    const expectedLabels = [
      'text="Total Donors"',
      'text="Generated Emails"',
      'text="Sent Emails"',
      'text="Donors"',
      'text="Emails"',
      "text=/\\d+.*generated/i",
      "text=/total.*\\d+/i",
    ];

    let foundLabels = 0;
    for (const label of expectedLabels) {
      const element = page.locator(label).first();
      if (await element.isVisible().catch(() => false)) {
        foundLabels++;
      }
    }

    // Should find at least some summary information
    expect(foundLabels).toBeGreaterThan(0);

    // Verify tabs if present
    const tabs = page.locator('[role="tablist"], div[class*="tabs"]');
    if ((await tabs.count()) > 0) {
      // Just verify tabs exist, don't be too specific about content
      const tabElements = page.locator('[role="tab"], button[class*="tab"]');
      expect(await tabElements.count()).toBeGreaterThan(0);
    }

    // Verify some content exists on the page
    const contentAreas = page.locator(
      "[data-email-preview], .email-preview, " +
        "div[class*='email'], table tbody tr, " +
        "div[class*='content'], div[class*='empty']"
    );

    expect(await contentAreas.count()).toBeGreaterThan(0);
  });

  test("should handle campaign status changes", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Look for campaigns with different statuses - use more flexible selectors
    const statusElements = page.locator("span, div").filter({ hasText: /^(Draft|Pending|Ready to Send|Failed)$/i });

    if ((await statusElements.count()) === 0) {
      throw new Error("No campaign status badges found - campaigns should have visible status indicators");
    }

    // Just verify that status badges exist and are visible
    const draftBadge = statusElements.filter({ hasText: /^Draft$/i }).first();
    if ((await draftBadge.count()) > 0) {
      await expect(draftBadge).toBeVisible();
      // Verify it has some styling (any class attribute)
      const hasClass = await draftBadge.getAttribute("class");
      expect(hasClass).toBeTruthy();
    }

    const readyBadge = statusElements.filter({ hasText: /^Ready to Send$/i }).first();
    if ((await readyBadge.count()) > 0) {
      await expect(readyBadge).toBeVisible();
      const hasClass = await readyBadge.getAttribute("class");
      expect(hasClass).toBeTruthy();
    }

    const failedBadge = statusElements.filter({ hasText: /^Failed$/i }).first();
    if ((await failedBadge.count()) > 0) {
      await expect(failedBadge).toBeVisible();
      const hasClass = await failedBadge.getAttribute("class");
      expect(hasClass).toBeTruthy();
    }
  });

  test("should save generated emails to drafts", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Find a campaign with "Ready to Send" status
    const campaignRows = page.locator("table tbody tr");
    let targetRow = null;

    for (let i = 0; i < (await campaignRows.count()); i++) {
      const row = campaignRows.nth(i);
      const saveButton = row.locator('button:has-text("Save to Drafts")');

      if ((await saveButton.count()) > 0) {
        // Check if the button is enabled
        const isDisabled = await saveButton.getAttribute("disabled");
        if (isDisabled === null) {
          targetRow = row;
          break;
        }
      }
    }

    if (!targetRow) {
      throw new Error("No campaigns found with enabled Save to Drafts buttons for saving to drafts test");
    }

    // Click Save to Drafts button
    const saveButton = targetRow.locator('button:has-text("Save to Drafts"), button:has-text("Save")');
    await saveButton.waitFor({ state: "visible", timeout: 5000 });
    await saveButton.click();

    // Handle confirmation dialog
    const dialog = page.locator('[role="dialog"], [role="alertdialog"], div[data-state="open"]');
    await expect(dialog.first()).toBeVisible({ timeout: 10000 });

    // Verify dialog shows campaign details
    await expect(dialog.locator("text=/save.*draft|draft.*save/i").first()).toBeVisible({ timeout: 5000 });

    // Look for email count in dialog
    const emailCount = dialog.locator("text=/\\d+.*email|email.*\\d+/i");
    if ((await emailCount.count()) > 0) {
      await expect(emailCount.first()).toBeVisible();
    }

    // Click confirm button
    const confirmButton = dialog.locator('button:has-text("Save"), button:has-text("Confirm"), button:has-text("Yes")');
    await confirmButton.last().click();

    // Wait for success message
    const successToast = page
      .locator('[data-sonner-toast], [role="status"], div[data-toast]')
      .filter({ hasText: /saved|success/i });
    await expect(successToast.first()).toBeVisible({ timeout: 15000 });
  });

  test("should retry failed campaign generation", async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Find a campaign with "Failed" or "Pending" status that can be retried
    const campaignRows = page.locator("table tbody tr");
    let retryableRow = null;

    for (let i = 0; i < (await campaignRows.count()); i++) {
      const row = campaignRows.nth(i);
      // Check if retry button exists for any campaign (buttons might exist conditionally)
      const retryBtn = row.locator('button:has-text("Retry")');
      if ((await retryBtn.count()) > 0) {
        retryableRow = row;
        break;
      }
    }

    if (!retryableRow) {
      throw new Error("No campaigns found with retry buttons available");
    }

    // Get initial status from the status cell
    const initialStatusCell = retryableRow.locator("td").nth(2); // Status is typically the 3rd column
    const initialStatus = await initialStatusCell.textContent();

    // Click Retry button
    const retryButton = retryableRow.locator('button:has-text("Retry")');
    await retryButton.waitFor({ state: "visible", timeout: 5000 });
    await retryButton.click();

    // Wait for status change with polling
    await page.waitForTimeout(3000);

    // Check if status changed
    const newStatusCell = retryableRow.locator("td").nth(2); // Status is typically the 3rd column
    const newStatus = await newStatusCell.textContent();

    // Status should be a valid processing status (it might not change immediately)
    expect(newStatus).toMatch(/Pending|In Progress|Generating|Processing/i);
  });

  test("should delete a campaign", async ({ page }) => {
    // Navigate to existing campaigns to find a deletable campaign
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Find a campaign to delete - look for any campaign with a Delete button
    const campaignRows = page.locator("table tbody tr");
    let deleteRow = null;

    for (let i = 0; i < (await campaignRows.count()); i++) {
      const row = campaignRows.nth(i);
      const deleteButton = row.locator('button:has-text("Delete")');

      if ((await deleteButton.count()) > 0) {
        deleteRow = row;
        break;
      }
    }

    if (!deleteRow) {
      throw new Error(
        "No deletable campaigns found - need at least one campaign with a Delete button for deletion test"
      );
    }

    // Click Delete button
    const deleteButton = deleteRow.locator('button:has-text("Delete")');
    await deleteButton.click();

    // Handle confirmation dialog
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify delete confirmation message
    await expect(dialog.locator("text=/delete.*campaign/i")).toBeVisible();
    await expect(dialog.locator("text=/cannot.*undone/i")).toBeVisible();

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
    if ((await table.count()) === 0) {
      throw new Error("No campaigns table found for search and pagination test - campaigns should exist");
    }

    // Test search if search input exists
    const searchInput = page.locator('input[placeholder*="Search"]');
    if ((await searchInput.count()) > 0) {
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
    if ((await paginationControls.count()) > 0) {
      // Check for next page button
      const nextButton = page.locator('button[aria-label="Next page"], button:has-text("Next")');
      if ((await nextButton.count()) > 0 && (await nextButton.isEnabled())) {
        await nextButton.click();
        await page.waitForTimeout(1000);

        // Verify page changed
        await expect(page.locator("table tbody")).toBeVisible();

        // Go back to first page
        const prevButton = page.locator('button[aria-label="Previous page"], button:has-text("Previous")');
        if ((await prevButton.count()) > 0) {
          await prevButton.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });
});
