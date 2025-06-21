import { Page, expect } from "@playwright/test";
import * as common from "./common";

export interface DonationData {
  amount: string;
  donorName?: string;
  projectName?: string;
  date?: string;
  notes?: string;
}

export class DonationsHelper {
  constructor(private page: Page) {}

  async navigateToDonationsPage() {
    await common.navigateToPage(this.page, "/donations");
    await common.waitForDataLoad(this.page);
  }

  async navigateToAddDonation() {
    await this.page.click('a[href="/donations/add"] button:has-text("Add Donation")');
    await this.page.waitForLoadState("networkidle");
  }

  async verifyDonationsPageElements() {
    await common.verifyPageTitle(this.page, "Donations");
    await expect(this.page.locator('a[href="/donations/add"] button:has-text("Add Donation")')).toBeVisible();
    
    // Verify table or empty state
    const tableOrEmptyState = this.page.locator('table, text:has-text("No donations"), text:has-text("No results")');
    await expect(tableOrEmptyState.first()).toBeVisible();
    
    // Verify page size selector
    await expect(this.page.locator('button:has-text("items per page"), [aria-label*="page size"]')).toBeVisible();
  }

  async verifyDonationTableStructure() {
    const table = this.page.locator("table");
    const tableExists = (await table.count()) > 0;

    if (tableExists) {
      await common.verifyTableHeaders(this.page, ["Date", "Amount", "Donor", "Project", "Actions"]);
    }
    return tableExists;
  }

  async createDonation(data: DonationData) {
    await this.navigateToAddDonation();
    
    // Fill form fields based on available data
    if (data.amount) {
      await this.page.fill('input[name="amount"]', data.amount);
    }
    
    if (data.donorName) {
      await common.selectComboboxOption(this.page, "Select donor", data.donorName);
    }
    
    if (data.projectName) {
      await common.selectComboboxOption(this.page, "Select project", data.projectName);
    }
    
    if (data.date) {
      await this.page.fill('input[type="date"]', data.date);
    }
    
    if (data.notes) {
      await this.page.fill('textarea[name="notes"]', data.notes);
    }
    
    await common.clickPrimaryAction(this.page, "Create Donation");
    await this.page.waitForURL("**/donations");
  }

  async findDonation(searchCriteria: Partial<DonationData>): Promise<boolean> {
    await this.navigateToDonationsPage();
    
    // If searching by amount or donor name, use table search
    if (searchCriteria.amount || searchCriteria.donorName) {
      const searchTerm = searchCriteria.amount || searchCriteria.donorName || "";
      await common.searchTable(this.page, 'input[placeholder*="Search"]', searchTerm);
    }
    
    // Check if donation exists in table
    const rowCount = await common.getTableRowCount(this.page);
    return rowCount > 0;
  }

  async viewDonationDetails(donationIndex: number = 0) {
    const viewButton = this.page.locator("table tbody tr").nth(donationIndex).locator('button:has-text("View")');
    
    if ((await viewButton.count()) > 0) {
      await viewButton.click();
      await this.page.waitForURL(/\/donations\/\d+$/);
      return true;
    }
    return false;
  }

  async editDonation(donationIndex: number = 0, updates: Partial<DonationData>) {
    const editButton = this.page.locator("table tbody tr").nth(donationIndex).locator('button:has-text("Edit")');
    
    if ((await editButton.count()) > 0) {
      await editButton.click();
      await this.page.waitForURL(/\/donations\/\d+\/edit$/);
      
      // Update fields
      if (updates.amount) {
        await this.page.fill('input[name="amount"]', updates.amount);
      }
      
      if (updates.notes) {
        await this.page.fill('textarea[name="notes"]', updates.notes);
      }
      
      await common.clickPrimaryAction(this.page, "Update Donation");
      return true;
    }
    return false;
  }

  async deleteDonation(donationIndex: number = 0) {
    const deleteButton = this.page.locator("table tbody tr").nth(donationIndex).locator('button:has-text("Delete")');
    
    if ((await deleteButton.count()) > 0) {
      await deleteButton.click();
      await common.confirmDelete(this.page);
      return true;
    }
    return false;
  }

  async navigateToDonorFromDonation(donationIndex: number = 0) {
    const donorLink = this.page.locator('table tbody tr').nth(donationIndex).locator('a[href^="/donors/"]');
    
    if ((await donorLink.count()) > 0) {
      const donorName = await donorLink.textContent();
      await donorLink.click();
      await this.page.waitForURL(/\/donors\/\d+$/);
      await this.page.waitForLoadState("networkidle");
      return donorName;
    }
    return null;
  }

  async navigateToProjectFromDonation(donationIndex: number = 0) {
    const projectLink = this.page.locator('table tbody tr').nth(donationIndex).locator('a[href^="/projects/"]');
    
    if ((await projectLink.count()) > 0) {
      const projectName = await projectLink.textContent();
      await projectLink.click();
      await this.page.waitForURL(/\/projects\/\d+$/);
      await this.page.waitForLoadState("networkidle");
      return projectName;
    }
    return null;
  }

  async filterByDonor(donorId: string, donorName: string) {
    await this.page.goto(`/donations?donorId=${donorId}`);
    await common.waitForPageLoad(this.page);
    
    // Verify filter is active
    const filterSection = this.page.locator('div:has-text("Active filters:")');
    if (await filterSection.isVisible()) {
      const filterBadge = filterSection.locator("button").filter({ hasText: /Donor:/ });
      await expect(filterBadge.first()).toBeVisible();
      await expect(filterBadge.first()).toContainText(donorName);
      return true;
    }
    return false;
  }

  async clearDonorFilter() {
    const filterSection = this.page.locator('div:has-text("Active filters:")');
    if (await filterSection.isVisible()) {
      const filterBadge = filterSection.locator("button").filter({ hasText: /Donor:/ });
      await filterBadge.first().click();
      await this.page.waitForTimeout(1000);
      await expect(this.page).toHaveURL("/donations");
    }
  }

  async sortByDate() {
    const dateHeader = this.page.locator('button:has-text("Date")').first();
    if (await dateHeader.isVisible()) {
      await dateHeader.click();
      await this.page.waitForTimeout(1000);
      return true;
    }
    return false;
  }

  async sortByAmount() {
    const amountHeader = this.page.locator('button:has-text("Amount")').first();
    if (await amountHeader.isVisible()) {
      await amountHeader.click();
      await this.page.waitForTimeout(1000);
      return true;
    }
    return false;
  }

  async getDonationAmounts(): Promise<string[]> {
    const amounts = await this.page.locator("table tbody tr td:nth-child(2)").allTextContents();
    return amounts;
  }

  async getDonationDates(): Promise<string[]> {
    const dates = await this.page.locator("table tbody tr td:first-child").allTextContents();
    return dates;
  }

  async testPagination() {
    const paginationControls = this.page.locator('[aria-label*="pagination"], [class*="pagination"]');
    
    if (await paginationControls.isVisible()) {
      // Change page size
      await common.selectPageSize(this.page, 10);
      
      // Try next page if available
      const nextButton = this.page.locator('button[aria-label*="next"], button:has-text("Next")');
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        await this.page.waitForTimeout(1000);
        
        const pageIndicator = this.page.locator("text=/Page \\d+ of \\d+/");
        if (await pageIndicator.isVisible()) {
          await expect(pageIndicator).toContainText("Page 2");
        }
        return true;
      }
    }
    return false;
  }

  async verifyEmptyDonationsList() {
    await this.page.goto("/donations?donorId=999999");
    await common.waitForPageLoad(this.page);
    
    const table = this.page.locator("table");
    const tableExists = (await table.count()) > 0;
    
    if (tableExists) {
      await expect(table).toBeVisible();
    } else {
      const emptyState = this.page.locator("div, p, span").filter({ hasText: /no.*donation|no.*result|empty|nothing/i });
      expect(tableExists || (await emptyState.count()) > 0).toBeTruthy();
    }
  }

  async getDonationCount(): Promise<number> {
    return await common.getTableRowCount(this.page);
  }

  async verifyDonationAmount(rowIndex: number, expectedAmount: string) {
    const amountCell = this.page.locator("table tbody tr").nth(rowIndex).locator("td:nth-child(2)");
    await expect(amountCell).toContainText(expectedAmount);
  }

  async verifyDonationExists(criteria: { amount?: string; donorName?: string; projectName?: string }) {
    const rows = this.page.locator("table tbody tr");
    const rowCount = await rows.count();
    
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      let matches = true;
      
      if (criteria.amount) {
        const amountText = await row.locator("td:nth-child(2)").textContent();
        if (!amountText?.includes(criteria.amount)) matches = false;
      }
      
      if (criteria.donorName) {
        const donorText = await row.locator('a[href^="/donors/"]').textContent();
        if (!donorText?.includes(criteria.donorName)) matches = false;
      }
      
      if (criteria.projectName) {
        const projectText = await row.locator('a[href^="/projects/"]').textContent();
        if (!projectText?.includes(criteria.projectName)) matches = false;
      }
      
      if (matches) return true;
    }
    
    return false;
  }
}