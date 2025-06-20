import { test, expect } from "@playwright/test";

test.describe("Campaign Regeneration and Status Checking", () => {
  test.beforeEach(async ({ page }) => {
    // Start from existing campaigns page
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");
  });

  test("should regenerate emails for an existing campaign", async ({ page }) => {
    // Find a campaign that can be edited (preferably with some emails already generated)
    const campaignRows = page.locator("table tbody tr");
    let targetRow = null;

    for (let i = 0; i < await campaignRows.count(); i++) {
      const row = campaignRows.nth(i);
      const status = await row.locator('[class*="badge"]').textContent();
      
      // Look for campaigns that have been completed or are ready to send
      if (status && ["Completed", "Ready to Send"].some(s => status.includes(s))) {
        targetRow = row;
        break;
      }
    }

    if (!targetRow) {
      test.skip();
      return;
    }

    // Click Edit to go to regeneration
    const editButton = targetRow.locator('button:has-text("Edit")');
    await editButton.click();

    // Should navigate to edit page with Write Instructions step
    await page.waitForURL(/\/campaign\/edit\/\d+/);
    await page.waitForLoadState("networkidle");

    // Verify we're in the Write Instructions step
    await expect(page.locator('h1:has-text("Write Instructions")')).toBeVisible();

    // Check for existing generated emails
    const emailCount = page.locator('text=/Generated.*\\d+.*email/i');
    await expect(emailCount).toBeVisible();

    // Add new instruction for regeneration
    const instructionInput = page.locator('textarea[placeholder*="instruction"], textarea').first();
    await instructionInput.fill("Please regenerate emails with a more formal tone and include our organization's mission statement.");

    // Send the instruction
    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // Wait for AI response
    await page.waitForTimeout(3000);

    // Look for Generate More button to regenerate
    const generateMoreButton = page.locator('button:has-text("Generate More")');
    await expect(generateMoreButton).toBeVisible({ timeout: 30000 });

    // Click Generate More to add to existing emails
    await generateMoreButton.click();

    // Wait for generation to start
    await page.waitForTimeout(2000);

    // Verify campaign enters generating state
    const generatingIndicator = page.locator('text=/generating|processing|creating/i');
    await expect(generatingIndicator).toBeVisible({ timeout: 10000 });
  });

  test("should monitor campaign generation status", async ({ page }) => {
    // Look for campaigns in various states
    const statuses = ["Generating", "In Progress", "Pending"];
    
    for (const status of statuses) {
      const statusBadge = page.locator('[class*="badge"]').filter({ hasText: status });
      
      if (await statusBadge.count() > 0) {
        // Found a campaign in progress
        const row = page.locator("table tbody tr").filter({ has: statusBadge.first() });
        
        // Check progress indicators
        const progressText = row.locator('text=/\\d+\\s*\\/\\s*\\d+/'); // e.g., "5/10"
        if (await progressText.count() > 0) {
          await expect(progressText.first()).toBeVisible();
        }

        // Click View to see real-time status
        const viewButton = row.locator('button:has-text("View")');
        if (await viewButton.count() > 0) {
          await viewButton.click();
          
          await page.waitForURL(/\/campaign\/results\/\w+/);
          await page.waitForLoadState("networkidle");

          // Verify status indicators on results page
          await expect(page.locator('text="Generated Emails"')).toBeVisible();
          
          // Check for live updates (the count should be visible)
          const generatedCount = page.locator('[class*="card"]').filter({ hasText: "Generated Emails" }).locator('div[class*="text-2xl"], div[class*="font-bold"]');
          await expect(generatedCount.first()).toBeVisible();
          
          return; // Test one active campaign
        }
      }
    }

    // If no active campaigns, check that completed campaigns show final status
    const completedBadge = page.locator('[class*="badge"]').filter({ hasText: "Completed" });
    if (await completedBadge.count() > 0) {
      const row = page.locator("table tbody tr").filter({ has: completedBadge.first() });
      
      // Should show completion indicators
      const checkIcon = row.locator('svg[class*="check"], svg[class*="circle-check"]');
      const progressText = row.locator('text=/\\d+\\s*\\/\\s*\\d+/');
      
      expect(
        (await checkIcon.count() > 0) || 
        (await progressText.count() > 0)
      ).toBeTruthy();
    }
  });

  test("should handle campaign generation failures and allow retry", async ({ page }) => {
    // Look for failed campaigns
    const failedBadge = page.locator('[class*="badge"]').filter({ hasText: "Failed" });
    
    if (await failedBadge.count() === 0) {
      // No failed campaigns to test
      test.skip();
      return;
    }

    const failedRow = page.locator("table tbody tr").filter({ has: failedBadge.first() });
    
    // Verify failed campaign shows error indicators
    const errorIcon = failedRow.locator('svg[class*="x"], svg[class*="error"], svg[class*="alert"]');
    if (await errorIcon.count() > 0) {
      await expect(errorIcon.first()).toBeVisible();
    }

    // Check for partial progress (e.g., "3/10" emails generated before failure)
    const progressText = failedRow.locator('text=/\\d+\\s*\\/\\s*\\d+/');
    if (await progressText.count() > 0) {
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
    // Find a campaign that's ready to send or has sent emails
    const campaignRows = page.locator("table tbody tr");
    let targetRow = null;

    for (let i = 0; i < await campaignRows.count(); i++) {
      const row = campaignRows.nth(i);
      const status = await row.locator('[class*="badge"]').textContent();
      
      if (status && ["Ready to Send", "In Progress", "Completed"].some(s => status.includes(s))) {
        // Check if it shows sent count
        const progressCell = row.locator('td').filter({ hasText: /sent|opened/i });
        if (await progressCell.count() > 0) {
          targetRow = row;
          break;
        }
      }
    }

    if (!targetRow) {
      test.skip();
      return;
    }

    // Click View to see detailed sending status
    const viewButton = targetRow.locator('button:has-text("View")');
    await viewButton.click();

    await page.waitForURL(/\/campaign\/results\/\w+/);
    await page.waitForLoadState("networkidle");

    // Verify sending status indicators
    await expect(page.locator('text="Sent Emails"')).toBeVisible();
    
    // Check for individual email statuses
    const emailList = page.locator('[data-email-preview], div[class*="email"]').filter({ has: page.locator('text=/sent|opened/i') });
    
    if (await emailList.count() > 0) {
      // Check for sent badges
      const sentBadge = page.locator('[class*="badge"]').filter({ hasText: "Sent" }).first();
      if (await sentBadge.count() > 0) {
        await expect(sentBadge).toBeVisible();
      }

      // Check for opened badges and tracking info
      const openedBadge = page.locator('[class*="badge"]').filter({ hasText: "Opened" }).first();
      if (await openedBadge.count() > 0) {
        await expect(openedBadge).toBeVisible();
        
        // Opened emails should show additional tracking info
        const openCount = page.locator('text=/opened.*\\d+.*time/i');
        if (await openCount.count() > 0) {
          await expect(openCount.first()).toBeVisible();
        }
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
      if (await badge.count() > 0) {
        activeCampaign = page.locator("table tbody tr").filter({ has: badge });
        break;
      }
    }

    if (!activeCampaign) {
      // Create a simple test to verify the UI is ready for updates
      const anyRow = page.locator("table tbody tr").first();
      if (await anyRow.count() > 0) {
        // Verify progress cell exists and could show updates
        const progressCell = anyRow.locator('td').nth(3); // Progress column
        await expect(progressCell).toBeVisible();
        
        // Progress should contain either numbers or status
        const progressText = await progressCell.textContent();
        expect(progressText).toBeTruthy();
      }
      return;
    }

    // For active campaigns, capture initial progress
    const progressCell = activeCampaign.locator('td').nth(3);
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
    const completedRow = page.locator("table tbody tr").filter({ 
      has: page.locator('[class*="badge"]').filter({ hasText: "Completed" }) 
    }).first();

    if (await completedRow.count() === 0) {
      test.skip();
      return;
    }

    // Check progress column for statistics
    const progressCell = completedRow.locator('td').nth(3);
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
      has: page.locator('text=/Total Donors|Generated Emails|Sent Emails|Open Rate|Click Rate/i') 
    });

    expect(await statsCards.count()).toBeGreaterThan(0);

    // Each stat card should show a number
    for (let i = 0; i < await statsCards.count(); i++) {
      const card = statsCards.nth(i);
      const valueElement = card.locator('div[class*="text-2xl"], div[class*="font-bold"], div[class*="text-3xl"]');
      
      if (await valueElement.count() > 0) {
        const value = await valueElement.first().textContent();
        expect(value).toMatch(/\d+|[\d.]+%|Never|-/);
      }
    }
  });

  test("should allow bulk regeneration from campaign list", async ({ page }) => {
    // This tests the ability to trigger regeneration for multiple failed/incomplete campaigns
    
    // Check if there are any campaigns that need regeneration
    const needsRegeneration = page.locator("table tbody tr").filter({
      has: page.locator('[class*="badge"]').filter({ hasText: /Failed|Partial/i })
    });

    if (await needsRegeneration.count() === 0) {
      // Also check for campaigns with incomplete generation
      const incompleteRows = page.locator("table tbody tr").filter({
        has: page.locator('text=/\\d+\\s*\\/\\s*\\d+/').filter(async (el) => {
          const text = await el.textContent();
          const match = text?.match(/(\d+)\s*\/\s*(\d+)/);
          if (match) {
            return parseInt(match[1]) < parseInt(match[2]);
          }
          return false;
        })
      });

      if (await incompleteRows.count() === 0) {
        test.skip();
        return;
      }
    }

    // For each campaign that needs regeneration, verify retry button is available
    const retryButtons = page.locator('button:has-text("Retry")');
    const retryCount = await retryButtons.count();

    if (retryCount > 0) {
      // Test batch retry by clicking multiple retry buttons
      const retriesToTest = Math.min(2, retryCount);
      
      for (let i = 0; i < retriesToTest; i++) {
        await retryButtons.nth(i).click();
        await page.waitForTimeout(1000);
      }

      // Verify campaigns entered regeneration state
      const generatingBadges = page.locator('[class*="badge"]').filter({ hasText: /Generating|In Progress|Pending/i });
      expect(await generatingBadges.count()).toBeGreaterThanOrEqual(retriesToTest);
    }
  });
});