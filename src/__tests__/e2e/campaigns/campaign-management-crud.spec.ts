import { test, expect } from "@playwright/test";
import { cleanupBetweenTests } from "../setup/test-cleanup";
import { createTestCampaign, generateTestName } from "../utils/test-data-factory";
import {
  navigateToCampaigns,
  navigateToCampaignCreation,
  selectDonors,
  setCampaignName,
  selectTemplate,
  writeInstructions,
  generateEmails,
  verifyEmailGeneration,
  findCampaignRow,
  findEditButton,
  findViewButton,
  handleConfirmDialog,
  saveCampaignToDrafts,
  retryCampaign,
  deleteCampaign,
  clickNextButton,
  clickContinueButton,
  verifyCampaignStatus,
  waitForCampaignData,
  verifyCampaignStatistics,
  continueWithoutTemplate,
} from "./helper";

test.describe("Campaign CRUD Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Start from the main page to access campaign functionality
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // Wait for auth state to stabilize
  });

  test.afterEach(async () => {
    // Clean up test data after each test
    await cleanupBetweenTests();
  });

  test("should display existing campaigns list", async ({ page }) => {
    // Navigate to existing campaigns
    await navigateToCampaigns(page);

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
    await navigateToCampaignCreation(page);

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
      await selectDonors(page, 2);

      // Click Next and wait for navigation
      await clickNextButton(page);
    });

    // Step 2: Campaign Name
    await test.step("Set campaign name", async () => {
      // Fill campaign name
      const testCampaign = createTestCampaign();
      await setCampaignName(page, testCampaign.name);

      // Verify summary card shows donor count
      await expect(page.locator("text=/\\d+ donor/i").first()).toBeVisible({ timeout: 3000 });

      // Click Continue and wait for transition
      await clickContinueButton(page);
    });

    // Step 3: Select Template
    await test.step("Select email template", async () => {
      // Wait for template page to load
      await page.waitForTimeout(2000);
      
      // Click Continue to skip template selection
      const continueButton = page.locator('button:has-text("Continue")');
      await expect(continueButton).toBeVisible({ timeout: 5000 });
      await continueButton.click();
      
      // Wait for navigation
      await page.waitForTimeout(3000);
    });

    // Step 4: Write Instructions
    await test.step("Write instructions and generate preview", async () => {
      // Check if we're on the Write Instructions step
      const chatTab = page.locator('button[role="tab"]:has-text("Chat & Generate")');
      const instructionTextarea = page.locator('textarea[placeholder*="instruction"], textarea[placeholder*="Enter your instructions"]');
      
      // Wait for either the chat tab or instruction textarea to be visible
      try {
        await expect(chatTab.or(instructionTextarea).first()).toBeVisible({ timeout: 10000 });
      } catch (e) {
        console.log("Could not find instruction step indicators, checking current URL:", page.url());
        throw new Error("Failed to navigate to Write Instructions step");
      }
      
      await writeInstructions(
        page,
        "Write a brief thank you email to each donor for their support. Keep it personal and warm."
      );

      // Generate preview emails
      await generateEmails(page);

      // Verify email generation succeeded
      await verifyEmailGeneration(page);
    });
  });

  test("should edit an existing campaign", async ({ page }) => {
    // First, navigate to existing campaigns
    await navigateToCampaigns(page);

    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Check if there are any campaigns to edit
    const campaignRows = page.locator("table tbody tr");
    const rowCount = await campaignRows.count();

    if (rowCount === 0) {
      throw new Error("No campaigns found for editing test - application should have existing campaigns");
    }

    // Find a campaign that can be edited - prefer Ready to Send status
    let editableRow = null;
    for (let i = 0; i < rowCount; i++) {
      const row = campaignRows.nth(i);
      const statusBadge = row.locator('[class*="badge"], span').filter({ hasText: /Ready to Send|Draft/i });
      
      if ((await statusBadge.count()) > 0) {
        editableRow = row;
        // Check if this row has any clickable actions
        const actionsCell = row.locator('td').last();
        const clickableElements = actionsCell.locator('button, a[href*="/edit/"], svg').filter({ hasNotText: 'View' });
        
        if ((await clickableElements.count()) > 0) {
          // Found a row with editable actions
          break;
        }
      }
    }

    if (!editableRow) {
      throw new Error("No editable campaigns found - need at least one campaign with edit capability");
    }

    // Try different ways to navigate to edit page
    const campaignName = await editableRow.locator('td').first().textContent();
    console.log(`Found editable campaign: ${campaignName}`);
    
    // Option 1: Click on campaign name (might be a link)
    const nameLink = editableRow.locator('td').first().locator('a');
    if ((await nameLink.count()) > 0) {
      await nameLink.click();
    } else {
      // Option 2: Find any edit action in the row
      const actionsCell = editableRow.locator('td').last();
      const editLink = actionsCell.locator('a[href*="/edit/"]').first();
      const editButton = actionsCell.locator('button').first();
      
      if ((await editLink.count()) > 0) {
        await editLink.click();
      } else if ((await editButton.count()) > 0) {
        await editButton.click();
      } else {
        // Option 3: Click on row itself if it's clickable
        await editableRow.click();
      }
    }

    // Should navigate to edit page
    await page.waitForURL(/\/campaign\/edit\/\d+/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // for the page to load

    // Verify we're in edit mode and add new instructions
    await writeInstructions(page, "Also mention our upcoming events.");

    // Generate updated emails
    await generateEmails(page);

    // Verify generation options are available
    const generateButtons = page.locator(
      'button:has-text("Generate More"), button:has-text("Generate"), button:has-text("Start Bulk Generation")'
    );
    await expect(generateButtons.first()).toBeVisible({ timeout: 30000 });
  });

  test("should view campaign results and details", async ({ page }) => {
    // Navigate to existing campaigns
    await navigateToCampaigns(page);

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
    const viewButton = await findViewButton(page, viewableRow);
    await viewButton.click();

    // Should navigate to campaign view page
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 10000 });

    // Wait for campaign data to load
    await waitForCampaignData(page);

    // Verify summary information is displayed - be more flexible about structure
    const summaryElements = page.locator(
      'div:has-text("Total Donors"), div:has-text("Emails Generated"), div:has-text("Created"), div:has-text("Status")'
    );

    // At least some summary information should be visible
    let foundSummary = false;
    const summaryCount = await summaryElements.count();

    for (let i = 0; i < summaryCount; i++) {
      const element = summaryElements.nth(i);
      if (await element.isVisible().catch(() => false)) {
        foundSummary = true;
        break;
      }
    }

    if (!foundSummary) {
      // If no specific summary elements, just verify the page has content
      const hasContent = await page.locator("body").textContent();
      expect(hasContent).toBeTruthy();
      console.log("Campaign detail page loaded with content");
    } else {
      console.log("Found campaign summary information");
    }

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

    // Verify Recipients count and matching Pending emails
    const recipientsText = page.locator("text=/Recipients \\(\\d+\\)/i");
    await expect(recipientsText).toBeVisible();

    // Extract the number of recipients from the text
    const recipientsTextContent = await recipientsText.textContent();
    const recipientsMatch = recipientsTextContent?.match(/Recipients \((\d+)\)/i);
    expect(recipientsMatch).toBeTruthy();

    const recipientsCount = parseInt(recipientsMatch![1]);
    expect(recipientsCount).toBeGreaterThan(0);

    // Count the number of "Pending" emails
    const pendingEmails = page.locator("text=/Pending/i");
    const pendingCount = await pendingEmails.count();

    // Verify the number of pending emails matches the number of recipients
    expect(pendingCount).toBe(recipientsCount);
  });

  test("should handle campaign status changes", async ({ page }) => {
    // Navigate to existing campaigns
    await navigateToCampaigns(page);

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

  // test("should save generated emails to drafts", async ({ page }) => {
  //   // Navigate to existing campaigns
  //   await navigateToCampaigns(page);

  //   // Wait for table to load
  //   await page.waitForSelector("table tbody tr", { timeout: 10000 });

  //   // Find a campaign with "Ready to Send" status
  //   const campaignRows = page.locator("table tbody tr");
  //   let targetRow = null;

  //   for (let i = 0; i < (await campaignRows.count()); i++) {
  //     const row = campaignRows.nth(i);
  //     const saveButton = row.locator('button:has-text("Save to Drafts")');

  //     if ((await saveButton.count()) > 0) {
  //       // Check if the button is enabled
  //       const isDisabled = await saveButton.getAttribute("disabled");
  //       if (isDisabled === null) {
  //         targetRow = row;
  //         break;
  //       }
  //     }
  //   }

  //   if (!targetRow) {
  //     throw new Error("No campaigns found with enabled Save to Drafts buttons for saving to drafts test");
  //   }

  //   // Save campaign to drafts
  //   await saveCampaignToDrafts(page, targetRow);
  // });

  // test("should retry failed campaign generation", async ({ page }) => {
  //   // Navigate to existing campaigns
  //   await navigateToCampaigns(page);

  //   // Wait for table to load
  //   await page.waitForSelector("table tbody tr", { timeout: 10000 });

  //   // Find a campaign with "Failed" or "Pending" status that can be retried
  //   const campaignRows = page.locator("table tbody tr");
  //   let retryableRow = null;

  //   for (let i = 0; i < (await campaignRows.count()); i++) {
  //     const row = campaignRows.nth(i);
  //     // Check if retry button exists for any campaign (buttons might exist conditionally)
  //     const retryBtn = row.locator('button:has-text("Retry")');
  //     if ((await retryBtn.count()) > 0) {
  //       retryableRow = row;
  //       break;
  //     }
  //   }

  //   if (!retryableRow) {
  //     throw new Error("No campaigns found with retry buttons available");
  //   }

  //   // Get initial status from the status cell
  //   const initialStatusCell = retryableRow.locator("td").nth(2); // Status is typically the 3rd column
  //   const initialStatus = await initialStatusCell.textContent();

  //   // Retry the campaign
  //   await retryCampaign(page, retryableRow);

  //   // Wait for status change
  //   await page.waitForTimeout(1000);

  //   // Check if status changed
  //   const newStatusCell = retryableRow.locator("td").nth(2); // Status is typically the 3rd column
  //   const newStatus = await newStatusCell.textContent();

  //   // Status should be a valid processing status (it might not change immediately)
  //   expect(newStatus).toMatch(/Pending|In Progress|Generating|Processing/i);
  // });

  test("should delete a campaign", async ({ page }) => {
    // Navigate to existing campaigns to find a deletable campaign
    await navigateToCampaigns(page);

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

    // Delete the campaign
    await deleteCampaign(page, deleteRow);
  });

  test("should search and paginate campaigns", async ({ page }) => {
    // Navigate to existing campaigns
    await navigateToCampaigns(page);

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
