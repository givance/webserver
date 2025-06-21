import { Page, expect } from "@playwright/test";
import * as common from "./common";

export interface DonorData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  gender?: "Male" | "Female" | "Other";
}

export class DonorsHelper {
  constructor(private page: Page) {}

  async navigateToDonorsPage() {
    await common.navigateToPage(this.page, "/donors");
    await common.waitForDataLoad(this.page);
  }

  async navigateToAddDonor() {
    await this.page.click('a[href="/donors/add"] button:has-text("Add Donor")');
    await this.page.waitForLoadState("networkidle");
  }

  async verifyDonorsPageElements() {
    await common.verifyPageTitle(this.page, "Donor Management");
    await expect(this.page.locator('input[placeholder="Search donors..."]')).toBeVisible();
    await expect(this.page.locator('a[href="/donors/add"] button:has-text("Add Donor")')).toBeVisible();
    
    // Verify table or empty state
    const tableOrEmptyState = this.page.locator('table, text:has-text("No donors found")');
    await expect(tableOrEmptyState.first()).toBeVisible();
    
    // Verify filter controls
    await expect(this.page.locator('label:has-text("List:")')).toBeVisible();
    await expect(this.page.locator('label:has-text("Assigned to:")')).toBeVisible();
    await expect(this.page.locator("input#only-researched")).toBeVisible();
  }

  async createDonor(donor: DonorData) {
    await this.navigateToAddDonor();
    await common.verifyPageTitle(this.page, "Add New Donor");
    
    // Fill required fields
    await this.page.fill('input[placeholder="John"]', donor.firstName);
    await this.page.fill('input[placeholder="Doe"]', donor.lastName);
    await this.page.fill('input[placeholder="john.doe@example.com"]', donor.email);
    
    // Fill optional fields
    if (donor.phone) {
      await this.page.fill('input[placeholder="(555) 123-4567"]', donor.phone);
    }
    
    if (donor.address) {
      await this.page.fill('input[placeholder="123 Main St"]', donor.address);
    }
    
    if (donor.city) {
      await this.page.fill('input[placeholder="New York"]', donor.city);
    }
    
    if (donor.state) {
      await this.page.fill('input[placeholder="NY"]', donor.state);
    }
    
    if (donor.postalCode) {
      await this.page.fill('input[placeholder="10001"]', donor.postalCode);
    }
    
    if (donor.country) {
      await this.page.fill('input[placeholder="United States"]', donor.country);
    }
    
    if (donor.notes) {
      await this.page.fill('textarea[placeholder*="Additional information"]', donor.notes);
    }
    
    if (donor.gender) {
      await common.selectComboboxOption(this.page, "Select gender", donor.gender);
    }
    
    await common.clickPrimaryAction(this.page, "Create Donor");
    await this.page.waitForURL("**/donors");
    await common.waitForPageLoad(this.page);
  }

  async findDonor(searchTerm: string): Promise<boolean> {
    await this.navigateToDonorsPage();
    await common.searchTable(this.page, 'input[placeholder="Search donors..."]', searchTerm);
    
    const donorRow = this.page.locator(`tr:has-text("${searchTerm}")`);
    return await donorRow.isVisible();
  }

  async searchDonors(searchTerm: string) {
    await common.searchTable(this.page, 'input[placeholder="Search donors..."]', searchTerm);
  }

  async clearDonorSearch() {
    await common.clearSearch(this.page, 'input[placeholder="Search donors..."]');
  }

  async viewDonorDetails(donorName?: string) {
    const donorLink = donorName 
      ? this.page.locator(`table tbody tr:has-text("${donorName}") a[href*='/donors/']`).first()
      : this.page.locator("table tbody tr a[href*='/donors/']").first();
    
    await expect(donorLink).toBeVisible({ timeout: 10000 });
    
    const clickedDonorName = await donorLink.textContent();
    await donorLink.click();
    
    await this.page.waitForURL(/\/donors\/\d+$/, { timeout: 10000 });
    await common.waitForPageLoad(this.page);
    
    // Verify we're on the detail page
    const backButton = this.page.locator('a[href="/donors"] button');
    await expect(backButton).toBeVisible({ timeout: 10000 });
    
    return clickedDonorName;
  }

  async verifyDonorDetailElements() {
    // Verify summary cards
    await expect(this.page.locator('text="Total Donated"')).toBeVisible();
    await expect(this.page.locator('text="Total Donations"')).toBeVisible();
    await expect(this.page.locator('text="Last Donation"')).toBeVisible();
    await expect(this.page.locator('text="Communications"')).toBeVisible();
  }

  async editDonorNotes(newNotes: string) {
    const notesHeader = this.page.locator('h4:has-text("Notes")');
    await expect(notesHeader).toBeVisible({ timeout: 10000 });
    
    // Find edit button in the notes header container
    const notesHeaderContainer = this.page.locator('div:has(> h4:has-text("Notes"))');
    const editButton = notesHeaderContainer.locator("button").first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    
    // Wait for edit mode
    await this.page.waitForTimeout(500);
    
    // Update notes
    const notesTextarea = this.page.locator('textarea[placeholder="Add notes about this donor..."]');
    await expect(notesTextarea).toBeVisible({ timeout: 5000 });
    await notesTextarea.clear();
    await notesTextarea.fill(newNotes);
    
    // Save notes
    const saveButton = this.page.locator("button").filter({ has: this.page.locator("svg.lucide-save") });
    await saveButton.click();
    
    await this.page.waitForTimeout(1000);
    
    // Verify notes were updated
    await expect(notesTextarea).not.toBeVisible();
    await expect(this.page.locator(`text="${newNotes}"`)).toBeVisible();
  }

  async editDonorPhone(newPhone: string) {
    const phoneContainer = this.page
      .locator("div")
      .filter({
        has: this.page.locator("svg.lucide-phone"),
      })
      .first();
    
    // Click on the phone value to activate edit mode
    const phoneValue = phoneContainer
      .locator("span, div, p")
      .filter({ hasNotText: /lucide/ })
      .first();
    
    await phoneValue.click();
    await this.page.waitForTimeout(500);
    
    // Find and fill the input
    const phoneInput = this.page.locator('input[type="tel"], input[type="text"]').filter({ hasNotText: /@/ });
    const visiblePhoneInput = phoneInput.first();
    
    if ((await visiblePhoneInput.count()) > 0) {
      await visiblePhoneInput.clear();
      await visiblePhoneInput.fill(newPhone);
      await visiblePhoneInput.press("Enter");
      
      await this.page.waitForTimeout(1000);
      
      // Verify phone was updated
      await expect(phoneContainer).toContainText(newPhone);
      return true;
    }
    return false;
  }

  async filterByList(listOption: string) {
    const listFilterTrigger = this.page
      .locator('[id="list-filter"]')
      .or(this.page.locator('button:has-text("All Lists")'))
      .first();
    
    await listFilterTrigger.click();
    await this.page.waitForTimeout(500);
    
    await common.selectDropdownOption(this.page, listOption);
    await this.page.waitForTimeout(1000);
  }

  async filterByStaff(staffOption: string) {
    const staffFilterTrigger = this.page
      .locator('[id="staff-filter"]')
      .or(this.page.locator('button:has-text("All Staff")'))
      .first();
    
    await staffFilterTrigger.click();
    await this.page.waitForTimeout(500);
    
    await common.selectDropdownOption(this.page, staffOption);
    await this.page.waitForTimeout(1000);
  }

  async toggleResearchedOnly(checked: boolean) {
    const researchedCheckbox = this.page.locator("input#only-researched");
    
    if (checked) {
      await researchedCheckbox.check();
    } else {
      await researchedCheckbox.uncheck();
    }
    
    await this.page.waitForTimeout(1000);
  }

  async selectDonors(count: number) {
    const checkboxes = this.page.locator('table tbody tr input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    
    const selectCount = Math.min(count, checkboxCount);
    for (let i = 0; i < selectCount; i++) {
      await checkboxes.nth(i).check();
      await this.page.waitForTimeout(200);
    }
    
    // Verify selection indicator
    const selectionIndicator = this.page.locator("span").filter({ hasText: /\d+ donors? selected/ });
    await expect(selectionIndicator).toBeVisible({ timeout: 5000 });
    
    return selectCount;
  }

  async createListFromSelected(listName: string) {
    const createListButton = this.page.locator("button").filter({ hasText: /Create List from Selected/ });
    await expect(createListButton).toBeVisible({ timeout: 5000 });
    await createListButton.click();
    
    // Handle dialog
    const dialog = this.page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    
    const listNameInput = dialog.locator("input#list-name");
    await expect(listNameInput).toBeVisible();
    await listNameInput.fill(listName);
    
    const createButton = dialog
      .locator('button:has-text("Create List")')
      .filter({ hasNotText: /from selected/i })
      .last();
    await createButton.click();
    
    // Wait for success
    await common.verifyToast(this.page, /created list/i);
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  }

  async deleteDonor(donorEmail: string) {
    // Search for the donor
    await this.searchDonors(donorEmail);
    
    // Find and delete
    const donorRow = this.page.locator("table tbody tr").first();
    const deleteButton = donorRow.locator('button[aria-label*="Delete"], button:has(svg.lucide-trash)');
    
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      await common.confirmDelete(this.page);
      
      // Verify donor is no longer visible
      await expect(donorRow).not.toBeVisible();
      return true;
    }
    return false;
  }

  async verifyFormValidationErrors() {
    await common.clickPrimaryAction(this.page, "Create Donor");
    
    // Verify validation errors
    await common.verifyFieldError(this.page, "First name must be at least 2 characters");
    await common.verifyFieldError(this.page, "Last name must be at least 2 characters");
    await common.verifyFieldError(this.page, "Invalid email address");
  }

  async getDonorCount(): Promise<number> {
    return await common.getTableRowCount(this.page);
  }

  async verifyDonorInTable(donorData: Partial<DonorData>): Promise<boolean> {
    const donorRow = this.page.locator(`tr:has-text("${donorData.firstName}")`);
    
    if (await donorRow.isVisible()) {
      if (donorData.email) {
        await expect(donorRow.locator(`text="${donorData.email}"`)).toBeVisible();
      }
      return true;
    }
    return false;
  }

  async navigateBackToDonorsList() {
    const backButton = this.page.locator('a[href="/donors"] button').first();
    await backButton.click();
    await this.page.waitForURL("**/donors");
    await common.waitForPageLoad(this.page);
  }
}