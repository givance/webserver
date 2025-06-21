import { test, expect } from "@playwright/test";

// This test verifies that editing an email in the campaign detail page
// immediately reflects the changes without requiring a page refresh
test.describe("Campaign Email Editing", () => {
  test("should update email content immediately after saving changes", async ({ page }) => {
    // Navigate to existing campaigns page
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

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
    const viewButton = viewableRow.locator('button:has-text("View")');
    await viewButton.click();

    // Wait for navigation to campaign detail page
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // Wait for the campaign data to fully load by waiting for specific content
    await page.waitForSelector("h1", { timeout: 15000 });

    // Wait for the tRPC data to load - look for donor information or email content
    await page.waitForTimeout(2000); // Give React time to render the data

    // Look for donor tabs or email content - be more flexible about what we find
    const donorTabs = page.locator('[role="tab"]');
    await donorTabs.first().waitFor({ state: "visible", timeout: 10000 });

    const tabCount = await donorTabs.count();
    console.log(`Found ${tabCount} donor tabs`);

    if (tabCount === 0) {
      throw new Error("No donor tabs found. Campaign may not have generated emails.");
    }

    // Click on the first donor tab and wait for it to stabilize
    const firstTab = donorTabs.first();
    await firstTab.waitFor({ state: "visible" });
    await firstTab.waitFor({ state: "attached" });

    // Use force click to avoid stability issues
    await firstTab.click({ force: true });

    // Wait longer for the tab content to load and stabilize
    await page.waitForTimeout(3000);

    // Look for Edit button - be more flexible about finding it
    let editButton = page.locator('button:has-text("Edit")').first();

    // If no Edit button found, try looking for buttons with edit-like content
    const editButtonCount = await editButton.count();
    if (editButtonCount === 0) {
      // Debug what buttons are available
      const allButtons = page.locator("button");
      const buttonCount = await allButtons.count();
      console.log(`Found ${buttonCount} total buttons`);

      for (let i = 0; i < Math.min(buttonCount, 20); i++) {
        const buttonText = await allButtons.nth(i).textContent();
        console.log(`Button ${i}: "${buttonText}"`);
      }

      // Try alternative selectors for edit functionality
      const possibleEditButtons = page.locator(
        'button[aria-label*="edit" i], button[title*="edit" i], button:has(svg + text*="Edit")'
      );
      const altEditCount = await possibleEditButtons.count();

      if (altEditCount > 0) {
        editButton = possibleEditButtons.first();
        console.log("Found edit button using alternative selector");
      } else {
        throw new Error("No Edit buttons found. Emails may not be properly rendered or editable.");
      }
    }

    // Wait for edit button to be ready
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

    // Wait for the edit modal to appear
    const editModal = page.locator('[role="dialog"]').first();
    await expect(editModal).toBeVisible({ timeout: 15000 });

    // Wait for modal content to load
    await page.waitForTimeout(1000);

    // Find the email content textarea - try multiple selectors
    const textareaSelectors = [
      'textarea[placeholder*="content" i]',
      'textarea[placeholder*="email" i]',
      'textarea:not([placeholder*="subject" i])',
      "textarea",
    ];

    let contentTextarea = null;
    for (const selector of textareaSelectors) {
      const textareas = editModal.locator(selector);
      const count = await textareas.count();
      if (count > 0) {
        // Get the largest textarea (content is usually larger than subject)
        contentTextarea = textareas.last();
        break;
      }
    }

    if (!contentTextarea) {
      throw new Error("Could not find email content textarea in edit modal");
    }

    await expect(contentTextarea).toBeVisible();

    // Clear and enter new content
    const testContent = `EDITED EMAIL CONTENT - Test ${Date.now()}

This email has been modified by the integration test to verify that changes appear immediately without page refresh.

Original content preview: ${originalContent.substring(0, 50)}...

This tests the cache invalidation fix in the updateEmail mutation.`;

    await contentTextarea.fill(testContent);

    // Find and click Save button
    const saveButton = editModal.locator('button:has-text("Save")').first();
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Wait for modal to close
    await expect(editModal).toBeHidden({ timeout: 15000 });

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
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");

    // Find and click View button
    const viewButton = page.locator('button:has-text("View")').first();
    await viewButton.click();

    // Wait for campaign detail page
    await page.waitForURL(/\/campaign\/\d+/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click first donor tab
    const firstTab = page.locator('[role="tab"]').first();
    await firstTab.waitFor({ state: "visible" });
    await firstTab.click({ force: true });
    await page.waitForTimeout(2000);

    // Click Edit button
    const editButton = page.locator('button:has-text("Edit")').first();
    await editButton.waitFor({ state: "visible", timeout: 10000 });
    await editButton.click();

    // Wait for modal and edit content
    const editModal = page.locator('[role="dialog"]').first();
    await expect(editModal).toBeVisible({ timeout: 15000 });

    const persistContent = `PERSISTENT TEST CONTENT - ${Date.now()}

This content should persist after page refresh, proving the database was actually updated.`;

    const contentTextarea = editModal.locator("textarea").last();
    await contentTextarea.fill(persistContent);

    // Save changes
    const saveButton = editModal.locator('button:has-text("Save")').first();
    await saveButton.click();
    await expect(editModal).toBeHidden({ timeout: 15000 });
    await page.waitForTimeout(1000);

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
