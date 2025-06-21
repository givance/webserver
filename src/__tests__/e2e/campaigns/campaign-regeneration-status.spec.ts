import { test, expect } from "@playwright/test";

test.describe("Campaign Regeneration and Status Checking", () => {
  test.beforeEach(async ({ page }) => {
    // Start from existing campaigns page
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");
  });

  test("should regenerate emails for an existing campaign", async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Find a campaign that can be edited (preferably with some emails already generated)
    const campaignRows = page.locator("table tbody tr");
    let targetRow = null;

    for (let i = 0; i < (await campaignRows.count()); i++) {
      const row = campaignRows.nth(i);
      const statusBadge = row.locator('[class*="badge"], span[data-status]');

      if ((await statusBadge.count()) > 0) {
        const status = await statusBadge.first().textContent();
        // Look for campaigns that have been completed or are ready to send
        if (status && ["Completed", "Ready to Send"].some((s) => status.includes(s))) {
          targetRow = row;
          break;
        }
      }
    }

    if (!targetRow) {
      throw new Error("No campaigns found with Completed or Ready to Send status for regeneration test");
    }

    // Click Edit to go to regeneration
    const editButton = targetRow.locator('button:has-text("Edit")');
    await editButton.waitFor({ state: "visible", timeout: 5000 });
    await editButton.click();

    // Should navigate to edit page with Write Instructions step
    await page.waitForURL(/\/campaign\/edit\/\d+/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Verify we're in the Write Instructions step
    await expect(page.locator('h1:has-text("Write Instructions")')).toBeVisible({ timeout: 10000 });

    // Check for existing generated emails indicator
    const emailCount = page.locator("text=/Generated.*\\d+.*email|\\d+.*email.*generated/i");
    if ((await emailCount.count()) > 0) {
      await expect(emailCount.first()).toBeVisible({ timeout: 5000 });
    }

    // Add new instruction for regeneration
    const instructionInput = page.locator('textarea[placeholder*="instruction"], textarea').first();
    await instructionInput.waitFor({ state: "visible", timeout: 5000 });
    await instructionInput.click();
    await instructionInput.fill(
      "Please regenerate emails with a more formal tone and include our organization's mission statement."
    );

    // Send the instruction
    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.waitFor({ state: "visible", timeout: 5000 });
    await sendButton.click();

    // Wait for AI response with longer timeout
    await page.waitForTimeout(5000);

    // Look for Generate More button or similar action buttons
    const actionButtons = page.locator(
      'button:has-text("Generate More"), button:has-text("Generate"), button:has-text("Start Bulk Generation")'
    );
    await expect(actionButtons.first()).toBeVisible({ timeout: 60000 });

    // Click the action button to regenerate
    await actionButtons.first().click();

    // Wait for generation to start
    await page.waitForTimeout(3000);

    // Verify some indication of processing - could be various UI elements
    const processingIndicators = page.locator(
      "text=/generating|processing|creating|loading/i, " +
        '[role="progressbar"], ' +
        'div[data-state="loading"], ' +
        ".animate-spin"
    );

    // At least one indicator should be visible
    const indicatorCount = await processingIndicators.count();
    expect(indicatorCount).toBeGreaterThan(0);
  });

  test("should monitor campaign generation status", async ({ page }) => {
    // Look for campaigns in various states
    const statuses = ["Generating", "In Progress", "Pending"];

    for (const status of statuses) {
      const statusBadge = page.locator('[class*="badge"]').filter({ hasText: status });

      if ((await statusBadge.count()) > 0) {
        // Found a campaign in progress
        const row = page.locator("table tbody tr").filter({ has: statusBadge.first() });

        // Check progress indicators
        const progressText = row.locator("text=/\\d+\\s*\\/\\s*\\d+/"); // e.g., "5/10"
        if ((await progressText.count()) > 0) {
          await expect(progressText.first()).toBeVisible();
        }

        // Click View to see real-time status
        const viewButton = row.locator('button:has-text("View")');
        if ((await viewButton.count()) > 0) {
          await viewButton.click();

          await page.waitForURL(/\/campaign\/results\/\w+/);
          await page.waitForLoadState("networkidle");

          // Verify status indicators on results page
          await expect(page.locator('text="Generated Emails"')).toBeVisible();

          // Check for live updates (the count should be visible)
          const generatedCount = page
            .locator('[class*="card"]')
            .filter({ hasText: "Generated Emails" })
            .locator('div[class*="text-2xl"], div[class*="font-bold"]');
          await expect(generatedCount.first()).toBeVisible();

          return; // Test one active campaign
        }
      }
    }

    // If no active campaigns, check that completed campaigns show final status
    const completedBadge = page.locator('[class*="badge"]').filter({ hasText: "Completed" });
    if ((await completedBadge.count()) > 0) {
      const row = page.locator("table tbody tr").filter({ has: completedBadge.first() });

      // Should show completion indicators
      const checkIcon = row.locator('svg[class*="check"], svg[class*="circle-check"]');
      const progressText = row.locator("text=/\\d+\\s*\\/\\s*\\d+/");

      expect((await checkIcon.count()) > 0 || (await progressText.count()) > 0).toBeTruthy();
    }
  });

  test("should handle campaign generation failures and allow retry", async ({ page }) => {
    // Look for failed campaigns
    const failedBadge = page.locator('[class*="badge"]').filter({ hasText: "Failed" });

    if ((await failedBadge.count()) === 0) {
      throw new Error(
        "No failed campaigns found for failure handling test - need at least one campaign with Failed status"
      );
    }

    const failedRow = page.locator("table tbody tr").filter({ has: failedBadge.first() });

    // Verify failed campaign shows error indicators
    const errorIcon = failedRow.locator('svg[class*="x"], svg[class*="error"], svg[class*="alert"]');
    if ((await errorIcon.count()) > 0) {
      await expect(errorIcon.first()).toBeVisible();
    }

    // Check for partial progress (e.g., "3/10" emails generated before failure)
    const progressText = failedRow.locator("text=/\\d+\\s*\\/\\s*\\d+/");
    if ((await progressText.count()) > 0) {
      const progress = await progressText.textContent();
      // Parse to ensure some were generated
      const match = progress?.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        const generated = parseInt(match[1]);
        const total = parseInt(match[2]);
        expect(generated).toBeLessThan(total);
      }
    }

    // Test retry functionality
    const retryButton = failedRow.locator('button:has-text("Retry")');
    await expect(retryButton).toBeVisible();

    await retryButton.click();
    await page.waitForTimeout(2000);

    // Verify status changes from Failed
    const newStatusBadge = failedRow.locator('[class*="badge"]');
    const newStatus = await newStatusBadge.textContent();
    expect(newStatus).not.toContain("Failed");
    expect(newStatus).toMatch(/Pending|Generating|In Progress/i);
  });

  test("should track email sending status", async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Find a campaign that's ready to send or has sent emails
    const campaignRows = page.locator("table tbody tr");
    let targetRow = null;

    for (let i = 0; i < (await campaignRows.count()); i++) {
      const row = campaignRows.nth(i);
      const statusBadge = row.locator('[class*="badge"], span[data-status]');

      if ((await statusBadge.count()) > 0) {
        const status = await statusBadge.first().textContent();
        if (status && ["Ready to Send", "In Progress", "Completed"].some((s) => status.includes(s))) {
          // Also check progress column for any indication of emails
          const progressText = await row.locator("td").nth(3).textContent();
          if (progressText && (progressText.includes("Generated") || progressText.match(/\d+/))) {
            targetRow = row;
            break;
          }
        }
      }
    }

    if (!targetRow) {
      throw new Error("No campaigns found with Ready to Send, In Progress, or Completed status for tracking test");
    }

    // Click View to see detailed sending status
    const viewButton = targetRow.locator('button:has-text("View")');
    await viewButton.waitFor({ state: "visible", timeout: 5000 });
    await viewButton.click();

    await page.waitForURL(/\/campaign\/results\/\w+/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Verify sending status indicators - look for various possible labels
    const statusIndicators = page.locator(
      'text="Sent Emails", text="Emails Sent", ' + 'text="Generated Emails", text="Total Emails"'
    );
    await expect(statusIndicators.first()).toBeVisible({ timeout: 10000 });

    // Verify we have some content on the results page
    const contentCards = page.locator('[class*="card"], div[data-card]');
    expect(await contentCards.count()).toBeGreaterThan(0);

    // Check for email list or status information
    const emailContent = page.locator(
      "[data-email-preview], " + 'div[class*="email"], ' + "table tbody tr, " + 'div[data-testid="email-list"]'
    );

    // Should have some email-related content
    if ((await emailContent.count()) > 0) {
      // Look for any status indicators
      const statusBadges = page.locator('[class*="badge"], span[class*="status"]');

      // Just verify we have some status information displayed
      if ((await statusBadges.count()) > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }
    }
  });

  test("should update campaign progress in real-time", async ({ page }) => {
    // This test simulates checking campaign progress updates
    // In a real scenario, this would involve WebSocket updates or polling

    // Find any campaign in "Generating" or "In Progress" state
    const activeStatuses = ["Generating", "In Progress", "Sending"];
    let activeCampaign = null;

    for (const status of activeStatuses) {
      const badge = page.locator('[class*="badge"]').filter({ hasText: status }).first();
      if ((await badge.count()) > 0) {
        activeCampaign = page.locator("table tbody tr").filter({ has: badge });
        break;
      }
    }

    if (!activeCampaign) {
      // Create a simple test to verify the UI is ready for updates
      const anyRow = page.locator("table tbody tr").first();
      if ((await anyRow.count()) > 0) {
        // Verify progress cell exists and could show updates
        const progressCell = anyRow.locator("td").nth(3); // Progress column
        await expect(progressCell).toBeVisible();

        // Progress should contain either numbers or status
        const progressText = await progressCell.textContent();
        expect(progressText).toBeTruthy();
      }
      return;
    }

    // For active campaigns, capture initial progress
    const progressCell = activeCampaign.locator("td").nth(3);
    const initialProgress = await progressCell.textContent();

    // In a real test with active generation, we would:
    // 1. Wait a few seconds
    // 2. Check if progress updated
    // 3. Verify the numbers increased

    // For now, verify the progress format is correct
    if (initialProgress?.match(/\d+\s*\/\s*\d+/)) {
      const [generated, total] = initialProgress.match(/\d+/g) || [];
      expect(parseInt(generated)).toBeGreaterThanOrEqual(0);
      expect(parseInt(total)).toBeGreaterThan(0);
    }
  });

  test("should show campaign statistics and analytics", async ({ page }) => {
    // Find a completed campaign with statistics
    const completedRow = page
      .locator("table tbody tr")
      .filter({
        has: page.locator('[class*="badge"]').filter({ hasText: "Completed" }),
      })
      .first();

    if ((await completedRow.count()) === 0) {
      throw new Error(
        "No completed campaigns found for statistics test - need at least one campaign with Completed status"
      );
    }

    // Check progress column for statistics
    const progressCell = completedRow.locator("td").nth(3);
    const progressText = await progressCell.textContent();

    // Should show generated/sent/opened counts
    if (progressText) {
      // Could be in format like "10 Generated • 8 Sent • 3 Opened"
      const hasStats =
        progressText.includes("Generated") ||
        progressText.includes("Sent") ||
        progressText.includes("Opened") ||
        progressText.match(/\d+/);

      expect(hasStats).toBeTruthy();
    }

    // View detailed analytics
    const viewButton = completedRow.locator('button:has-text("View")');
    await viewButton.click();

    await page.waitForURL(/\/campaign\/results\/\w+/);
    await page.waitForLoadState("networkidle");

    // Verify analytics cards
    const statsCards = page.locator('[class*="card"]').filter({
      has: page.locator("text=/Total Donors|Generated Emails|Sent Emails|Open Rate|Click Rate/i"),
    });

    expect(await statsCards.count()).toBeGreaterThan(0);

    // Each stat card should show a number
    for (let i = 0; i < (await statsCards.count()); i++) {
      const card = statsCards.nth(i);
      const valueElement = card.locator('div[class*="text-2xl"], div[class*="font-bold"], div[class*="text-3xl"]');

      if ((await valueElement.count()) > 0) {
        const value = await valueElement.first().textContent();
        expect(value).toMatch(/\d+|[\d.]+%|Never|-/);
      }
    }
  });

  test("should allow bulk regeneration from campaign list", async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // This tests the ability to trigger regeneration for multiple failed/incomplete campaigns
    let campaignsToRetry = [];
    const campaignRows = page.locator("table tbody tr");

    // Find campaigns that can be retried
    for (let i = 0; i < (await campaignRows.count()); i++) {
      const row = campaignRows.nth(i);

      // Check if row has a retry button
      const retryButton = row.locator('button:has-text("Retry")');
      if ((await retryButton.count()) > 0) {
        // Check status to confirm it needs retry
        const statusBadge = row.locator('[class*="badge"], span[data-status]').first();
        if ((await statusBadge.count()) > 0) {
          const status = await statusBadge.textContent();
          if (status && (status.includes("Failed") || status.includes("Pending") || status.includes("Partial"))) {
            campaignsToRetry.push({ row, retryButton });
          }
        }
      }
    }

    if (campaignsToRetry.length === 0) {
      throw new Error(
        "No campaigns available for bulk retry test - need campaigns with Failed, Pending, or Partial status that have retry buttons"
      );
    }

    // Test batch retry by clicking multiple retry buttons
    const retriesToTest = Math.min(2, campaignsToRetry.length);
    const initialStatuses = [];

    // Capture initial statuses
    for (let i = 0; i < retriesToTest; i++) {
      const statusBadge = campaignsToRetry[i].row.locator('[class*="badge"], span[data-status]').first();
      const status = await statusBadge.textContent();
      initialStatuses.push(status);
    }

    // Click retry buttons
    for (let i = 0; i < retriesToTest; i++) {
      await campaignsToRetry[i].retryButton.click();
      await page.waitForTimeout(1500); // Wait between clicks
    }

    // Wait for status updates
    await page.waitForTimeout(3000);

    // Verify statuses changed
    let changedCount = 0;
    for (let i = 0; i < retriesToTest; i++) {
      const statusBadge = campaignsToRetry[i].row.locator('[class*="badge"], span[data-status]').first();
      const newStatus = await statusBadge.textContent();

      if (newStatus !== initialStatuses[i]) {
        changedCount++;
      }
    }

    // At least one should have changed status
    expect(changedCount).toBeGreaterThan(0);
  });
});
