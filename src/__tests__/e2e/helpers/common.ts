import { Page, expect } from "@playwright/test";

/**
 * Common navigation utilities used by component-specific helpers
 */

export async function navigateToPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

export async function waitForDebounce(page: Page, ms: number = 500) {
  await page.waitForTimeout(ms);
}

export async function fillAndSubmitForm(
  page: Page,
  fields: Record<string, string>,
  submitButtonText: string
) {
  for (const [selector, value] of Object.entries(fields)) {
    await page.fill(selector, value);
  }
  await page.click(`button:has-text("${submitButtonText}")`);
}

export async function openDropdownMenu(page: Page, triggerSelector: string) {
  await page.click(triggerSelector);
  await page.waitForTimeout(500);
}

export async function selectDropdownOption(page: Page, optionText: string) {
  await page.click(`[role="option"]:has-text("${optionText}")`);
}

export async function openModal(page: Page, triggerSelector: string) {
  await page.click(triggerSelector);
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  return modal;
}

export async function closeModal(page: Page) {
  const modal = page.locator('[role="dialog"]');
  await expect(modal).not.toBeVisible();
}

export async function confirmDelete(page: Page) {
  const confirmDialog = page.locator('[role="alertdialog"]');
  await expect(confirmDialog).toBeVisible();
  const confirmButton = confirmDialog.locator('button:has-text("Delete")').last();
  await confirmButton.click();
  await page.waitForTimeout(1000);
}

export async function verifyToast(page: Page, messagePattern: string | RegExp) {
  const toast = page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: messagePattern });
  await expect(toast.first()).toBeVisible({ timeout: 5000 });
}

export async function clickTableAction(
  page: Page,
  rowSelector: string,
  actionText: string
) {
  const row = page.locator(rowSelector);
  const actionButton = row.locator(`button:has-text("${actionText}")`);
  await actionButton.click();
}

export async function searchTable(page: Page, searchInputSelector: string, searchTerm: string) {
  await page.fill(searchInputSelector, searchTerm);
  await waitForDebounce(page, 1000);
}

export async function clearSearch(page: Page, searchInputSelector: string) {
  await page.fill(searchInputSelector, "");
  await waitForDebounce(page, 1000);
}

export async function selectPageSize(page: Page, size: number) {
  const pageSizeSelector = page.locator('button[role="combobox"]').filter({ hasText: /items per page/i });
  await pageSizeSelector.click();
  await page.click(`[role="option"]:has-text("${size} items per page")`);
  await page.waitForTimeout(1000);
}

export async function verifyTableHeaders(page: Page, expectedHeaders: string[]) {
  for (const header of expectedHeaders) {
    await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
  }
}

export async function getTableRowCount(page: Page): Promise<number> {
  const rows = page.locator("table tbody tr");
  return await rows.count();
}

export async function verifyEmptyState(page: Page, emptyTextPattern: string | RegExp) {
  const emptyState = page.locator("text=" + emptyTextPattern);
  await expect(emptyState.first()).toBeVisible();
}

export async function clickPrimaryAction(page: Page, actionText: string) {
  await page.click(`button:has-text("${actionText}")`);
}

export async function navigateViaLink(page: Page, linkText: string) {
  await page.click(`a:has-text("${linkText}")`);
}

export async function verifyPageTitle(page: Page, titleText: string) {
  await expect(page.locator(`h1:has-text("${titleText}")`)).toBeVisible();
}

export async function verifyBreadcrumb(page: Page, breadcrumbText: string) {
  await expect(page.locator(`nav a:has-text("${breadcrumbText}")`)).toBeVisible();
}

export async function toggleSwitch(page: Page, switchSelector: string) {
  const switchElement = page.locator(switchSelector);
  const currentState = await switchElement.getAttribute("data-state");
  await switchElement.click();
  await page.waitForTimeout(500);
  return currentState;
}

export async function selectComboboxOption(page: Page, comboboxLabel: string, optionText: string) {
  const combobox = page.locator(`button:has-text("${comboboxLabel}")`);
  await combobox.click();
  await page.waitForTimeout(500);
  await selectDropdownOption(page, optionText);
}

export async function verifyFieldError(page: Page, errorText: string) {
  await expect(page.locator(`text="${errorText}"`)).toBeVisible();
}

export async function waitForDataLoad(page: Page) {
  // Wait for any loading indicators to disappear
  const loadingIndicators = page.locator('text="Loading...", .loading, [data-loading="true"]');
  const count = await loadingIndicators.count();
  if (count > 0) {
    await expect(loadingIndicators.first()).not.toBeVisible({ timeout: 10000 });
  }
  await page.waitForTimeout(1000);
}