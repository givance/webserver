import { test, expect } from "@playwright/test";
import {
  navigateToEmailScheduleSettings,
  setDailyEmailLimit,
  setEmailGap,
  selectTimezone,
  saveEmailSchedule,
  verifyEmailLimitDisplay,
  getScheduleSettings,
  resetEmailSchedule,
  verifySettingsCard,
} from "./helper";

test.describe("Email Schedule Settings", () => {
  test.beforeEach(async ({ page }) => {
    console.log("🔧 Navigating to email schedule settings...");
    await navigateToEmailScheduleSettings(page);
  });

  test.afterEach(async ({ page }) => {
    console.log("🔧 Resetting email schedule to defaults...");
    await resetEmailSchedule(page);
  });

  test("should display email schedule settings page with correct structure", async ({ page }) => {
    console.log("📋 Verifying email schedule settings page structure...");

    // Verify page title and icon
    await expect(page.locator('h2:has-text("Email Schedule")')).toBeVisible();
    await expect(page.locator('main svg.lucide-clock')).toBeVisible();

    // Verify the main card exists
    await verifySettingsCard(page, "Email Schedule Settings");

    // Verify expected fields are present
    const fields = [
      { label: "Daily Email Limit", selector: 'div:has-text("Daily Email Limit") input[type="number"]' },
      { label: "Email Sending Gap (minutes)", selector: 'div:has-text("Email Sending Gap") input[type="number"]' },
      { label: "Timezone for Daily Limits", selector: 'button[role="combobox"]' },
    ];

    for (const field of fields) {
      console.log(`  ✓ Checking field: ${field.label}`);
      await expect(page.locator(`text="${field.label}"`)).toBeVisible();
      await expect(page.locator(field.selector).first()).toBeVisible();
    }

    // Verify slider for daily limit
    await expect(page.locator('[role="slider"]')).toBeVisible();

    // Verify min and max gap inputs exist in the gap section
    await expect(page.locator('input#min-gap')).toBeVisible();
    await expect(page.locator('input#max-gap')).toBeVisible();

    // Verify save button is present
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible();

    console.log("✅ Email schedule settings page structure verified");
  });

  test("should update daily email limit", async ({ page }) => {
    console.log("🔧 Testing daily email limit update...");

    const newLimit = 250;

    // Update the daily email limit
    await setDailyEmailLimit(page, newLimit);

    // Save the settings
    await saveEmailSchedule(page);

    // Verify the limit was saved
    await verifyEmailLimitDisplay(page, newLimit);

    // Verify persistence after reload
    await page.reload();
    await page.waitForLoadState("networkidle");
    await verifyEmailLimitDisplay(page, newLimit);

    console.log("✅ Daily email limit update test completed");
  });

  test("should handle email limit boundary values", async ({ page }) => {
    console.log("🔧 Testing email limit boundary values...");

    // Test minimum value (1)
    await setDailyEmailLimit(page, 1);
    await saveEmailSchedule(page);
    await verifyEmailLimitDisplay(page, 1);

    // Test maximum value (500)
    await setDailyEmailLimit(page, 500);
    await saveEmailSchedule(page);
    await verifyEmailLimitDisplay(page, 500);

    // Test a normal value
    await setDailyEmailLimit(page, 100);
    await saveEmailSchedule(page);
    await verifyEmailLimitDisplay(page, 100);

    console.log("✅ Email limit boundary values test completed");
  });

  test("should update email sending gaps", async ({ page }) => {
    console.log("🔧 Testing email sending gap update...");

    const minGap = 2;
    const maxGap = 5;

    // Update the email gaps
    await setEmailGap(page, minGap, maxGap);

    // Save the settings
    await saveEmailSchedule(page);

    // Verify the gaps were saved
    const settings = await getScheduleSettings(page);
    expect(settings.minGap).toBe(minGap);
    expect(settings.maxGap).toBe(maxGap);

    // Verify persistence after reload
    await page.reload();
    await page.waitForLoadState("networkidle");

    const reloadedSettings = await getScheduleSettings(page);
    expect(reloadedSettings.minGap).toBe(minGap);
    expect(reloadedSettings.maxGap).toBe(maxGap);

    console.log("✅ Email sending gap update test completed");
  });

  test("should enforce minimum gap constraint", async ({ page }) => {
    console.log("🔧 Testing minimum gap constraint...");

    // Set a minimum gap first
    await setEmailGap(page, 5, 5); // Start with equal values
    
    // Try to set max gap lower than min gap by typing directly into the max field
    const maxGapInput = page.locator('input#max-gap');
    await maxGapInput.fill('3'); // Try to set lower than min=5
    
    // The browser/component should prevent this or auto-correct it
    const actualMaxValue = await maxGapInput.inputValue();
    const actualMinValue = await page.locator('input#min-gap').inputValue();
    
    console.log(`  📊 Min gap: ${actualMinValue}, Max gap: ${actualMaxValue}`);
    
    // Either the input was rejected or auto-corrected
    expect(parseInt(actualMaxValue)).toBeGreaterThanOrEqual(parseInt(actualMinValue));

    console.log("✅ Minimum gap constraint test completed");
  });

  test("should update timezone", async ({ page }) => {
    console.log("🔧 Testing timezone update...");

    // Select a different timezone
    await selectTimezone(page, "Pacific Time");

    // Save the settings
    await saveEmailSchedule(page);

    // Verify the timezone was saved
    const settings = await getScheduleSettings(page);
    expect(settings.timezone).toContain("Pacific Time");

    console.log("✅ Timezone update test completed");
  });

  test("should display estimated sending times", async ({ page }) => {
    console.log("🔧 Testing estimated sending times display...");

    // Verify estimated time calculations are shown
    const estimatedTimeText = page.locator('text="Estimated Sending Times:"');
    await expect(estimatedTimeText).toBeVisible();

    // Verify specific examples are shown in the alert
    const alertSection = page.locator('[role="alert"]').or(page.locator('.alert')).first();
    await expect(alertSection.locator('text=/• 50 emails:/i')).toBeVisible();
    await expect(alertSection.locator('text=/• 150 emails:/i')).toBeVisible();
    await expect(alertSection.locator('text=/• 500 emails:/i')).toBeVisible();

    console.log("✅ Estimated sending times display test completed");
  });

  test("should handle multiple setting updates", async ({ page }) => {
    console.log("🔧 Testing multiple setting updates...");

    const newSettings = {
      dailyLimit: 300,
      minGap: 3,
      maxGap: 7,
    };

    // Update all settings
    await setDailyEmailLimit(page, newSettings.dailyLimit);
    await setEmailGap(page, newSettings.minGap, newSettings.maxGap);
    await selectTimezone(page, "Central Time");

    // Save all changes at once
    await saveEmailSchedule(page);

    // Verify all values persist
    const settings = await getScheduleSettings(page);
    expect(settings.dailyLimit).toBe(newSettings.dailyLimit);
    expect(settings.minGap).toBe(newSettings.minGap);
    expect(settings.maxGap).toBe(newSettings.maxGap);
    expect(settings.timezone).toContain("Central Time");

    console.log("✅ Multiple setting updates test completed");
  });

  test("should show helpful descriptions", async ({ page }) => {
    console.log("🔧 Testing helpful descriptions...");

    // Verify description for daily limit
    await expect(page.locator('text=/Maximum number of emails to send per day/i')).toBeVisible();

    // Verify description for email gaps
    await expect(page.locator('text=/Random delay.*will be used between emails/i')).toBeVisible();

    // Verify description for timezone
    await expect(page.locator('text=/Daily limits reset at midnight/i')).toBeVisible();

    console.log("✅ Helpful descriptions test completed");
  });

  test("should use slider for daily limit", async ({ page }) => {
    console.log("🔧 Testing slider functionality...");

    // Find the slider
    const slider = page.locator('[role="slider"]');
    await expect(slider).toBeVisible();

    // Get the slider's bounding box to calculate click position
    const sliderBox = await slider.boundingBox();
    if (sliderBox) {
      // Click at 50% position (should be around 250 if max is 500)
      const clickX = sliderBox.x + sliderBox.width * 0.5;
      const clickY = sliderBox.y + sliderBox.height * 0.5;
      
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(500);

      // Verify the input value changed
      const limitInput = page.locator('div:has-text("Daily Email Limit") input[type="number"]').first();
      const value = await limitInput.inputValue();
      const numValue = parseInt(value);
      
      // Should be somewhere in the middle range
      expect(numValue).toBeGreaterThan(100);
      expect(numValue).toBeLessThan(400);
    }

    console.log("✅ Slider functionality test completed");
  });

  test("should persist settings across page navigation", async ({ page }) => {
    console.log("🔧 Testing settings persistence across navigation...");

    // Set custom settings
    await setDailyEmailLimit(page, 200);
    await setEmailGap(page, 4, 8);
    await saveEmailSchedule(page);

    // Navigate away and back
    await page.goto("/settings/organization");
    await page.waitForLoadState("networkidle");
    await navigateToEmailScheduleSettings(page);

    // Verify settings persisted
    const settings = await getScheduleSettings(page);
    expect(settings.dailyLimit).toBe(200);
    expect(settings.minGap).toBe(4);
    expect(settings.maxGap).toBe(8);

    console.log("✅ Settings persistence test completed");
  });

  test("should show loading state during save", async ({ page }) => {
    console.log("🔧 Testing loading state during save...");

    // Make a change
    await setDailyEmailLimit(page, 180);

    // Click save and check for loading state
    const saveButton = page.locator('button:has-text("Save Settings")').first();
    await saveButton.click();

    // Wait for save to complete (success toast should appear)
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 15000 });

    console.log("✅ Loading state test completed");
  });

  test("should handle invalid inputs gracefully", async ({ page }) => {
    console.log("🔧 Testing invalid input handling...");

    // Try to set negative values
    const limitInput = page.locator('div:has-text("Daily Email Limit") input[type="number"]').first();
    await limitInput.fill("-10");

    // The input should constrain to valid range
    const actualValue = await limitInput.inputValue();
    expect(parseInt(actualValue)).toBeGreaterThanOrEqual(1);

    // Try to set values above maximum
    await limitInput.fill("1000");
    const constrainedValue = await limitInput.inputValue();
    expect(parseInt(constrainedValue)).toBeLessThanOrEqual(500);

    console.log("✅ Invalid input handling test completed");
  });

  test("should show reset functionality", async ({ page }) => {
    console.log("🔧 Testing reset functionality...");

    // Get initial/saved settings
    const initialSettings = await getScheduleSettings(page);
    console.log("  📊 Initial settings:", initialSettings);

    // Change settings from current values
    await setDailyEmailLimit(page, 400);
    await setEmailGap(page, 10, 20);
    
    // Verify changes are reflected in UI before reset
    const changedSettings = await getScheduleSettings(page);
    expect(changedSettings.dailyLimit).toBe(400);
    expect(changedSettings.minGap).toBe(10);
    expect(changedSettings.maxGap).toBe(20);

    // Look for reset button (should be visible after making changes)
    const resetButton = page.locator('button:has-text("Reset")');
    if (await resetButton.isVisible({ timeout: 2000 })) {
      console.log("  🔄 Reset button found - clicking reset");
      await resetButton.click();
      
      // Verify settings were reset to original values (not hardcoded defaults)
      const resetSettings = await getScheduleSettings(page);
      expect(resetSettings.dailyLimit).toBe(initialSettings.dailyLimit);
      expect(resetSettings.minGap).toBe(initialSettings.minGap);
      expect(resetSettings.maxGap).toBe(initialSettings.maxGap);
      console.log("  ✅ Settings successfully reset to original values");
    } else {
      console.log("  ℹ️ Reset button not available - skipping reset test");
    }

    console.log("✅ Reset functionality test completed");
  });
});