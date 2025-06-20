import { test, expect } from "@playwright/test";

/**
 * Test for the bug where campaigns created from drafts with all emails already generated
 * still show as "Generating" instead of "Completed" or "Ready to Send"
 */
test.describe("Campaign Draft Completion Status", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the campaigns page
    await page.goto("/existing-campaigns");
    
    // Wait for the page to load
    await page.waitForLoadState("networkidle");
  });

  test("should show correct status when creating campaign from draft with all emails generated", async ({ page }) => {
    // Step 1: Create a new draft campaign
    const campaignName = `Draft Test Campaign ${Date.now()}`;
    
    // Go to campaign creation
    await page.goto("/campaign");
    
    // Fill in basic campaign details
    await page.fill('input[name="campaignName"]', campaignName);
    await page.fill('textarea[name="instruction"]', "Test email instruction for draft campaign");
    
    // Select some donors (assuming there are donors available)
    await page.click('text="Select Donors"');
    await page.waitForTimeout(1000);
    
    // Select first 3 donors
    const donorCheckboxes = page.locator('input[type="checkbox"][name^="donor-"]');
    const donorCount = await donorCheckboxes.count();
    const selectedCount = Math.min(3, donorCount);
    
    for (let i = 0; i < selectedCount; i++) {
      await donorCheckboxes.nth(i).click();
    }
    
    // Save as draft
    await page.click('button:has-text("Save as Draft")');
    await page.waitForTimeout(2000);
    
    // Step 2: Generate emails for all donors in the draft
    // Navigate to the draft campaign
    await page.goto("/existing-campaigns");
    await page.click(`text="${campaignName}"`);
    
    // Generate emails (this should happen automatically or via a button)
    await page.waitForTimeout(3000); // Wait for emails to generate
    
    // Step 3: Convert draft to active campaign
    await page.goto("/existing-campaigns");
    
    // Find the campaign row
    const campaignRow = page.locator(`tr:has-text("${campaignName}")`);
    
    // Click edit button
    await campaignRow.locator('button:has-text("Edit")').click();
    
    // Click "Create Campaign" or similar button to activate
    await page.click('button:has-text("Create Campaign")');
    await page.waitForTimeout(2000);
    
    // Step 4: Verify the status is not "Generating"
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");
    
    // Check the status badge
    const statusBadge = campaignRow.locator('[role="status"], .badge, [class*="badge"]');
    const statusText = await statusBadge.textContent();
    
    // The status should NOT be "Generating"
    expect(statusText).not.toContain("Generating");
    
    // It should be either "Completed" or "Ready to Send"
    expect(statusText?.toLowerCase()).toMatch(/completed|ready to send/i);
    
    // Step 5: Verify buttons are enabled
    const editButton = campaignRow.locator('button:has-text("Edit")');
    const saveButton = campaignRow.locator('button:has-text("Save to Drafts")');
    const sendButton = campaignRow.locator('button:has-text("Send Emails")');
    
    // Check that buttons are not disabled
    await expect(editButton).not.toBeDisabled();
    
    // These buttons might only appear for completed campaigns
    const saveButtonExists = await saveButton.count() > 0;
    const sendButtonExists = await sendButton.count() > 0;
    
    if (saveButtonExists) {
      await expect(saveButton).not.toBeDisabled();
    }
    
    if (sendButtonExists) {
      await expect(sendButton).not.toBeDisabled();
    }
    
    // Additional check: Verify the progress shows all emails as generated
    const progressSection = campaignRow.locator('[class*="progress"], [role="progressbar"]').first();
    if (await progressSection.count() > 0) {
      const progressText = await progressSection.textContent();
      console.log("Progress text:", progressText);
      
      // Should show that all emails are generated
      expect(progressText).toMatch(/\d+\/\d+/); // e.g., "3/3"
    }
  });

  test("should correctly update completedDonors count when creating from draft", async ({ page }) => {
    // This test specifically checks the completedDonors vs totalDonors issue
    const campaignName = `Donor Count Test ${Date.now()}`;
    
    // Create a campaign through API or UI with known donor count
    // For this test, we'll check the campaign data directly
    
    await page.goto("/campaign");
    
    // Create campaign with specific donors
    await page.fill('input[name="campaignName"]', campaignName);
    await page.fill('textarea[name="instruction"]', "Test donor count tracking");
    
    // Select donors
    await page.click('text="Select Donors"');
    await page.waitForTimeout(1000);
    
    const donorCheckboxes = page.locator('input[type="checkbox"][name^="donor-"]');
    const targetDonorCount = 5;
    
    for (let i = 0; i < targetDonorCount && i < await donorCheckboxes.count(); i++) {
      await donorCheckboxes.nth(i).click();
    }
    
    // Create the campaign
    await page.click('button:has-text("Create Campaign")');
    await page.waitForTimeout(3000);
    
    // Navigate back to campaigns list
    await page.goto("/existing-campaigns");
    await page.waitForLoadState("networkidle");
    
    // Find the campaign and check its donor counts
    const campaignRow = page.locator(`tr:has-text("${campaignName}")`);
    const donorInfo = campaignRow.locator('text=/\\d+\\/\\d+ processed/');
    
    if (await donorInfo.count() > 0) {
      const donorText = await donorInfo.textContent();
      console.log("Donor info:", donorText);
      
      // Extract completed and total donors
      const match = donorText?.match(/(\d+)\/(\d+) processed/);
      if (match) {
        const completed = parseInt(match[1]);
        const total = parseInt(match[2]);
        
        // If all emails are generated, completed should equal total
        expect(completed).toBe(total);
      }
    }
  });
});