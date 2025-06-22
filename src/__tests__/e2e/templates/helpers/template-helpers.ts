import { Page } from "@playwright/test";

export interface TemplateData {
  name: string;
  description?: string;
  content: string;
}

/**
 * Navigate to the templates page
 */
export async function gotoTemplates(page: Page) {
  await page.goto("/settings/templates");
  await page.waitForLoadState("networkidle");
}

/**
 * Create a new template with the provided data
 */
export async function createTemplate(page: Page, template: TemplateData) {
  // Check if we're in empty state or list state
  const emptyState = page.getByText("No templates found. Create your first template to get started.");
  const hasEmptyState = await emptyState.isVisible().catch(() => false);

  // Click the appropriate create button
  if (hasEmptyState) {
    await page.getByRole("button", { name: "Create Your First Template" }).click();
  } else {
    await page.getByRole("button", { name: "Create Template" }).click();
  }

  // Fill in the template form
  await page.getByLabel("Name").fill(template.name);
  
  if (template.description) {
    await page.getByLabel("Description (Optional)").fill(template.description);
  }
  
  await page.getByLabel("Prompt").fill(template.content);

  // Submit the form
  await page.getByRole("button", { name: "Create Template" }).click();

  // Wait for navigation back to list
  await page.waitForURL("/settings/templates");
  await page.waitForLoadState("networkidle");
}

/**
 * Find a template row by name
 */
export async function findTemplateRow(page: Page, templateName: string) {
  return page.locator(`tr:has-text("${templateName}")`);
}

/**
 * Get edit button for a template
 */
export async function getEditButton(page: Page, templateName: string) {
  const templateRow = await findTemplateRow(page, templateName);
  // Look for buttons in the actions column - edit button should be the first one
  return templateRow.locator('td:last-child button').first();
}

/**
 * Get delete button for a template
 */
export async function getDeleteButton(page: Page, templateName: string) {
  const templateRow = await findTemplateRow(page, templateName);
  // Look for buttons in the actions column - delete button should be the second one
  return templateRow.locator('td:last-child button').nth(1);
}

/**
 * Delete a template by name
 */
export async function deleteTemplate(page: Page, templateName: string) {
  const deleteButton = await getDeleteButton(page, templateName);
  await deleteButton.click();
  
  // Confirm deletion in the dialog
  await page.getByRole("button", { name: "Delete" }).click();
  
  // Wait for the dialog to close and the template list to update
  await page.waitForLoadState("networkidle");
  
  // Wait for the dialog to disappear
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 }).catch(() => {});
  
  // Wait a bit more for the list to update
  await page.waitForTimeout(500);
}

/**
 * Edit a template
 */
export async function editTemplate(
  page: Page,
  originalName: string,
  updates: Partial<TemplateData>
) {
  const editButton = await getEditButton(page, originalName);
  await editButton.click();
  await page.waitForLoadState("networkidle");

  // Update fields that are provided
  if (updates.name) {
    await page.getByLabel("Name").clear();
    await page.getByLabel("Name").fill(updates.name);
  }

  if (updates.description !== undefined) {
    await page.getByLabel("Description (Optional)").clear();
    await page.getByLabel("Description (Optional)").fill(updates.description);
  }

  if (updates.content) {
    await page.getByLabel("Prompt").clear();
    await page.getByLabel("Prompt").fill(updates.content);
  }

  // Save changes
  await page.getByRole("button", { name: "Update Template" }).click();
  await page.waitForURL("/settings/templates");
  await page.waitForLoadState("networkidle");
}

/**
 * Check if a template is active
 */
export async function isTemplateActive(page: Page, templateName: string): Promise<boolean> {
  const templateRow = await findTemplateRow(page, templateName);
  // Check if the Active badge is visible, not the Inactive badge
  const activeBadge = templateRow.locator('[role="status"]:has-text("Active"), .badge:has-text("Active")');
  const inactiveBadge = templateRow.locator('[role="status"]:has-text("Inactive"), .badge:has-text("Inactive")');
  
  const hasActive = await activeBadge.isVisible();
  const hasInactive = await inactiveBadge.isVisible();
  
  // If we see Active badge, it's active. If we see Inactive badge, it's not active.
  if (hasActive && !hasInactive) return true;
  if (hasInactive && !hasActive) return false;
  
  // Fallback: check the text content of the status cell
  const statusCell = templateRow.locator('td').nth(2); // Status is the 3rd column (0-indexed)
  const statusText = await statusCell.textContent();
  return statusText?.includes('Active') && !statusText?.includes('Inactive');
}

/**
 * Toggle template status by editing it
 */
export async function toggleTemplateStatus(page: Page, templateName: string) {
  const isActive = await isTemplateActive(page, templateName);
  
  // Edit the template to change its status
  const editButton = await getEditButton(page, templateName);
  await editButton.click();
  await page.waitForLoadState("networkidle");
  
  // Toggle the switch - just click it to toggle regardless of current state
  const switchElement = page.getByRole("switch", { name: "Active" });
  await switchElement.click();
  
  // Save changes
  await page.getByRole("button", { name: "Update Template" }).click();
  await page.waitForURL("/settings/templates");
  await page.waitForLoadState("networkidle");
  
  // Wait a bit for the UI to update
  await page.waitForTimeout(500);
}

/**
 * Generate a unique template name for testing
 */
export function generateTemplateName(prefix: string = "Test Template"): string {
  return `${prefix} ${Date.now()}`;
}

/**
 * Create a test template with default values
 */
export function generateTestTemplate(overrides?: Partial<TemplateData>): TemplateData {
  return {
    name: generateTemplateName(),
    description: "Test template description",
    content: "Dear {donor_name}, thank you for your support of {project_name}.",
    ...overrides,
  };
}

/**
 * Wait for template to appear in list
 */
export async function waitForTemplate(page: Page, templateName: string, timeout = 10000) {
  await page.locator(`tr:has-text("${templateName}")`).waitFor({ state: "visible", timeout });
}

/**
 * Select a template in the campaign creation flow
 */
export async function selectTemplateInCampaign(page: Page, templateName: string) {
  // Wait for template step to load
  await page.waitForSelector('text=Select a Template', { timeout: 10000 });
  
  // Click on the template option
  const templateOption = page.locator(`label:has-text("${templateName}")`);
  await templateOption.click();
  
  // Continue to next step
  await page.getByRole("button", { name: "Continue" }).click();
}

/**
 * Continue campaign creation without selecting a template
 */
export async function continueWithoutTemplate(page: Page) {
  // Wait for template step to load
  await page.waitForSelector('text=Select a Template', { timeout: 10000 });
  
  // Ensure "No Template" is selected (should be default)
  const noTemplateOption = page.locator('label:has-text("No Template")');
  await noTemplateOption.click();
  
  // Continue to next step
  await page.getByRole("button", { name: "Continue" }).click();
}