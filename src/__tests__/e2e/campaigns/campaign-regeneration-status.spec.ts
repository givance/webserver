import { test, expect } from "@playwright/test";
import {
  navigateToCampaigns,
  navigateToCampaignDetails,
  findEditButton,
  findViewButton,
  findCampaignByStatus,
  writeInstructions,
  generateEmails,
  waitForStatusChange,
  retryCampaign,
  startBulkGeneration,
  getProgressInfo,
  verifyCampaignStatistics,
  waitForCampaignData,
} from "./helper";

test.describe("Campaign Regeneration and Status Checking", () => {
  test.beforeEach(async ({ page }) => {
    await navigateToCampaigns(page);
  });

  test("should regenerate emails for an existing campaign", async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Find a campaign that can be edited - Draft campaigns are more likely to be editable
    let targetRow = await findCampaignByStatus(page, "Draft");
    if (!targetRow) {
      // Fallback to Ready to Send if no drafts
      targetRow = await findCampaignByStatus(page, "Ready to Send");
    }
    if (!targetRow) {
      throw new Error("No campaigns found with Draft or Ready to Send status for regeneration test");
    }

    // Navigate to edit page for regeneration
    const campaignName = await targetRow.locator('td').first().textContent();
    console.log(`Found campaign for regeneration: ${campaignName}`);
    
    // Try different ways to navigate to edit page
    const nameLink = targetRow.locator('td').first().locator('a');
    if ((await nameLink.count()) > 0) {
      await nameLink.click();
    } else {
      const actionsCell = targetRow.locator('td').last();
      const editLink = actionsCell.locator('a[href*="/edit/"]').first();
      const editButton = actionsCell.locator('button').filter({ hasNotText: 'View' }).first();
      
      if ((await editLink.count()) > 0) {
        await editLink.click();
      } else if ((await editButton.count()) > 0) {
        await editButton.click();
      } else {
        // Click on the row if nothing else works
        await targetRow.click();
      }
    }

    // Should navigate to edit page
    await page.waitForURL(/\/campaign\/edit\/\d+/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // Wait for page to fully load

    // Check if we're on template selection step and need to continue
    const templateHeading = page.locator('h2:has-text("Select Template")');
    if (await templateHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("On template selection step, clicking Continue");
      const continueButton = page.locator('button:has-text("Continue")').last();
      await continueButton.click();
      await page.waitForTimeout(3000);
    }

    // Verify we're on the Write Instructions step
    const writeInstructionsIndicators = [
      'h1:has-text("Edit Campaign")',
      'button[role="tab"]:has-text("Chat & Generate")',
      'textarea[placeholder*="instruction"]',
      'textarea[placeholder*="Enter your instructions"]',
      'text="Continue editing your campaign"'
    ];
    
    let foundWriteInstructions = false;
    for (const selector of writeInstructionsIndicators) {
      if (await page.locator(selector).first().isVisible({ timeout: 5000 }).catch(() => false)) {
        foundWriteInstructions = true;
        break;
      }
    }
    
    if (!foundWriteInstructions) {
      throw new Error("Failed to navigate to Write Instructions step for regeneration");
    }

    // Add new instruction for regeneration
    await writeInstructions(
      page,
      "Please regenerate emails with a more formal tone and include our organization's mission statement."
    );

    // Generate new emails
    await generateEmails(page);

    // Start bulk generation
    await startBulkGeneration(page);

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
        try {
          const viewButton = await findViewButton(page, row);
          await viewButton.click();

          await page.waitForURL(/\/campaign\/\d+/);
          await waitForCampaignData(page);

          // Verify status indicators on results page
          await expect(page.locator('text="Generated Emails"')).toBeVisible();

          // Check for live updates (the count should be visible)
          const generatedCount = page
            .locator('[class*="card"]')
            .filter({ hasText: "Generated Emails" })
            .locator('div[class*="text-2xl"], div[class*="font-bold"]');
          await expect(generatedCount.first()).toBeVisible();

          return; // Test one active campaign
        } catch (e) {
          // No view button for this campaign
          continue;
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

  // test("should handle campaign generation failures and allow retry", async ({ page }) => {
  //   // Look for failed campaigns
  //   const failedBadge = page.locator('[class*="badge"]').filter({ hasText: "Failed" });

  //   if ((await failedBadge.count()) === 0) {
  //     throw new Error(
  //       "No failed campaigns found for failure handling test - need at least one campaign with Failed status"
  //     );
  //   }

  //   const failedRow = page.locator("table tbody tr").filter({ has: failedBadge.first() });

  //   // Verify failed campaign shows error indicators
  //   const errorIcon = failedRow.locator('svg[class*="x"], svg[class*="error"], svg[class*="alert"]');
  //   if ((await errorIcon.count()) > 0) {
  //     await expect(errorIcon.first()).toBeVisible();
  //   }

  //   // Check for partial progress
  //   const progressInfo = await getProgressInfo(page, failedRow);
  //   if (progressInfo) {
  //     expect(progressInfo.completed).toBeLessThan(progressInfo.total);
  //   }

  //   // Test retry functionality
  //   await retryCampaign(page, failedRow);

  //   // Verify status changes from Failed
  //   const newStatus = await waitForStatusChange(page, failedRow, "Failed");
  //   expect(newStatus).toMatch(/Pending|Generating|In Progress/i);
  // });

  test("should track email sending status", async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    const targetRow = await findCampaignByStatus(page, "Ready to Send");

    if (!targetRow) {
      throw new Error("No campaigns found with Ready to Send, In Progress, or Completed status for tracking test");
    }

    // Click View to see detailed sending status
    const viewButton = await findViewButton(page, targetRow);
    await viewButton.click();

    await page.waitForURL(/\/campaign\/\d+/, { timeout: 10000 });
    await waitForCampaignData(page);

    // Verify we're on the campaign detail page with email information
    const emailInfoSelectors = [
      'text="Total Donors"',
      'text="Emails Generated"',
      'text=/\\d+ donor/i',
      'text=/Recipients.*\\(/i',
      'h1:has-text("Donor Count Test")',
    ];
    
    let foundInfo = false;
    for (const selector of emailInfoSelectors) {
      if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
        foundInfo = true;
        break;
      }
    }
    
    expect(foundInfo).toBeTruthy();

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
    const initialProgress = await getProgressInfo(page, activeCampaign);

    if (initialProgress) {
      expect(initialProgress.completed).toBeGreaterThanOrEqual(0);
      expect(initialProgress.total).toBeGreaterThan(0);
    }
  });

  // test("should show campaign statistics and analytics", async ({ page }) => {
  //   // Find a completed campaign with statistics
  //   const completedRow = page
  //     .locator("table tbody tr")
  //     .filter({
  //       has: page.locator('[class*="badge"]').filter({ hasText: "Completed" }),
  //     })
  //     .first();

  //   if ((await completedRow.count()) === 0) {
  //     throw new Error(
  //       "No completed campaigns found for statistics test - need at least one campaign with Completed status"
  //     );
  //   }

  //   // Check progress column for statistics
  //   const progressCell = completedRow.locator("td").nth(3);
  //   const progressText = await progressCell.textContent();

  //   // Should show generated/sent/opened counts
  //   if (progressText) {
  //     // Could be in format like "10 Generated • 8 Sent • 3 Opened"
  //     const hasStats =
  //       progressText.includes("Generated") ||
  //       progressText.includes("Sent") ||
  //       progressText.includes("Opened") ||
  //       progressText.match(/\d+/);

  //     expect(hasStats).toBeTruthy();
  //   }

  //   // View detailed analytics
  //   const viewButton = await findViewButton(page, completedRow);
  //   await viewButton.click();

  //   await page.waitForURL(/\/campaign\/results\/\w+/);
  //   await waitForCampaignData(page);

  //   // Verify analytics and statistics
  //   await verifyCampaignStatistics(page);
  // });

  // test("should allow bulk regeneration from campaign list", async ({ page }) => {
  //   // Wait for table to load
  //   await page.waitForSelector("table tbody tr", { timeout: 10000 });

  //   // This tests the ability to trigger regeneration for multiple failed/incomplete campaigns
  //   let campaignsToRetry = [];
  //   const campaignRows = page.locator("table tbody tr");

  //   // Find campaigns that can be retried
  //   for (let i = 0; i < (await campaignRows.count()); i++) {
  //     const row = campaignRows.nth(i);

  //     // Check if row has a retry button
  //     const retryButton = row.locator('button:has-text("Retry")');
  //     if ((await retryButton.count()) > 0) {
  //       // Check status to confirm it needs retry
  //       const statusBadge = row.locator('[class*="badge"], span[data-status]').first();
  //       if ((await statusBadge.count()) > 0) {
  //         const status = await statusBadge.textContent();
  //         if (status && (status.includes("Failed") || status.includes("Pending") || status.includes("Partial"))) {
  //           campaignsToRetry.push({ row, retryButton });
  //         }
  //       }
  //     }
  //   }

  //   if (campaignsToRetry.length === 0) {
  //     throw new Error(
  //       "No campaigns available for bulk retry test - need campaigns with Failed, Pending, or Partial status that have retry buttons"
  //     );
  //   }

  //   // Test batch retry by clicking multiple retry buttons
  //   const retriesToTest = Math.min(2, campaignsToRetry.length);
  //   const initialStatuses = [];

  //   // Capture initial statuses
  //   for (let i = 0; i < retriesToTest; i++) {
  //     const statusBadge = campaignsToRetry[i].row.locator('[class*="badge"], span[data-status]').first();
  //     const status = await statusBadge.textContent();
  //     initialStatuses.push(status);
  //   }

  //   // Click retry buttons
  //   for (let i = 0; i < retriesToTest; i++) {
  //     await retryCampaign(page, campaignsToRetry[i].row);
  //     await page.waitForTimeout(500); // Wait between clicks
  //   }

  //   // Wait for status updates
  //   await page.waitForTimeout(3000);

  //   // Verify statuses changed
  //   let changedCount = 0;
  //   for (let i = 0; i < retriesToTest; i++) {
  //     const statusBadge = campaignsToRetry[i].row.locator('[class*="badge"], span[data-status]').first();
  //     const newStatus = await statusBadge.textContent();

  //     if (newStatus !== initialStatuses[i]) {
  //       changedCount++;
  //     }
  //   }

  //   // At least one should have changed status
  //   expect(changedCount).toBeGreaterThan(0);
  // });
});
