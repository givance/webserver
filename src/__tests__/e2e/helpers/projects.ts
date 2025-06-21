import { Page, expect } from "@playwright/test";
import * as common from "./common";

export interface ProjectData {
  name: string;
  description: string;
  goal: string;
  tags?: string[];
  active?: boolean;
  status?: "active" | "completed" | "on-hold";
}

export class ProjectsHelper {
  constructor(private page: Page) {}

  async navigateToProjectsPage() {
    await common.navigateToPage(this.page, "/projects");
    await common.waitForDataLoad(this.page);
  }

  async navigateToAddProject() {
    await this.page.click('a[href="/projects/add"] button:has-text("Add Project")');
    await this.page.waitForURL("**/projects/add");
    await this.page.waitForLoadState("networkidle");
  }

  async verifyProjectsPageElements() {
    await common.verifyPageTitle(this.page, "Project Management");
    await expect(this.page.locator('a[href="/projects/add"] button:has-text("Add Project")')).toBeVisible();
    await expect(this.page.locator('input[placeholder*="Search projects"]')).toBeVisible();
    
    // Verify table or empty state
    const tableOrEmptyState = this.page.locator('table, text:has-text("No projects"), text:has-text("No results")');
    await expect(tableOrEmptyState.first()).toBeVisible();
    
    // Verify page size selector
    const pageSizeSelector = this.page.locator('button[role="combobox"]').filter({ hasText: /items per page/i });
    await expect(pageSizeSelector).toBeVisible();
    
    // Verify Campaign button
    const mainCampaignButton = this.page.getByRole("main").getByRole("button", { name: "Campaign" });
    await expect(mainCampaignButton).toBeVisible();
  }

  async createProject(project: ProjectData) {
    await this.navigateToAddProject();
    await common.verifyPageTitle(this.page, "Add New Project");
    
    // Fill project name
    const nameInput = this.page
      .locator("input")
      .filter({ has: this.page.locator("..").filter({ hasText: "Name" }) })
      .first();
    await nameInput.fill(project.name);
    
    // Fill description
    const descriptionTextarea = this.page
      .locator("textarea")
      .filter({ has: this.page.locator("..").filter({ hasText: "Description" }) })
      .first();
    await descriptionTextarea.fill(project.description);
    
    // Fill goal amount
    const goalInput = this.page
      .locator('input[type="number"]')
      .filter({ has: this.page.locator("..").filter({ hasText: "Fundraising Goal" }) })
      .first();
    await goalInput.fill(project.goal);
    
    // Add tags if provided
    if (project.tags && project.tags.length > 0) {
      const tagInput = this.page.locator('input[placeholder*="tag"]');
      if (await tagInput.isVisible()) {
        for (const tag of project.tags) {
          await tagInput.fill(tag);
          await tagInput.press("Enter");
          await this.page.waitForTimeout(500);
        }
      }
    }
    
    // Verify active switch (default should be checked)
    const activeSwitch = this.page.locator('button[role="switch"]');
    await expect(activeSwitch).toHaveAttribute("data-state", "checked");
    
    // Toggle if needed
    if (project.active === false) {
      await activeSwitch.click();
    }
    
    await common.clickPrimaryAction(this.page, "Create Project");
    await this.page.waitForURL("**/projects");
    await common.waitForPageLoad(this.page);
  }

  async findProject(projectName: string): Promise<boolean> {
    await this.navigateToProjectsPage();
    await this.searchProjects(projectName);
    
    const projectRow = this.page.locator(`tr:has-text("${projectName}")`);
    return await projectRow.isVisible();
  }

  async searchProjects(searchTerm: string) {
    await common.searchTable(this.page, 'input[placeholder*="Search projects"]', searchTerm);
  }

  async clearProjectSearch() {
    await common.clearSearch(this.page, 'input[placeholder*="Search projects"]');
  }

  async viewProjectDetails(projectName?: string) {
    const projectLink = projectName
      ? this.page.locator(`table tbody tr:has-text("${projectName}") a[href^="/projects/"]`).first()
      : this.page.locator('table tbody tr a[href^="/projects/"]').first();
    
    const clickedProjectName = await projectLink.textContent();
    await projectLink.click();
    
    await this.page.waitForURL(/\/projects\/\d+$/);
    await common.waitForPageLoad(this.page);
    
    // Verify we're on the detail page
    await expect(this.page.locator(`h1:has-text("${clickedProjectName}")`)).toBeVisible();
    await expect(this.page.locator('button:has-text("Edit")')).toBeVisible();
    await expect(this.page.locator('button:has-text("Delete")')).toBeVisible();
    
    return clickedProjectName;
  }

  async editProject(updates: Partial<ProjectData>) {
    // Click Edit button
    await common.clickPrimaryAction(this.page, "Edit");
    await this.page.waitForTimeout(500);
    
    // Update fields
    if (updates.name) {
      await this.page.fill('input[name="name"]', updates.name);
    }
    
    if (updates.description) {
      await this.page.fill('textarea[name="description"]', updates.description);
    }
    
    if (updates.goal) {
      const goalInput = this.page.locator('input[name="goal"]');
      if (await goalInput.isVisible()) {
        await goalInput.clear();
        await goalInput.fill(updates.goal);
      }
    }
    
    if (updates.active !== undefined) {
      const activeCheckbox = this.page.locator('input[type="checkbox"][name="active"]');
      if (await activeCheckbox.isVisible()) {
        await activeCheckbox.click();
      }
    }
    
    await common.clickPrimaryAction(this.page, "Update Project");
    await this.page.waitForTimeout(2000);
    
    // Verify we're back to viewing mode
    await expect(this.page.locator('button:has-text("Edit")')).toBeVisible({ timeout: 10000 });
  }

  async deleteProject(projectName: string) {
    // Search for the project
    await this.searchProjects(projectName);
    
    // Find and delete
    const projectRow = this.page.locator("table tbody tr").first();
    const deleteButton = projectRow.locator('button[aria-label*="Delete"], button:has(svg.lucide-trash)');
    
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      await common.confirmDelete(this.page);
      
      // Verify project is no longer visible
      await expect(projectRow).not.toBeVisible();
      return true;
    }
    return false;
  }

  async navigateToProjectDonations(projectIndex: number = 0) {
    const firstRow = this.page.locator("table tbody tr").nth(projectIndex);
    const donationsButton = firstRow.locator('button:has-text("Donations"), a:has-text("Donations")');
    
    if ((await donationsButton.count()) > 0) {
      await donationsButton.first().click();
      await this.page.waitForTimeout(1000);
      
      // Verify we're on donations page
      const donationIndicators = [
        'text="Donations"',
        'text="Amount"',
        'text="Date"',
        'text="No donations"',
      ];
      
      for (const selector of donationIndicators) {
        const element = this.page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          return true;
        }
      }
    }
    return false;
  }

  async testPagination() {
    const paginationControls = this.page.locator('[aria-label*="pagination"], [class*="pagination"]');
    
    if (await paginationControls.isVisible()) {
      // Test page size selector
      const pageSizeSelector = this.page.locator('button[aria-label*="page size"], button:has-text("rows")').first();
      if (await pageSizeSelector.isVisible()) {
        await pageSizeSelector.click();
        
        const option = this.page.locator('[role="option"]:has-text("10")');
        if (await option.isVisible()) {
          await option.click();
          await this.page.waitForTimeout(1000);
          return true;
        }
      }
    }
    return false;
  }

  async verifyFormValidationErrors() {
    await common.clickPrimaryAction(this.page, "Create Project");
    await this.page.waitForTimeout(500);
    
    // Check for validation errors
    const validationErrorSelectors = [
      'text="Name must be at least 2 characters"',
      'text="Name is required"',
      'text="Required"',
      'text="Please enter a name"',
    ];
    
    for (const selector of validationErrorSelectors) {
      const element = this.page.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        return true;
      }
    }
    
    // If no explicit error, check if still on add page
    return this.page.url().includes("/projects/add");
  }

  async getProjectCount(): Promise<number> {
    return await common.getTableRowCount(this.page);
  }

  async verifyProjectStatus(projectIndex: number = 0) {
    const firstRow = this.page.locator("table tbody tr").nth(projectIndex);
    
    // Verify status badge
    const statusBadge = firstRow
      .locator('div[class*="rounded-full"]')
      .filter({ hasText: /active|completed|on.hold/i });
    await expect(statusBadge).toBeVisible();
    
    // Verify goal amount
    const goalCell = firstRow.locator("td").filter({ hasText: /\$/ }).first();
    await expect(goalCell).toBeVisible();
    
    return true;
  }

  async verifyProjectProgress(projectIndex: number = 0): Promise<boolean> {
    const firstRow = this.page.locator("table tbody tr").nth(projectIndex);
    
    // Check for progress indicators
    const progressElements = [
      'div[class*="progress"]',
      'div[class*="bar"]',
      '[role="progressbar"]',
      'text="%"',
      'span:has-text("%")',
    ];
    
    for (const selector of progressElements) {
      const element = firstRow.locator(selector).first();
      if (await element.isVisible().catch(() => false)) {
        return true;
      }
    }
    
    return false;
  }

  async navigateToCampaign() {
    const campaignButton = this.page.getByRole("main").getByRole("button", { name: "Campaign" });
    await campaignButton.click();
    await this.page.waitForLoadState("networkidle");
  }

  async navigateBackToProjectsList() {
    await this.page.goto("/projects");
    await common.waitForPageLoad(this.page);
  }
}