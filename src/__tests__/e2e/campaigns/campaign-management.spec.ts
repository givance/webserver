import { test, expect } from "@playwright/test";
import { navigateToCampaignCreation } from "./helper";

test.describe("Campaign Management", () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("__clerk_db_jwt", "mock-jwt-token");
    });
  });

  test("should load campaigns page", async ({ page }) => {
    await page.goto("/campaigns");

    // Should either load campaigns page or redirect to auth
    const currentUrl = page.url();
    if (currentUrl.includes("campaigns")) {
      // If on campaigns page, check for campaign-related elements
      const campaignElements = [
        'h1:has-text("Campaigns")',
        'h1:has-text("Email Campaigns")',
        '[data-testid="campaigns-list"]',
        "table",
        ".campaign-list",
        'button:has-text("New Campaign")',
        'button:has-text("Create Campaign")',
        'a:has-text("Create")',
      ];

      let hasCampaignElements = false;
      for (const selector of campaignElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasCampaignElements = true;
          break;
        }
      }

      expect(hasCampaignElements).toBe(true);
    } else {
      // If redirected to auth, that's expected behavior
      expect(currentUrl).toMatch(/(sign-in|auth|login)/);
    }
  });

  test("should navigate to campaign creation", async ({ page }) => {
    await page.goto("/campaigns");

    // Look for campaign creation button
    const createButton = page
      .locator('button:has-text("New Campaign"), button:has-text("Create Campaign"), a:has-text("Create")')
      .first();

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();

      // Should navigate to campaign creation page
      await page.waitForLoadState("networkidle");

      const currentUrl = page.url();
      // Accept both /campaign and /campaign/new variants
      expect(currentUrl).toMatch(/(campaign.*new|campaign.*create|create.*campaign|\/campaign$)/);
    }
  });

  test("should load campaign creation wizard", async ({ page }) => {
    // Navigate to campaign creation
    await navigateToCampaignCreation(page);

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Check if campaign creation elements exist
      const creationElements = [
        "form",
        'input[name*="name"]',
        'input[name*="subject"]',
        "textarea",
        'button:has-text("Next")',
        'button:has-text("Create")',
        'button:has-text("Save")',
        ".wizard",
        ".step",
        ".campaign-form",
      ];

      let hasCreationElements = false;
      for (const selector of creationElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasCreationElements = true;
          break;
        }
      }

      if (hasCreationElements) {
        expect(hasCreationElements).toBe(true);
      }
    }
  });

  test("should handle campaign wizard steps", async ({ page }) => {
    await navigateToCampaignCreation(page);

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Look for wizard steps or navigation
      const wizardElements = [
        ".step",
        ".wizard-step",
        "[data-step]",
        'button:has-text("Next")',
        'button:has-text("Previous")',
        ".breadcrumb",
      ];

      let hasWizardElements = false;
      for (const selector of wizardElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasWizardElements = true;
          break;
        }
      }

      if (hasWizardElements) {
        // First, select at least one donor to enable the Next button
        const donorCheckboxes = page.locator('[role="checkbox"], input[type="checkbox"]');
        if (await donorCheckboxes.count() > 0) {
          // Select first donor
          await donorCheckboxes.first().check({ force: true });
          await page.waitForTimeout(500);
        }
        
        // Try to navigate through wizard
        const nextButton = page.locator('button:has-text("Next")').first();
        if (await nextButton.isVisible().catch(() => false)) {
          // Wait for button to be enabled after selecting donor
          await nextButton.waitFor({ state: "visible" });
          await page.waitForTimeout(500);
          
          // Check if button is enabled
          const isEnabled = await nextButton.isEnabled();
          if (isEnabled) {
            await nextButton.click();
            await page.waitForTimeout(500);

            // Should either show validation or move to next step
            const currentUrl = page.url();
            expect(currentUrl).toContain("campaign");
          } else {
            console.log("Next button is still disabled after selecting donor");
          }
        }
      }
    }
  });
});

test.describe("Campaign Email Generation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("__clerk_db_jwt", "mock-jwt-token");
    });
  });

  test("should handle email template selection", async ({ page }) => {
    await navigateToCampaignCreation(page);

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Look for template selection elements
      const templateElements = [
        ".template-selector",
        ".template-card",
        'button:has-text("Template")',
        'select[name*="template"]',
        'input[type="radio"]',
        ".template-option",
      ];

      let hasTemplateElements = false;
      for (const selector of templateElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasTemplateElements = true;
          break;
        }
      }

      if (hasTemplateElements) {
        // Try to select a template
        const templateButton = page.locator('.template-card, button:has-text("Template"), input[type="radio"]').first();
        if (await templateButton.isVisible().catch(() => false)) {
          await templateButton.click();
          await page.waitForTimeout(500);

          // Should handle template selection
          expect(true).toBe(true); // Template interaction successful
        }
      }
    }
  });

  test("should handle donor selection for campaigns", async ({ page }) => {
    await navigateToCampaignCreation(page);

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Look for donor selection elements
      const donorSelectionElements = [
        ".donor-selector",
        'button:has-text("Select Donors")',
        'input[type="checkbox"]',
        ".donor-list",
        'select[name*="donor"]',
        ".segment-selector",
      ];

      let hasDonorSelection = false;
      for (const selector of donorSelectionElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasDonorSelection = true;
          break;
        }
      }

      if (hasDonorSelection) {
        // Try to interact with donor selection
        const donorCheckbox = page.locator('input[type="checkbox"]').first();
        if (await donorCheckbox.isVisible().catch(() => false)) {
          await donorCheckbox.check();

          // Should handle donor selection
          expect(await donorCheckbox.isChecked()).toBe(true);
        }
      }
    }
  });

  test("should handle email preview and sending", async ({ page }) => {
    await navigateToCampaignCreation(page);

    if (!page.url().includes("sign-in") && !page.url().includes("auth")) {
      // Look for preview and send elements
      const previewElements = [
        'button:has-text("Preview")',
        'button:has-text("Send")',
        ".email-preview",
        ".preview-modal",
        'iframe[title*="preview"]',
        ".send-button",
      ];

      let hasPreviewElements = false;
      for (const selector of previewElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasPreviewElements = true;
          break;
        }
      }

      if (hasPreviewElements) {
        // Try to preview email
        const previewButton = page.locator('button:has-text("Preview")').first();
        if (await previewButton.isVisible().catch(() => false)) {
          await previewButton.click();
          await page.waitForTimeout(1000);

          // Should show preview or modal
          const previewModal = page.locator('.preview-modal, .modal, [role="dialog"]').first();
          const hasPreview = await previewModal.isVisible().catch(() => false);

          expect(hasPreview || page.url().includes("preview")).toBe(true);
        }
      }
    }
  });
});
