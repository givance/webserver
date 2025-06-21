import { Page, expect } from "@playwright/test";
import * as common from "./common";

export interface StaffData {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string;
  department?: string;
  whatsappNumbers?: string[];
  signature?: string;
  isRealPerson?: boolean;
  isPrimary?: boolean;
}

export class StaffHelper {
  constructor(private page: Page) {}

  async navigateToStaffPage() {
    await common.navigateToPage(this.page, "/staff");
    await common.waitForDataLoad(this.page);
  }

  async navigateToAddStaff() {
    await this.page.click('a[href="/staff/add"] button');
    await this.page.waitForURL("**/staff/add");
    await this.page.waitForLoadState("networkidle");
  }

  async verifyStaffPageElements() {
    await common.verifyPageTitle(this.page, "Staff Management");
    await expect(this.page.locator('input[placeholder*="Search staff"]')).toBeVisible();
    await expect(this.page.locator('a[href="/staff/add"] button')).toBeVisible();
    
    // Verify table or empty state
    const table = this.page.locator("table");
    const tableExists = (await table.count()) > 0;
    
    if (tableExists) {
      await common.verifyTableHeaders(this.page, ["Name", "Status", "Primary", "Gmail", "Signature"]);
    } else {
      await common.verifyEmptyState(this.page, /no.*staff|empty/i);
    }
    
    // Verify page size selector
    const pageSizeSelector = this.page.locator('button[role="combobox"]').filter({ hasText: /items per page/i });
    await expect(pageSizeSelector).toBeVisible();
  }

  async createStaff(staff: StaffData) {
    await this.navigateToAddStaff();
    
    // Verify we're on the add page
    const addPageFound = await this.verifyAddStaffPage();
    expect(addPageFound).toBe(true);
    
    // Fill required fields
    await this.page.fill('input[placeholder="John"]', staff.firstName);
    await this.page.fill('input[placeholder="Doe"]', staff.lastName);
    await this.page.fill('input[placeholder*="@example.com"]', staff.email);
    
    // Fill optional fields
    if (staff.jobTitle) {
      const jobTitleInput = this.page.locator('input[placeholder*="Manager"]');
      if ((await jobTitleInput.count()) > 0) {
        await jobTitleInput.fill(staff.jobTitle);
      }
    }
    
    if (staff.department) {
      const departmentInput = this.page.locator('input[placeholder*="Marketing"], input[placeholder*="Department"]');
      if ((await departmentInput.count()) > 0) {
        await departmentInput.first().fill(staff.department);
      }
    }
    
    // Add WhatsApp numbers
    if (staff.whatsappNumbers && staff.whatsappNumbers.length > 0) {
      await this.addWhatsAppNumbers(staff.whatsappNumbers);
    }
    
    // Set signature
    if (staff.signature) {
      await this.setSignature(staff.signature);
    }
    
    // Set Real Person checkbox
    if (staff.isRealPerson !== undefined) {
      await this.setRealPersonStatus(staff.isRealPerson);
    }
    
    await common.clickPrimaryAction(this.page, "Create Staff Member");
    await this.page.waitForURL("**/staff");
    await common.waitForPageLoad(this.page);
  }

  async findStaff(searchTerm: string): Promise<boolean> {
    await this.navigateToStaffPage();
    await this.searchStaff(searchTerm);
    
    const staffRow = this.page.locator(`tr:has-text("${searchTerm}")`);
    return await staffRow.isVisible();
  }

  async searchStaff(searchTerm: string) {
    await common.searchTable(this.page, 'input[placeholder*="Search staff"]', searchTerm);
  }

  async clearStaffSearch() {
    await common.clearSearch(this.page, 'input[placeholder*="Search staff"]');
  }

  async viewStaffDetails(staffName?: string) {
    const firstRow = staffName 
      ? this.page.locator(`table tbody tr:has-text("${staffName}")`).first()
      : this.page.locator("table tbody tr").first();
    
    // Try dropdown menu first
    const dropdownTrigger = firstRow.locator('button[aria-haspopup="menu"]');
    if ((await dropdownTrigger.count()) > 0) {
      await dropdownTrigger.click();
      await this.page.waitForTimeout(500);
      await this.page.click('[role="menuitem"]:has-text("View Details")');
    } else {
      // Try direct link
      const nameLink = firstRow.locator("a").first();
      await nameLink.click();
    }
    
    await this.page.waitForURL(/\/staff\/\d+$/);
    await common.waitForPageLoad(this.page);
    
    // Verify we're on the detail page
    const backButton = this.page.locator('a[href="/staff"] button').first();
    await expect(backButton).toBeVisible();
    
    // Verify tabs
    await expect(this.page.locator('[role="tablist"]')).toBeVisible();
    await expect(this.page.locator('[role="tab"]:has-text("Staff Information")')).toBeVisible();
    await expect(this.page.locator('[role="tab"]:has-text("Email Signature")')).toBeVisible();
    await expect(this.page.locator('[role="tab"]:has-text("Email Account")')).toBeVisible();
    await expect(this.page.locator('[role="tab"]:has-text("WhatsApp")')).toBeVisible();
  }

  async editStaffName(newFirstName: string) {
    const firstNameField = this.page
      .locator("div")
      .filter({ has: this.page.locator('label:has-text("First Name")') })
      .locator("[contenteditable], input");
    
    if ((await firstNameField.count()) > 0) {
      await firstNameField.click();
      await firstNameField.fill(newFirstName);
      await firstNameField.press("Enter");
      await this.page.waitForTimeout(1000);
      return true;
    }
    return false;
  }

  async editSignature(newSignature: string) {
    await this.page.click('[role="tab"]:has-text("Email Signature")');
    await this.page.waitForTimeout(500);
    
    const editSignatureButton = this.page.locator('button:has-text("Edit Signature")');
    await editSignatureButton.click();
    await this.page.waitForTimeout(500);
    
    // Update signature
    const signatureEditor = this.page.locator('[contenteditable="true"], .ProseMirror, .tiptap');
    await signatureEditor.clear();
    await signatureEditor.fill(newSignature);
    
    // Save
    await common.clickPrimaryAction(this.page, "Save");
    await this.page.waitForTimeout(1000);
    
    // Verify success
    await common.verifyToast(this.page, /saved|updated/i);
  }

  async editSignatureFromTable(staffIndex: number = 0, newSignature: string) {
    const firstRow = this.page.locator("table tbody tr").nth(staffIndex);
    const signatureEditButton = firstRow
      .locator('button:has-text("Edit"), button:has(svg)')
      .filter({ has: this.page.locator("..").filter({ hasText: /signature/i }) });
    
    if ((await signatureEditButton.count()) > 0) {
      await signatureEditButton.click();
      await this.page.waitForTimeout(500);
      
      // Handle modal
      const modal = await common.openModal(this.page, "");
      
      const editor = modal.locator('[contenteditable="true"], .ProseMirror, .tiptap');
      await editor.clear();
      await editor.fill(newSignature);
      
      await modal.locator('button:has-text("Save")').click();
      await this.page.waitForTimeout(1000);
      
      // Verify status changed
      await expect(firstRow.locator('text="Set"')).toBeVisible();
      return true;
    }
    return false;
  }

  async togglePrimaryStatus(staffIndex: number = 0) {
    const firstRow = this.page.locator("table tbody tr").nth(staffIndex);
    const primarySwitch = firstRow.locator('button[role="switch"]');
    
    if ((await primarySwitch.count()) > 0) {
      const currentState = await primarySwitch.getAttribute("data-state");
      await primarySwitch.click();
      await this.page.waitForTimeout(1000);
      
      const newState = await primarySwitch.getAttribute("data-state");
      expect(newState).not.toBe(currentState);
      
      if (newState === "checked") {
        await expect(firstRow.locator('span:has-text("Primary")')).toBeVisible();
      }
      
      return { previousState: currentState, newState };
    }
    return null;
  }

  async deleteStaff(staffEmail: string) {
    // Search for staff
    await this.searchStaff(staffEmail);
    
    const staffRow = this.page.locator("table tbody tr").first();
    
    // Open dropdown menu
    const dropdownTrigger = staffRow.locator('button[aria-haspopup="menu"]');
    await dropdownTrigger.click();
    await this.page.waitForTimeout(500);
    
    // Click Delete
    await this.page.click('[role="menuitem"]:has-text("Delete")');
    
    // Confirm deletion
    await common.confirmDelete(this.page);
    await this.page.waitForTimeout(2000);
    
    // Verify deletion
    const tableRows = this.page.locator("table tbody tr");
    const currentRowCount = await tableRows.count();
    
    if (currentRowCount === 0) {
      return true;
    } else {
      const deletedEmailLocator = this.page.locator(`text="${staffEmail}"`);
      await expect(deletedEmailLocator).not.toBeVisible();
      return true;
    }
  }

  async manageWhatsAppNumbers(phoneNumbers: string[]) {
    await this.page.click('[role="tab"]:has-text("WhatsApp")');
    await this.page.waitForTimeout(500);
    
    for (const phoneNumber of phoneNumbers) {
      const addPhoneButton = this.page.locator('button:has-text("Add Phone Number")');
      if ((await addPhoneButton.count()) > 0) {
        await addPhoneButton.click();
        await this.page.waitForTimeout(500);
        
        const phoneInput = this.page.locator('input[type="tel"], input[placeholder*="phone"]').last();
        await phoneInput.fill(phoneNumber);
        
        const saveButton = this.page.locator('button:has-text("Save"), button:has-text("Add")').last();
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await this.page.waitForTimeout(1000);
        }
      }
    }
    
    // Verify numbers were added
    for (const phoneNumber of phoneNumbers) {
      await expect(this.page.locator(`text="${phoneNumber}"`)).toBeVisible();
    }
  }

  async verifyFormValidationErrors() {
    await common.clickPrimaryAction(this.page, "Create Staff Member");
    
    // Verify validation errors
    await expect(this.page.locator("text=/required|must be/i").first()).toBeVisible({ timeout: 5000 });
    
    // Test invalid email
    await this.page.fill('input[placeholder="John"]', "Test");
    await this.page.fill('input[placeholder="Doe"]', "User");
    await this.page.fill('input[placeholder*="@example.com"]', "invalid-email");
    await common.clickPrimaryAction(this.page, "Create Staff Member");
    
    await expect(this.page.locator("text=/invalid.*email|email.*invalid/i")).toBeVisible();
  }

  async getStaffCount(): Promise<number> {
    return await common.getTableRowCount(this.page);
  }

  async verifyStaffInTable(staffData: Partial<StaffData>): Promise<boolean> {
    const staffRow = this.page.locator(`tr:has-text("${staffData.firstName}")`);
    
    if (await staffRow.isVisible()) {
      if (staffData.email) {
        await expect(staffRow.locator(`text="${staffData.email}"`)).toBeVisible();
      }
      return true;
    }
    return false;
  }

  // Private helper methods
  private async verifyAddStaffPage(): Promise<boolean> {
    const addPageIndicators = [
      'h1:has-text("Add New Staff Member")',
      'h1:has-text("Add Staff")',
      'h1:has-text("Create Staff")',
      'h2:has-text("Add Staff")',
      'text="First Name"',
      'text="Last Name"',
      'text="Email"',
    ];
    
    for (const selector of addPageIndicators) {
      const element = this.page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        return true;
      }
    }
    return false;
  }

  private async addWhatsAppNumbers(phoneNumbers: string[]) {
    const addPhoneButton = this.page.locator('button:has-text("Add Phone")');
    if ((await addPhoneButton.count()) > 0 && (await addPhoneButton.isVisible())) {
      for (const phoneNumber of phoneNumbers) {
        await addPhoneButton.click();
        await this.page.waitForTimeout(500);
        
        const phoneInput = this.page.locator('input[type="tel"], input[placeholder*="phone"]').last();
        const phoneInputVisible = await phoneInput.isVisible().catch(() => false);
        if (phoneInputVisible) {
          await phoneInput.fill(phoneNumber);
        }
      }
    }
  }

  private async setSignature(signature: string) {
    const signatureEditor = this.page.locator('[contenteditable="true"], .ProseMirror, .tiptap');
    if ((await signatureEditor.count()) > 0) {
      await signatureEditor.click();
      await signatureEditor.fill(signature);
    }
  }

  private async setRealPersonStatus(isRealPerson: boolean) {
    const realPersonCheckbox = this.page
      .locator('input[type="checkbox"]')
      .filter({ has: this.page.locator("..").filter({ hasText: /real.*person/i }) });
    
    if ((await realPersonCheckbox.count()) > 0) {
      if (isRealPerson) {
        await realPersonCheckbox.check();
      } else {
        await realPersonCheckbox.uncheck();
      }
    }
  }
}