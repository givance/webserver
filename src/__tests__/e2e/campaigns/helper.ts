import { Page, expect } from "@playwright/test";

/**
 * Campaign E2E Test Helpers
 * Provides semantic, business-focused functions for campaign testing
 */

// Navigation Helpers
export async function navigateToCampaigns(page: Page) {
  await page.goto("/existing-campaigns");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}

export async function navigateToCampaignCreation(page: Page) {
  await page.goto("/campaign");
  await page.waitForLoadState("networkidle");
}

export async function navigateToCampaignDetails(page: Page, campaignId: string) {
  await page.goto(`/campaign/${campaignId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000); // Allow time for data loading
}

// Campaign Workflow Helpers
export async function selectDonors(page: Page, count: number) {
  // Wait for donor checkboxes to appear
  await page.waitForSelector('[role="checkbox"], input[type="checkbox"]', { timeout: 10000 });

  const donorCheckboxes = page.locator('[role="checkbox"], input[type="checkbox"]');
  const availableCount = await donorCheckboxes.count();

  if (availableCount === 0) {
    throw new Error("No donors available for selection");
  }

  const selectCount = Math.min(count, availableCount);

  for (let i = 0; i < selectCount; i++) {
    const checkbox = donorCheckboxes.nth(i);
    await checkbox.scrollIntoViewIfNeeded();
    await checkbox.check({ force: true });
    await page.waitForTimeout(200);
  }

  // Verify selection count is shown
  const selectedCount = page.locator("text=/\\d+ donor.*selected/i");
  await expect(selectedCount).toBeVisible({ timeout: 5000 });
}

export async function setCampaignName(page: Page, name: string) {
  await expect(page.locator('h3:has-text("Name Your Campaign")')).toBeVisible({ timeout: 10000 });

  const nameInput = page.locator("input#campaignName");
  await nameInput.waitFor({ state: "visible", timeout: 5000 });
  await nameInput.fill(name);

  // Verify character counter
  await expect(page.locator("text=/\\d+\\/255/i")).toBeVisible({ timeout: 3000 });
}

export async function continueWithoutTemplate(page: Page) {
  const continueButton = page.locator('button:has-text("Continue")');
  await continueButton.click();
  await page.waitForTimeout(2000);
}

export async function selectTemplate(page: Page, skipIfNotVisible = true) {
  const templateHeadings = [
    'h3:has-text("Select Template")',
    'h3:has-text("Choose Template")',
    'h2:has-text("Template")',
    'h3:has-text("Template")',
  ];

  let foundHeading = false;
  for (const selector of templateHeadings) {
    if (
      await page
        .locator(selector)
        .isVisible()
        .catch(() => false)
    ) {
      foundHeading = true;
      break;
    }
  }

  if (!foundHeading && skipIfNotVisible) {
    return;
  }

  // Select first available template
  const templateOptions = page.locator('input[type="radio"]');
  if ((await templateOptions.count()) > 0) {
    await templateOptions.first().click({ force: true });
    await page.waitForTimeout(500);
  }
}

export async function writeInstructions(page: Page, instruction: string) {
  // Check for various instruction step indicators
  const instructionIndicators = [
    'h3:has-text("Write Instructions")',
    'h1:has-text("Write Instructions")',
    'button[role="tab"]:has-text("Chat & Generate")',
  ];

  for (const selector of instructionIndicators) {
    if (
      await page
        .locator(selector)
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      break;
    }
  }

  // Find the instruction input - try multiple selectors
  const inputSelectors = [
    "div[data-mention-input]",
    "textarea",
    ".mentions-input",
    'textarea[placeholder*="instruction"]',
  ];

  let instructionInput = null;
  for (const selector of inputSelectors) {
    const element = page.locator(selector).first();
    if (await element.isVisible({ timeout: 5000 }).catch(() => false)) {
      instructionInput = element;
      break;
    }
  }

  if (!instructionInput) {
    throw new Error("Could not find instruction input field");
  }

  await instructionInput.fill(instruction);
}

export async function generateEmails(page: Page) {
  // Find and click the generate button
  const generateButtons = [
    'button:has-text("Generate Emails")',
    'button:has-text("Send")',
    'button:has-text("Generate")',
  ];

  let generateButton = null;
  for (const selector of generateButtons) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      generateButton = button;
      break;
    }
  }

  if (!generateButton) {
    throw new Error("Could not find generate button");
  }

  await generateButton.click();

  // Wait for AI response
  await page.waitForTimeout(10000);

  // Wait for preview section
  const previewSection = page.locator('button:has-text("Email Preview")');
  await expect(previewSection.first()).toBeVisible({ timeout: 60000 });
}

export async function startBulkGeneration(page: Page) {
  const bulkGenerateButton = page.locator('button:has-text("Start Bulk Generation"), button:has-text("Generate")');

  if (await bulkGenerateButton.first().isVisible({ timeout: 5000 })) {
    await bulkGenerateButton.first().click();
    await page.waitForTimeout(5000);
  }
}

// Element Finding Helpers
export async function findCampaignRow(page: Page, campaignName: string) {
  const campaignRow = page.locator(`tr:has-text("${campaignName}")`);
  await expect(campaignRow).toBeVisible({ timeout: 10000 });
  return campaignRow;
}

export async function findCampaignByStatus(page: Page, status: string) {
  const rows = page.locator("table tbody tr");

  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const statusElements = row.locator("span, div").filter({
      hasText: new RegExp(`^${status}$`, "i"),
    });

    if ((await statusElements.count()) > 0) {
      return row;
    }
  }

  return null;
}

export async function waitForCampaignData(page: Page) {
  // Wait for various indicators that campaign data has loaded
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Look for common campaign data indicators
  const dataIndicators = ["h1", '[role="tab"]', '[data-testid="campaign-data"]', ".campaign-content"];

  for (const selector of dataIndicators) {
    if (
      await page
        .locator(selector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      break;
    }
  }
}

export async function findEditButton(page: Page, container: Page | any = page) {
  // Check if we're on a campaign detail page looking for email edit buttons
  const currentUrl = page.url();
  if (currentUrl.includes('/campaign/') && !currentUrl.includes('/edit/')) {
    // On campaign detail page, look for the email edit button (not campaign edit)
    await page.waitForTimeout(1000); // Let content load
    
    // Try to find edit button that's NOT the "Edit Campaign" button
    const emailEditButton = page.locator('button:has-text("Edit")').filter({
      hasNotText: 'Campaign'
    }).first();
    
    if (await emailEditButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      return emailEditButton;
    }
    
    // Alternative: Look for edit button near AI Enhance
    const nearEnhance = page.locator('button:has-text("AI Enhance") ~ button:has-text("Edit")').first();
    if (await nearEnhance.isVisible({ timeout: 1000 }).catch(() => false)) {
      return nearEnhance;
    }
  }
  
  // For campaign list page or other contexts
  const editSelectors = [
    'button:has-text("Edit"):not(:has-text("Campaign"))',
    '[data-testid="edit-button"]',
    'button[aria-label*="edit" i]',
    'tr button:has-text("Edit")', // Edit button in table rows
    // Icon buttons in campaign list
    'tr button svg', // Any icon button in table row
    'tr a[href*="/edit/"]', // Edit links
    '[title="Edit"]',
    '[aria-label="Edit"]',
  ];

  for (const selector of editSelectors) {
    const elements = container.locator(selector);
    const count = await elements.count();
    
    for (let i = 0; i < count; i++) {
      const element = elements.nth(i);
      if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
        // If it's a link, we need to click it
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());
        if (tagName === 'a') {
          // Return a clickable wrapper
          return {
            click: async () => {
              await element.click();
            },
            waitFor: async (options: any) => {
              await element.waitFor(options);
            },
            isVisible: async () => {
              return element.isVisible();
            }
          };
        }
        return element;
      }
    }
  }

  throw new Error("Edit button not found");
}

export async function findViewButton(page: Page, container: Page | any = page) {
  const viewSelectors = ['button:has-text("View")', '[data-testid="view-button"]', 'button[aria-label*="view" i]'];

  for (const selector of viewSelectors) {
    const button = container.locator(selector).first();
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      return button;
    }
  }

  throw new Error("View button not found");
}

// Status & Verification Helpers
export async function verifyCampaignStatus(page: Page, campaignName: string, expectedStatus: string) {
  const row = await findCampaignRow(page, campaignName);
  const statusElements = row.locator("span, div").filter({
    hasText: /^(Draft|Pending|Ready to Send|Completed|Failed|Generating)$/i,
  });

  if ((await statusElements.count()) > 0) {
    const actualStatus = await statusElements.first().textContent();
    expect(actualStatus).toMatch(new RegExp(expectedStatus, "i"));
  } else {
    throw new Error(`Status element not found for campaign: ${campaignName}`);
  }
}

export async function waitForStatusChange(page: Page, row: any, fromStatus: string) {
  const maxAttempts = 10;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const statusElement = row.locator('[class*="badge"], span[data-status]').first();
    const currentStatus = await statusElement.textContent();

    if (currentStatus && !currentStatus.includes(fromStatus)) {
      return currentStatus;
    }

    await page.waitForTimeout(3000);
    attempts++;
  }

  throw new Error(`Status did not change from ${fromStatus} after ${maxAttempts} attempts`);
}

export async function verifyDonorCount(page: Page, expectedCount: number) {
  const countElement = page.locator("text=/\\d+ donor.*selected/i");
  await expect(countElement).toBeVisible({ timeout: 5000 });

  const text = await countElement.textContent();
  const match = text?.match(/(\d+)/);
  if (match) {
    expect(parseInt(match[1])).toBe(expectedCount);
  }
}

export async function verifyEmailGeneration(page: Page) {
  // Look for indicators that emails were generated
  const indicators = [
    "text=/preview.*email|email.*preview/i",
    "div[data-testid='email-preview']",
    "[data-email-preview]",
    ".email-content",
  ];

  for (const selector of indicators) {
    if (
      await page
        .locator(selector)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      return true;
    }
  }

  throw new Error("No email generation indicators found");
}

// Modal & Dialog Helpers
export async function handleConfirmDialog(page: Page, confirmText = "Confirm") {
  const dialog = page.locator('[role="dialog"], [role="alertdialog"], div[data-state="open"]');
  await expect(dialog.first()).toBeVisible({ timeout: 10000 });

  const confirmButton = dialog.locator(
    `button:has-text("${confirmText}"), button:has-text("Yes"), button:has-text("Save")`
  );
  await confirmButton.last().click();
}

export async function editEmailInModal(page: Page, newContent: string) {
  // Wait for edit modal
  const editModal = page.locator('[role="dialog"]').first();
  await expect(editModal).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);

  // Find email content textarea
  const textareaSelectors = [
    'textarea[placeholder*="content" i]',
    'textarea[placeholder*="email" i]',
    'textarea:not([placeholder*="subject" i])',
    "textarea",
  ];

  let contentTextarea = null;
  for (const selector of textareaSelectors) {
    const textarea = editModal.locator(selector).last();
    if (await textarea.isVisible().catch(() => false)) {
      contentTextarea = textarea;
      break;
    }
  }

  if (!contentTextarea) {
    throw new Error("Could not find email content textarea in edit modal");
  }

  await contentTextarea.fill(newContent);

  // Save changes
  const saveButton = editModal.locator('button:has-text("Save")').first();
  await expect(saveButton).toBeVisible();
  await saveButton.click();
}

export async function waitForModalToClose(page: Page) {
  const modal = page.locator('[role="dialog"]').first();
  await expect(modal).toBeHidden({ timeout: 15000 });
  await page.waitForTimeout(1000);
}

// Campaign List Operations
export async function clickNextButton(page: Page) {
  const nextButton = page.locator('button:has-text("Next")');
  await nextButton.click();
  await page.waitForTimeout(2000);
}

export async function clickContinueButton(page: Page) {
  const continueButton = page.locator('button:has-text("Continue")');
  await continueButton.click();
  await page.waitForTimeout(2000);
}

export async function saveCampaignToDrafts(page: Page, campaignRow: any) {
  const saveButton = campaignRow.locator('button:has-text("Save to Drafts"), button:has-text("Save")');
  await saveButton.click();

  await handleConfirmDialog(page, "Save");

  // Wait for success message
  const successToast = page
    .locator('[data-sonner-toast], [role="status"], div[data-toast]')
    .filter({ hasText: /saved|success/i });
  await expect(successToast.first()).toBeVisible({ timeout: 15000 });
}

export async function retryCampaign(page: Page, campaignRow: any) {
  const retryButton = campaignRow.locator('button:has-text("Retry")');
  await retryButton.click();
  await page.waitForTimeout(2000);
}

export async function countCampaigns(page: Page) {
  const campaignRows = page.locator("table tbody tr");
  return await campaignRows.count();
}

export async function deleteCampaign(page: Page, campaignRow: any) {
  const campaignCount = await countCampaigns(page);
  if (campaignCount === 0) {
    throw new Error("No campaigns to delete");
  }

  const deleteButton = campaignRow.locator('button:has-text("Delete")');
  await deleteButton.click();

  // Handle confirmation
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator("text=/delete.*campaign/i").first()).toBeVisible();

  const confirmButton = dialog.locator('button:has-text("Delete")').last();
  await confirmButton.click();

  await page.waitForTimeout(2000);
  const newCampaignCount = await countCampaigns(page);
  expect(newCampaignCount).toBe(campaignCount - 1);
  // await expect(campaignRow).not.toBeVisible();
}

// Donor Tab Operations
export async function selectDonorTab(page: Page, tabIndex: number = 0) {
  // Wait for the email list content to be visible first
  await page.waitForTimeout(1000);
  
  // Look for donor tabs specifically within the email list viewer
  // These are tabs inside the TabsList within the email list, not the main campaign tabs
  const donorTabs = page.locator('[role="tabpanel"][data-state="active"] [role="tab"], .grid [role="tab"]');
  
  // If no tabs found in active panel, try all tabs but skip the main navigation tabs
  if (await donorTabs.count() === 0) {
    const allTabs = page.locator('[role="tab"]');
    const tabCount = await allTabs.count();
    
    // Find the first tab that's not "Schedule & Status" or "Email List"
    for (let i = 0; i < tabCount; i++) {
      const tab = allTabs.nth(i);
      const tabText = await tab.textContent();
      if (tabText && !tabText.includes("Schedule") && !tabText.includes("Email List")) {
        await tab.click({ force: true });
        await page.waitForTimeout(3000);
        return;
      }
    }
  } else {
    await donorTabs.first().waitFor({ state: "visible", timeout: 10000 });
    const tab = donorTabs.nth(tabIndex);
    await tab.click({ force: true });
    await page.waitForTimeout(3000);
  }
}

// Progress & Statistics Helpers
export async function getProgressInfo(page: Page, campaignRow: any) {
  const progressCell = campaignRow.locator("td").nth(3);
  const progressText = await progressCell.textContent();

  const match = progressText?.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) {
    return {
      completed: parseInt(match[1]),
      total: parseInt(match[2]),
    };
  }

  return null;
}

export async function verifyCampaignStatistics(page: Page) {
  const statsCards = page.locator('[class*="card"]').filter({
    has: page.locator("text=/Total Donors|Generated Emails|Sent Emails|Open Rate|Click Rate/i"),
  });

  expect(await statsCards.count()).toBeGreaterThan(0);

  // Verify each stat card shows a value
  for (let i = 0; i < (await statsCards.count()); i++) {
    const card = statsCards.nth(i);
    const valueElement = card.locator('div[class*="text-2xl"], div[class*="font-bold"], div[class*="text-3xl"]');

    if ((await valueElement.count()) > 0) {
      const value = await valueElement.first().textContent();
      expect(value).toMatch(/\d+|[\d.]+%|Never|-/);
    }
  }
}
