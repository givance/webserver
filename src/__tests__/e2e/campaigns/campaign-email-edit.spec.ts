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

    // Find campaigns that have a View button
    const rows = page.locator("tr");
    const rowCount = await rows.count();

    let viewableRow = null;
    for (let i = 1; i < rowCount; i++) {
      const row = rows.nth(i);
      const hasViewButton = (await row.locator('button:has-text("View")').count()) > 0;
      if (hasViewButton) {
        viewableRow = row;
        break;
      }
    }

    if (!viewableRow) {
      throw new Error("No campaigns with View button found. Please create a campaign with generated emails.");
    }

    // Click the View button
    const viewButton = await findViewButton(page, viewableRow);
    await viewButton.click();

    // Wait for navigation to campaign detail page
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 15000 });
    
    // Wait for campaign data to load
    await waitForCampaignData(page);

    // First click on the "Email List" tab to show individual emails
    console.log("Looking for Email List tab...");
    
    // Try multiple strategies to click the Email List tab
    const tabSelectors = [
      'button[role="tab"]:has-text("Email List")',
      'text="Email List (2)"',
      '[data-state="inactive"]:has-text("Email List")',
      'button:has-text("Email List (2)")'
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
    
    await page.waitForTimeout(2000); // Wait for tab content to load

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
    await page.waitForTimeout(2000);

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
    // Navigate to existing campaigns page
    await navigateToCampaigns(page);

    // Find campaigns that have a View button
    const rows = page.locator("tr");
    const rowCount = await rows.count();

    let viewableRow = null;
    for (let i = 1; i < rowCount; i++) {
      const row = rows.nth(i);
      const hasViewButton = (await row.locator('button:has-text("View")').count()) > 0;
      if (hasViewButton) {
        viewableRow = row;
        break;
      }
    }

    if (!viewableRow) {
      throw new Error("No campaigns with View button found. Please create a campaign with generated emails.");
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
      'button:has-text("Email List (2)")'
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
    await page.waitForTimeout(2000); // Wait for tab content to load

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

    // Click the first tab again
    const tabAfterRefresh = page.locator('[role="tab"]').first();
    await tabAfterRefresh.waitFor({ state: "visible" });
    await tabAfterRefresh.click({ force: true });
    await page.waitForTimeout(2000);

    // Verify content persisted after refresh - try multiple strategies
    try {
      // Strategy 1: Look for the specific text content
      const persistedContent = page.locator(`text*="PERSISTENT TEST CONTENT"`);
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
