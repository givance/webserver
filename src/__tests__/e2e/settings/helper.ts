import { Page, expect } from "@playwright/test";

/**
 * Settings E2E Test Helpers
 * Provides semantic, business-focused functions for settings testing
 */

// Navigation Helpers
export async function navigateToOrganizationSettings(page: Page) {
  await page.goto("/settings/organization");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  
  // Verify we're on the right page
  await expect(page.locator('h1:has-text("Organization Settings")')).toBeVisible({ timeout: 10000 });
}

export async function navigateToEmailScheduleSettings(page: Page) {
  await page.goto("/settings/email-schedule");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  
  // Verify we're on the right page
  await expect(page.locator('h2:has-text("Email Schedule")')).toBeVisible({ timeout: 10000 });
}

export async function navigateToSettings(page: Page, settingsPath: string) {
  await page.goto(`/settings/${settingsPath}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}

// Organization Settings Helpers
export async function updateOrganizationField(page: Page, fieldName: string, value: string) {
  const fieldSelectors: Record<string, string> = {
    websiteUrl: 'input[name="websiteUrl"], input#websiteUrl',
    description: 'textarea[name="description"], textarea#description',
    shortDescription: 'textarea[name="shortDescription"], textarea#shortDescription',
    writingInstructions: 'textarea[name="writingInstructions"], textarea#writingInstructions',
  };

  const selector = fieldSelectors[fieldName];
  if (!selector) {
    throw new Error(`Unknown field: ${fieldName}`);
  }

  const field = page.locator(selector).first();
  await field.waitFor({ state: "visible", timeout: 5000 });
  await field.fill(value);
}

export async function saveOrganizationSettings(page: Page) {
  await saveSettings(page, "Save Changes");
}

export async function generateShortDescription(page: Page) {
  const generateButton = page.locator('button:has-text("Generate")').first();
  await generateButton.click();
  
  // Wait for generation to complete
  await expect(generateButton).not.toContainText("Generating...", { timeout: 30000 });
  
  // Verify the textarea now has content
  const shortDescTextarea = page.locator('textarea[name="shortDescription"], textarea#shortDescription').first();
  const content = await shortDescTextarea.inputValue();
  expect(content.length).toBeGreaterThan(0);
}

// Email Schedule Settings Helpers
export async function setDailyEmailLimit(page: Page, limit: number) {
  // Use the number input in the Daily Email Limit section
  const limitInput = page.locator('div:has-text("Daily Email Limit") input[type="number"]').first();
  await limitInput.fill(limit.toString());
}

export async function setEmailGap(page: Page, minGap: number, maxGap: number) {
  // Set minimum gap using ID
  await page.locator('input#min-gap').fill(minGap.toString());
  
  // Set maximum gap using ID
  await page.locator('input#max-gap').fill(maxGap.toString());
}

export async function selectTimezone(page: Page, timezone: string) {
  // Click the timezone select button
  const timezoneButton = page.locator('button[role="combobox"]').filter({ hasText: /Time|timezone|UTC|EST|PST|CST/i });
  await timezoneButton.click();
  
  // Wait for dropdown to open
  await page.waitForTimeout(500);
  
  // Select the timezone option
  const timezoneOption = page.locator(`[role="option"]:has-text("${timezone}")`);
  await timezoneOption.click();
}

export async function saveEmailSchedule(page: Page) {
  await saveSettings(page, "Save Settings");
}

export async function verifyEmailLimitDisplay(page: Page, expectedLimit: number) {
  const limitInput = page.locator('div:has-text("Daily Email Limit") input[type="number"]').first();
  const actualValue = await limitInput.inputValue();
  expect(parseInt(actualValue)).toBe(expectedLimit);
}

// Common Settings Helpers
export async function saveSettings(page: Page, buttonText: string = "Save") {
  // Try multiple button text patterns
  const buttonSelectors = [
    `button:has-text("${buttonText}")`,
    `button:has-text("Save Changes")`,
    `button:has-text("Save Settings")`,
    'button[type="submit"]:has-text("Save")',
  ];
  
  let saveButton = null;
  for (const selector of buttonSelectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
      saveButton = button;
      break;
    }
  }
  
  if (!saveButton) {
    throw new Error(`Could not find save button with text containing: ${buttonText}`);
  }
  
  // Check if the button is disabled (no changes to save)
  const isDisabled = await saveButton.getAttribute('disabled');
  if (isDisabled !== null) {
    console.log(`  ℹ️ Save button is disabled (no changes to save) - skipping save`);
    return;
  }
  
  await saveButton.click();
  
  // Wait for success toast
  const successToast = page
    .locator('[data-sonner-toast], [role="status"], div[data-toast]')
    .filter({ hasText: /saved|updated|success/i });
  await expect(successToast.first()).toBeVisible({ timeout: 15000 });
  
  // Wait for any loading state to finish
  const loadingTexts = ["Saving...", "Updating...", "Loading..."];
  for (const loadingText of loadingTexts) {
    const loadingElement = page.locator(`text="${loadingText}"`);
    if (await loadingElement.isVisible({ timeout: 500 }).catch(() => false)) {
      await expect(loadingElement).toBeHidden({ timeout: 10000 });
    }
  }
}

export async function verifySettingsCard(page: Page, cardTitle: string) {
  const card = page.locator('[class*="card"]').filter({ hasText: cardTitle });
  await expect(card.first()).toBeVisible({ timeout: 5000 });
}

export async function verifyFieldValue(page: Page, fieldName: string, expectedValue: string) {
  const fieldSelectors: Record<string, string> = {
    websiteUrl: 'input[name="websiteUrl"], input#websiteUrl',
    description: 'textarea[name="description"], textarea#description',
    shortDescription: 'textarea[name="shortDescription"], textarea#shortDescription',
    writingInstructions: 'textarea[name="writingInstructions"], textarea#writingInstructions',
  };

  const selector = fieldSelectors[fieldName];
  if (!selector) {
    throw new Error(`Unknown field: ${fieldName}`);
  }

  const field = page.locator(selector).first();
  const actualValue = await field.inputValue();
  expect(actualValue).toBe(expectedValue);
}

export async function verifyNoChangesMessage(page: Page) {
  const infoToast = page
    .locator('[data-sonner-toast], [role="status"], div[data-toast]')
    .filter({ hasText: /no changes/i });
  await expect(infoToast.first()).toBeVisible({ timeout: 5000 });
}

// Settings Navigation Helpers
export async function navigateViaSettingsSidebar(page: Page, linkText: string) {
  // First, ensure the settings section is expanded
  const settingsSection = page.locator('button:has-text("Settings")').first();
  const isExpanded = await page.locator('.rotate-90').count() > 0;
  
  if (!isExpanded) {
    await settingsSection.click();
    await page.waitForTimeout(500);
  }
  
  // Click the specific settings link
  const settingsLink = page.locator(`a:has-text("${linkText}")`).first();
  await settingsLink.click();
  await page.waitForLoadState("networkidle");
}

// Validation Helpers
export async function verifyRequiredFieldError(page: Page, fieldName: string) {
  const errorSelectors = [
    `text="${fieldName} is required"`,
    `text="Please enter ${fieldName.toLowerCase()}"`,
    `[data-field="${fieldName}"] ~ .error-message`,
  ];
  
  let errorFound = false;
  for (const selector of errorSelectors) {
    if (await page.locator(selector).isVisible({ timeout: 3000 }).catch(() => false)) {
      errorFound = true;
      break;
    }
  }
  
  expect(errorFound).toBeTruthy();
}

export async function waitForAutoSave(page: Page) {
  // Some settings might auto-save
  await page.waitForTimeout(1000);
  
  // Check for any saving indicators
  const savingIndicators = page.locator('text=/saving|updating/i');
  if (await savingIndicators.count() > 0) {
    await expect(savingIndicators.first()).toBeHidden({ timeout: 10000 });
  }
}

// Data Verification Helpers
export async function getOrganizationData(page: Page) {
  const websiteUrl = await page.locator('input[name="websiteUrl"]').first().inputValue();
  const description = await page.locator('textarea[name="description"]').first().inputValue();
  const shortDescription = await page.locator('textarea[name="shortDescription"]').first().inputValue();
  const writingInstructions = await page.locator('textarea[name="writingInstructions"]').first().inputValue();
  
  return {
    websiteUrl,
    description,
    shortDescription,
    writingInstructions,
  };
}

export async function verifyDataPersistence(page: Page, expectedData: Record<string, string>) {
  // Reload the page
  await page.reload();
  await page.waitForLoadState("networkidle");
  
  // Verify each field retained its value
  for (const [field, expectedValue] of Object.entries(expectedData)) {
    await verifyFieldValue(page, field, expectedValue);
  }
}

// Email Schedule Specific Helpers
export async function getScheduleSettings(page: Page) {
  // Get current daily limit - should be the text input in the Daily Email Limit section
  const limitInput = page.locator('div:has-text("Daily Email Limit") input[type="number"]').first();
  const dailyLimit = await limitInput.inputValue();
  
  // Get email gaps using IDs
  const minGap = await page.locator('input#min-gap').inputValue();
  const maxGap = await page.locator('input#max-gap').inputValue();
  
  // Get timezone
  const timezoneButton = page.locator('button[role="combobox"]').filter({ hasText: /Time|timezone|UTC|EST|PST|CST/i });
  const timezone = await timezoneButton.textContent();
  
  return {
    dailyLimit: parseInt(dailyLimit) || 0,
    minGap: parseInt(minGap) || 0,
    maxGap: parseInt(maxGap) || 0,
    timezone: timezone?.trim() || '',
  };
}

export async function resetEmailSchedule(page: Page) {
  // Reset to defaults: 150 daily limit, 1-3 minute gaps, ET timezone
  await setDailyEmailLimit(page, 150);
  await setEmailGap(page, 1, 3);
  await selectTimezone(page, "Eastern Time");
  await saveEmailSchedule(page);
}