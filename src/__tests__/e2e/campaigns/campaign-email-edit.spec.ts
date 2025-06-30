import { test, expect } from "@playwright/test";
import {
  navigateToCampaigns,
  navigateToCampaignDetails,
  findViewButton,
  findEditButton,
  waitForCampaignData,
  selectDonorTab,
  editEmailInModal,
  waitForModalToClose,
} from "./helper";

// This test verifies that editing an email in the campaign detail page
// immediately reflects the changes without requiring a page refresh
test.describe("Campaign Email Editing", () => {
  test("should update email content immediately after saving changes", async ({ page }) => {
    // Navigate to existing campaigns page
    await navigateToCampaigns(page);

    // Find campaigns that have an action button (View, Results, Details, etc.)
    const rows = page.locator("tr");
    const rowCount = await rows.count();
    console.log(`Found ${rowCount} table rows`);

    let viewableRow = null;
    const actionSelectors = [
      'button:has-text("View")',
      'button:has-text("Results")',
      'button:has-text("Details")',
      'button:has-text("Open")',
      'a:has-text("View")',
      'a:has-text("Results")',
      'a:has-text("Details")',
    ];

    for (let i = 1; i < rowCount; i++) {
      const row = rows.nth(i);
      let hasActionButton = false;

      for (const selector of actionSelectors) {
        if ((await row.locator(selector).count()) > 0) {
          hasActionButton = true;
          console.log(`Found action button in row ${i} with selector: ${selector}`);
          break;
        }
      }

      if (hasActionButton) {
        viewableRow = row;
        break;
      }
    }

    if (!viewableRow) {
      // Log the content of available rows for debugging
      console.log("Available campaigns:");
      for (let i = 1; i < Math.min(rowCount, 5); i++) {
        const rowText = await rows.nth(i).textContent();
        console.log(`Row ${i}: ${rowText}`);
      }
      throw new Error("No campaigns with action buttons found. Please create a campaign with generated emails.");
    }

    // Click the View button
    const viewButton = await findViewButton(page, viewableRow);
    await viewButton.click();

    // Wait for navigation to campaign detail page (could be /campaign/{id} or /campaign/results/{id})
    await page.waitForURL(/\/campaign\/(results\/)?\w+/, { timeout: 15000 });

    // Wait for campaign data to load
    await waitForCampaignData(page);

    // First click on the "Email List" tab to show individual emails
    console.log("Looking for Email List tab...");

    // Try multiple strategies to click the Email List tab
    const tabSelectors = [
      'button[role="tab"]:has-text("Email List")',
      'text="Email List (2)"',
      '[data-state="inactive"]:has-text("Email List")',
      'button:has-text("Email List (2)")',
    ];

    let tabClicked = false;
    for (const selector of tabSelectors) {
      try {
        const tab = page.locator(selector);
        if (await tab.isVisible().catch(() => false)) {
          await tab.click();
          console.log(`Clicked Email List tab with selector: ${selector}`);
          tabClicked = true;
          break;
        }
      } catch (error) {
        console.log(`Failed to click with selector ${selector}: ${error}`);
      }
    }

    if (!tabClicked) {
      throw new Error("Could not click Email List tab with any selector");
    }

    // Wait for tab content to switch and be visible
    await page.waitForTimeout(1000);

    // Verify the Email List tab content is now visible
    // Use .first() to avoid strict mode violation with nested tabs
    const emailListContent = page.locator('[role="tabpanel"][data-state="active"]').first();
    await expect(emailListContent).toBeVisible({ timeout: 5000 });

    // Additional wait for content to fully load
    await page.waitForTimeout(2000);

    // Then select the first donor tab within the email list
    await selectDonorTab(page, 0);

    // Find and wait for Edit button
    const editButton = await findEditButton(page);
    await editButton.waitFor({ state: "visible", timeout: 10000 });
    await editButton.waitFor({ state: "attached" });

    // Get original content before editing (if possible)
    const emailContentSelectors = [
      '[data-testid="email-content"]',
      ".email-content",
      ".whitespace-pre-wrap",
      'div:has-text("Dear")',
      'div:has-text("Thank you")',
    ];

    let originalContent = "";
    for (const selector of emailContentSelectors) {
      try {
        const contentElement = page.locator(selector).first();
        if ((await contentElement.count()) > 0) {
          originalContent = (await contentElement.textContent()) || "";
          break;
        }
      } catch {
        continue;
      }
    }

    console.log("Original content preview:", originalContent.substring(0, 100));

    // Click the Edit button
    await editButton.click();

    // Edit the email content
    const testContent = `EDITED EMAIL CONTENT - Test ${Date.now()}

This email has been modified by the integration test to verify that changes appear immediately without page refresh.

Original content preview: ${originalContent.substring(0, 50)}...

This tests the cache invalidation fix in the updateEmail mutation.`;

    await editEmailInModal(page, testContent);
    await waitForModalToClose(page);

    // Wait a moment for React to process the update
    await page.waitForTimeout(1000);

    // This is the critical test - verify content updated immediately
    console.log("Checking if content updated immediately without page refresh...");

    // The key test - verify content updated immediately
    const bodyText = await page.locator("body").textContent();

    // Check that the content was actually updated
    const hasEditedContent = bodyText?.includes("EDITED EMAIL CONTENT");
    const hasTestTimestamp = bodyText?.includes("Test ");
    const hasIntegrationText = bodyText?.includes("integration test");

    if (hasEditedContent && hasTestTimestamp) {
      console.log("✅ SUCCESS: Email content updated immediately after save!");
      console.log('✅ Found "EDITED EMAIL CONTENT" in page content');
      console.log("✅ Found test timestamp in page content");

      if (hasIntegrationText) {
        console.log('✅ Found "integration test" text in page content');
      }
    } else {
      console.log("❌ FAILED: Updated content not found immediately");
      console.log("Current page contains EDITED EMAIL CONTENT:", hasEditedContent);
      console.log("Current page contains test timestamp:", hasTestTimestamp);
      console.log("Current page contains integration test text:", hasIntegrationText);

      throw new Error(`Email content did not update immediately after save. Expected edited content not found.`);
    }

    console.log("✅ Integration test PASSED: Email edit functionality works immediately!");
  });

  test("should persist email changes after page refresh", async ({ page }) => {
    test.setTimeout(60000); // Increase timeout to 60 seconds
    // Navigate to existing campaigns page
    await navigateToCampaigns(page);

    // Find campaigns that have an action button (View, Results, Details, etc.)
    const rows = page.locator("tr");
    const rowCount = await rows.count();
    console.log(`Found ${rowCount} table rows`);

    let viewableRow = null;
    const actionSelectors = [
      'button:has-text("View")',
      'button:has-text("Results")',
      'button:has-text("Details")',
      'button:has-text("Open")',
      'a:has-text("View")',
      'a:has-text("Results")',
      'a:has-text("Details")',
    ];

    for (let i = 1; i < rowCount; i++) {
      const row = rows.nth(i);
      let hasActionButton = false;

      for (const selector of actionSelectors) {
        if ((await row.locator(selector).count()) > 0) {
          hasActionButton = true;
          console.log(`Found action button in row ${i} with selector: ${selector}`);
          break;
        }
      }

      if (hasActionButton) {
        viewableRow = row;
        break;
      }
    }

    if (!viewableRow) {
      // Log the content of available rows for debugging
      console.log("Available campaigns:");
      for (let i = 1; i < Math.min(rowCount, 5); i++) {
        const rowText = await rows.nth(i).textContent();
        console.log(`Row ${i}: ${rowText}`);
      }
      throw new Error("No campaigns with action buttons found. Please create a campaign with generated emails.");
    }

    // Click the View button
    const viewButton = await findViewButton(page, viewableRow);
    await viewButton.click();

    // Wait for campaign detail page
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 15000 });
    await waitForCampaignData(page);

    // First click on the "Email List" tab to show individual emails
    const emailListTabSelectors = [
      'button[role="tab"]:has-text("Email List")',
      'button:has-text("Email List")',
      '[role="tab"]:has-text("Email List")',
      'button:has-text("Email List (2)")',
    ];

    let emailListTab = null;
    for (const selector of emailListTabSelectors) {
      const tab = page.locator(selector);
      if (await tab.isVisible().catch(() => false)) {
        emailListTab = tab;
        break;
      }
    }

    if (!emailListTab) {
      throw new Error("Email List tab not found");
    }

    await emailListTab.click();

    // Wait for tab content to switch and be visible
    await page.waitForTimeout(1000);

    // Verify the Email List tab content is now visible
    // Use .first() to avoid strict mode violation with nested tabs
    const emailListContent = page.locator('[role="tabpanel"][data-state="active"]').first();
    await expect(emailListContent).toBeVisible({ timeout: 5000 });

    // Additional wait for content to fully load
    await page.waitForTimeout(2000);

    // Then click first donor tab within the email list
    await selectDonorTab(page, 0);

    // Click Edit button
    const editButton = await findEditButton(page);
    await editButton.click();

    // Edit and save content
    const persistContent = `PERSISTENT TEST CONTENT - ${Date.now()}

This content should persist after page refresh, proving the database was actually updated.`;

    await editEmailInModal(page, persistContent);
    await waitForModalToClose(page);

    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // After refresh, we need to navigate back to the Email List tab and then the donor
    console.log("After refresh, clicking Email List tab again...");

    // First check if we need to click the Email List tab
    const emailListTabAfterRefresh = page
      .locator('button[role="tab"]:has-text("Email List"), button:has-text("Email List")')
      .first();
    if (await emailListTabAfterRefresh.isVisible().catch(() => false)) {
      await emailListTabAfterRefresh.click();
      await page.waitForTimeout(1000);

      // Wait for the tab content to be visible after clicking
      const emailListContent = page.locator('[role="tabpanel"][data-state="active"]').first();
      await expect(emailListContent).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // Then select the first donor tab again
      await selectDonorTab(page, 0);
      await page.waitForTimeout(2000);
    } else {
      console.log("Email List tab not found, assuming we're already on the right page");
      // Try to select donor tab directly
      await selectDonorTab(page, 0);
      await page.waitForTimeout(2000);
    }

    // Verify content persisted after refresh - try multiple strategies
    try {
      // Strategy 1: Look for the specific text content
      const persistedContent = page.locator(`text="PERSISTENT TEST CONTENT"`);
      await expect(persistedContent).toBeVisible({ timeout: 5000 });
      console.log("✅ SUCCESS: Email changes persisted after page refresh (found via text content)!");
    } catch (error1) {
      try {
        // Strategy 2: Check within the tab panel content
        const tabPanel = page.locator('[role="tabpanel"]').first();
        await expect(tabPanel).toContainText("PERSISTENT TEST CONTENT", { timeout: 5000 });
        console.log("✅ SUCCESS: Email changes persisted after page refresh (found in tab panel)!");
      } catch (error2) {
        try {
          // Strategy 3: Check for the content anywhere on the page
          await expect(page.locator("body")).toContainText("PERSISTENT TEST CONTENT", { timeout: 5000 });
          console.log("✅ SUCCESS: Email changes persisted after page refresh (found anywhere on page)!");
        } catch (error3) {
          // Strategy 4: More lenient check - just verify the content exists in DOM
          const hasContent = await page.locator("body").textContent();
          if (hasContent && hasContent.includes("PERSISTENT TEST CONTENT")) {
            console.log("✅ SUCCESS: Email changes persisted after page refresh (found in DOM)!");
          } else {
            console.log("❌ Current page content:", hasContent?.substring(0, 500));
            throw new Error("Content was not persisted after page refresh. The persistent test content was not found.");
          }
        }
      }
    }
  });
});
