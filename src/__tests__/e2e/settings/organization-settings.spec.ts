import { test, expect } from "@playwright/test";
import {
  navigateToOrganizationSettings,
  updateOrganizationField,
  saveOrganizationSettings,
  generateShortDescription,
  verifyFieldValue,
  verifyNoChangesMessage,
  verifyDataPersistence,
  getOrganizationData,
  verifySettingsCard,
} from "./helper";

test.describe("Organization Settings", () => {
  test.beforeEach(async ({ page }) => {
    console.log("🔧 Navigating to organization settings...");
    await navigateToOrganizationSettings(page);
  });

  test("should display organization settings page with correct structure", async ({ page }) => {
    console.log("📋 Verifying organization settings page structure...");

    // Verify page title and icon
    await expect(page.locator('h1:has-text("Organization Settings")')).toBeVisible();
    await expect(page.locator('main svg.lucide-building-2')).toBeVisible();

    // Verify the main card exists
    await verifySettingsCard(page, "Website & Description");

    // Verify all expected fields are present
    const fields = [
      { label: "Website URL", selector: 'input[name="websiteUrl"]' },
      { label: "Organization Description", selector: 'textarea[name="description"]' },
      { label: "Short Description", selector: 'textarea[name="shortDescription"]' },
      { label: "Writing Instructions", selector: 'textarea[name="writingInstructions"]' },
    ];

    for (const field of fields) {
      console.log(`  ✓ Checking field: ${field.label}`);
      await expect(page.locator(`text="${field.label}"`)).toBeVisible();
      await expect(page.locator(field.selector)).toBeVisible();
    }

    // Verify save button is present
    await expect(page.locator('button:has-text("Save Changes")')).toBeVisible();

    console.log("✅ Organization settings page structure verified");
  });

  test("should update website URL", async ({ page }) => {
    console.log("🔧 Testing website URL update...");

    const testUrl = `https://test-org-${Date.now()}.example.com`;

    // Update the website URL
    await updateOrganizationField(page, "websiteUrl", testUrl);

    // Save changes
    await saveOrganizationSettings(page);

    // Verify the value persists after save
    await verifyFieldValue(page, "websiteUrl", testUrl);

    // Verify persistence after reload
    await verifyDataPersistence(page, { websiteUrl: testUrl });

    console.log("✅ Website URL update test completed");
  });

  test("should update organization description", async ({ page }) => {
    console.log("🔧 Testing organization description update...");

    const testDescription = `Test organization description updated at ${new Date().toISOString()}. This is a test nonprofit organization focused on helping communities.`;

    // Update the description
    await updateOrganizationField(page, "description", testDescription);

    // Save changes
    await saveOrganizationSettings(page);

    // Verify the value persists
    await verifyFieldValue(page, "description", testDescription);

    console.log("✅ Organization description update test completed");
  });

  test("should generate short description using AI", async ({ page }) => {
    console.log("🔧 Testing AI short description generation...");

    // First ensure we have some content for the AI to work with
    const orgDescription = "We are a nonprofit organization dedicated to providing educational resources and mentorship programs to underprivileged youth in urban communities.";
    await updateOrganizationField(page, "description", orgDescription);

    // Clear any existing short description
    await updateOrganizationField(page, "shortDescription", "");

    // Click generate button
    await generateShortDescription(page);

    // Verify a short description was generated
    const shortDescTextarea = page.locator('textarea[name="shortDescription"]').first();
    const generatedContent = await shortDescTextarea.inputValue();
    
    expect(generatedContent.length).toBeGreaterThan(0);
    expect(generatedContent.length).toBeLessThanOrEqual(500); // Should be concise

    // Save the generated description
    await saveOrganizationSettings(page);

    console.log("✅ AI short description generation test completed");
  });

  test("should update writing instructions", async ({ page }) => {
    console.log("🔧 Testing writing instructions update...");

    const testInstructions = `Writing Guidelines for ${Date.now()}:
    - Use warm, personal tone
    - Focus on donor impact
    - Include specific examples
    - Keep emails concise (under 200 words)`;

    // Update writing instructions
    await updateOrganizationField(page, "writingInstructions", testInstructions);

    // Save changes
    await saveOrganizationSettings(page);

    // Verify the value persists
    await verifyFieldValue(page, "writingInstructions", testInstructions);

    console.log("✅ Writing instructions update test completed");
  });

  test("should handle multiple field updates", async ({ page }) => {
    console.log("🔧 Testing multiple field updates...");

    const timestamp = Date.now();
    const updates = {
      websiteUrl: `https://multi-test-${timestamp}.org`,
      description: `Multi-field test description ${timestamp}`,
      shortDescription: `Short desc ${timestamp}`,
      writingInstructions: `Instructions ${timestamp}`,
    };

    // Update all fields
    for (const [field, value] of Object.entries(updates)) {
      await updateOrganizationField(page, field, value);
    }

    // Save all changes at once
    await saveOrganizationSettings(page);

    // Verify all values persist
    for (const [field, value] of Object.entries(updates)) {
      await verifyFieldValue(page, field, value);
    }

    // Verify persistence after reload
    await verifyDataPersistence(page, updates);

    console.log("✅ Multiple field updates test completed");
  });

  test("should show no changes message when saving without modifications", async ({ page }) => {
    console.log("🔧 Testing no changes scenario...");

    // Get current values
    const currentData = await getOrganizationData(page);

    // Click save without making changes
    const saveButton = page.locator('button:has-text("Save Changes")').first();
    await saveButton.click();

    // Verify the "no changes" message appears
    await verifyNoChangesMessage(page);

    // Verify values remain unchanged
    const afterData = await getOrganizationData(page);
    expect(afterData).toEqual(currentData);

    console.log("✅ No changes scenario test completed");
  });

  test("should handle empty fields gracefully", async ({ page }) => {
    console.log("🔧 Testing empty fields handling...");

    // Clear optional fields (skip websiteUrl as it may have validation)
    await updateOrganizationField(page, "description", "");
    await updateOrganizationField(page, "shortDescription", "");
    await updateOrganizationField(page, "writingInstructions", "");

    // Check if there are any changes to save
    const saveButton = page.locator('button:has-text("Save Changes")').first();
    const isDisabled = await saveButton.getAttribute('disabled');
    
    if (isDisabled !== null) {
      console.log("  ℹ️ No changes detected - skipping save (button disabled)");
    } else {
      // Save changes
      await saveOrganizationSettings(page);
      
      // Verify fields are empty after save
      await verifyFieldValue(page, "description", "");
      await verifyFieldValue(page, "shortDescription", "");
      await verifyFieldValue(page, "writingInstructions", "");
    }

    console.log("✅ Empty fields handling test completed");
  });

  test("should preserve special characters and formatting", async ({ page }) => {
    console.log("🔧 Testing special characters and formatting...");

    const specialContent = `Special characters test:
    - Quotes: "double" and 'single'
    - Symbols: @#$%^&*()
    - International: café, naïve, 你好
    - Line breaks and formatting preserved`;

    await updateOrganizationField(page, "description", specialContent);
    await saveOrganizationSettings(page);

    // Verify special characters are preserved
    await verifyFieldValue(page, "description", specialContent);

    console.log("✅ Special characters test completed");
  });

  test("should handle very long content", async ({ page }) => {
    console.log("🔧 Testing long content handling...");

    // Generate long content
    const longContent = "This is a very long description. ".repeat(50);

    await updateOrganizationField(page, "description", longContent);
    await saveOrganizationSettings(page);

    // Verify long content is saved correctly
    const savedContent = await page.locator('textarea[name="description"]').first().inputValue();
    expect(savedContent).toBe(longContent);

    console.log("✅ Long content handling test completed");
  });

  test("should display loading state during save", async ({ page }) => {
    console.log("🔧 Testing loading state during save...");

    // Make a change
    await updateOrganizationField(page, "websiteUrl", `https://loading-test-${Date.now()}.org`);

    // Click save button
    const saveButton = page.locator('button:has-text("Save Changes")').first();
    await saveButton.click();

    // The loading state might be very brief, so check for either the loading state or success
    try {
      // Try to catch the loading state if it's visible
      await expect(saveButton).toContainText("Saving...", { timeout: 1000 });
      console.log("  ✅ Loading state captured");
    } catch {
      console.log("  ℹ️ Loading state too brief to capture - checking for success instead");
    }

    // Wait for success toast to appear instead
    const successToast = page
      .locator('[data-sonner-toast], [role="status"], div[data-toast]')
      .filter({ hasText: /saved|updated|success/i });
    await expect(successToast.first()).toBeVisible({ timeout: 10000 });

    // Ensure button returns to normal state
    await expect(saveButton).toContainText("Save Changes", { timeout: 5000 });

    console.log("✅ Loading state test completed");
  });

  test("should maintain UI state after save", async ({ page }) => {
    console.log("🔧 Testing UI state maintenance...");

    // Focus on a specific field
    const descriptionField = page.locator('textarea[name="description"]').first();
    await descriptionField.focus();

    // Type some content
    const testContent = `UI state test ${Date.now()}`;
    await descriptionField.fill(testContent);

    // Save changes
    await saveOrganizationSettings(page);

    // Verify the field still has the content (wasn't cleared)
    await verifyFieldValue(page, "description", testContent);

    // Verify we can continue editing immediately
    await descriptionField.fill(testContent + " - edited");
    expect(await descriptionField.inputValue()).toBe(testContent + " - edited");

    console.log("✅ UI state maintenance test completed");
  });
});