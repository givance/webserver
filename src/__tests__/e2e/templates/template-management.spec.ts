import { test, expect } from "@playwright/test";
import { cleanupBetweenTests } from "../setup/test-cleanup";
import {
  createTemplate,
  deleteTemplate,
  editTemplate,
  generateTestTemplate,
  gotoTemplates,
  isTemplateActive,
  toggleTemplateStatus,
  waitForTemplate,
} from "./helpers/template-helpers";

test.describe("Template Management", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupBetweenTests();
    await gotoTemplates(page);
  });

  test.afterEach(async () => {
    await cleanupBetweenTests();
  });

  test("should be able to add a new template and see it in the list immediately", async ({
    page,
  }) => {
    // Generate test template data
    const template = generateTestTemplate({
      description: "This is a test template for e2e testing",
      content: "Dear {donor_name}, thank you for your continued support...",
    });

    // Create the template
    await createTemplate(page, template);

    // Verify the template appears in the list
    await waitForTemplate(page, template.name);

    // Verify description is visible
    await expect(page.locator(`text=${template.description}`)).toBeVisible();

    // Verify the template is active by default
    const isActive = await isTemplateActive(page, template.name);
    expect(isActive).toBe(true);
  });

  test("should be able to delete a template", async ({ page }) => {
    // Create a template to delete
    const template = generateTestTemplate({
      name: "Test Delete Template " + Date.now(),
      description: "Template to be deleted",
      content: "This template will be deleted",
    });

    await createTemplate(page, template);

    // Verify template was created
    await waitForTemplate(page, template.name);

    // Delete the template
    await deleteTemplate(page, template.name);

    // Verify template is removed from the list (specifically check table rows)
    await expect(page.locator(`tr:has-text("${template.name}")`)).not.toBeVisible({ timeout: 10000 });

    // If it was the last template, verify empty state
    const templatesCount = await page.locator('tr').count();
    if (templatesCount <= 1) { // Only header row remains
      await expect(page.getByText("No templates found. Create your first template to get started.")).toBeVisible();
    }
  });

  test("should be able to edit a template and save changes", async ({ page }) => {
    // Create a template to edit
    const originalTemplate = generateTestTemplate({
      name: "Test Edit Template " + Date.now(),
      description: "Original description",
      content: "Original content",
    });

    await createTemplate(page, originalTemplate);
    await waitForTemplate(page, originalTemplate.name);

    // Define updates
    const updates = {
      name: "Updated Template " + Date.now(),
      description: "This template has been updated",
      content: "Updated content for the template",
    };

    // Edit the template
    await editTemplate(page, originalTemplate.name, updates);

    // Verify updated name is visible
    await expect(page.locator(`text=${updates.name}`)).toBeVisible({ timeout: 10000 });
    
    // Verify updated description is visible
    await expect(page.locator(`text=${updates.description}`)).toBeVisible();

    // Verify original name is no longer visible
    await expect(page.locator(`text=${originalTemplate.name}`)).not.toBeVisible();

    // Click edit again to verify content was saved
    const editButton = page.locator(`tr:has-text("${updates.name}")`).locator('button:has(svg)').first();
    await editButton.click();

    // Verify all fields have the updated values
    await expect(page.getByLabel("Name")).toHaveValue(updates.name);
    await expect(page.getByLabel("Description (Optional)")).toHaveValue(updates.description);
    await expect(page.getByLabel("Prompt")).toHaveValue(updates.content);
  });

  test("should be able to toggle template active status", async ({ page }) => {
    // Create a template
    const template = generateTestTemplate({
      name: "Test Toggle Template " + Date.now(),
      description: "Template for testing active toggle",
      content: "Test content",
    });

    await createTemplate(page, template);
    await waitForTemplate(page, template.name);

    // Verify it's active by default
    let isActive = await isTemplateActive(page, template.name);
    expect(isActive).toBe(true);

    // Toggle to inactive
    await toggleTemplateStatus(page, template.name);

    // Verify it's now inactive
    isActive = await isTemplateActive(page, template.name);
    expect(isActive).toBe(false);

    // Toggle back to active
    await toggleTemplateStatus(page, template.name);

    // Verify it's active again
    isActive = await isTemplateActive(page, template.name);
    expect(isActive).toBe(true);
  });
});