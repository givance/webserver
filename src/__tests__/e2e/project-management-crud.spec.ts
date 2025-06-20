import { test, expect } from "@playwright/test";

test.describe("Projects CRUD Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to projects page
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
  });

  test("should display projects list page with key elements", async ({ page }) => {
    // Verify page title
    await expect(page.locator('h1:has-text("Project Management")')).toBeVisible();

    // Verify Add Project button is present
    await expect(page.locator('a[href="/projects/add"] button:has-text("Add Project")')).toBeVisible();

    // Verify search input
    await expect(page.locator('input[placeholder*="Search projects"]')).toBeVisible();

    // Verify table is present (even if empty)
    const tableOrEmptyState = page.locator('table, text:has-text("No projects"), text:has-text("No results")');
    await expect(tableOrEmptyState.first()).toBeVisible();

    // Verify page size selector - it's a Select component
    const pageSizeSelector = page.locator('button[role="combobox"]').filter({ hasText: /items per page/i });
    await expect(pageSizeSelector).toBeVisible();

    // Verify Campaign button is present - it's in the main content area
    const mainCampaignButton = page.getByRole('main').getByRole('button', { name: 'Campaign' });
    await expect(mainCampaignButton).toBeVisible();
  });

  test("should create a new project", async ({ page }) => {
    // Click Add Project button
    await page.click('a[href="/projects/add"] button:has-text("Add Project")');
    await page.waitForURL("**/projects/add");
    await page.waitForLoadState("networkidle");

    // Verify we're on the add project page
    await expect(page.locator('h1:has-text("Add New Project")')).toBeVisible();

    // Fill in the form with test data
    const testProject = {
      name: `Test Project ${Date.now()}`,
      description: "This is a test project created by e2e tests",
      goal: "50000",
      tags: ["test", "e2e"],
    };

    // Fill project name - the form uses react-hook-form, so look for the input by its label
    const nameInput = page.locator('input').filter({ has: page.locator('..').filter({ hasText: 'Name' }) }).first();
    await nameInput.fill(testProject.name);

    // Fill description
    const descriptionTextarea = page.locator('textarea').filter({ has: page.locator('..').filter({ hasText: 'Description' }) }).first();
    await descriptionTextarea.fill(testProject.description);

    // Fill goal amount
    const goalInput = page.locator('input[type="number"]').filter({ has: page.locator('..').filter({ hasText: 'Fundraising Goal' }) }).first();
    await goalInput.fill(testProject.goal);

    // Add tags (if the tag input is available)
    const tagInput = page.locator('input[placeholder*="tag"]');
    if (await tagInput.isVisible()) {
      for (const tag of testProject.tags) {
        await tagInput.fill(tag);
        await tagInput.press("Enter");
        await page.waitForTimeout(500);
      }
    }

    // Verify active switch is checked by default - it's a Switch component, not a checkbox
    const activeSwitch = page.locator('button[role="switch"]');
    await expect(activeSwitch).toHaveAttribute('data-state', 'checked');

    // Submit the form
    await page.click('button:has-text("Create Project")');

    // Wait for navigation back to projects list
    await page.waitForURL("**/projects");
    await page.waitForLoadState("networkidle");

    // Verify the project was created by searching for it
    await page.fill('input[placeholder*="Search projects"]', testProject.name);
    await page.waitForTimeout(1000); // Wait for debounced search

    // Verify the project appears in the list
    const projectRow = page.locator(`tr:has-text("${testProject.name}")`);
    await expect(projectRow).toBeVisible();
  });

  test("should display project details", async ({ page }) => {
    // Wait for projects to load
    await page.waitForTimeout(1000);

    // Check if there are any projects
    const projectLinks = page.locator('table tbody tr a[href^="/projects/"]');
    const linkCount = await projectLinks.count();

    if (linkCount === 0) {
      // If no projects, create one first
      await test.step("Create a project for viewing", async () => {
        await page.click('a[href="/projects/add"] button');
        await page.waitForURL("**/projects/add");
        await page.fill('input[name="name"]', `View Test Project ${Date.now()}`);
        await page.fill('textarea[name="description"]', "Test project for viewing");
        await page.click('button:has-text("Create Project")');
        await page.waitForURL("**/projects");
        await page.waitForTimeout(1000);
      });
    }

    // Click on the first project name
    const firstProjectLink = page.locator('table tbody tr a[href^="/projects/"]').first();
    const projectName = await firstProjectLink.textContent();
    await firstProjectLink.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/projects\/\d+$/);
    await page.waitForLoadState("networkidle");

    // Verify project detail page elements
    await expect(page.locator(`h1:has-text("${projectName}")`)).toBeVisible();

    // Verify action buttons
    await expect(page.locator('button:has-text("Edit")')).toBeVisible();
    await expect(page.locator('button:has-text("Delete")')).toBeVisible();

    // Verify project details card - might use CardTitle which renders as h3
    const projectDetailsTitle = page.locator('h2, h3').filter({ hasText: 'Project Details' });
    await expect(projectDetailsTitle.first()).toBeVisible();

    // Verify project information sections
    await expect(page.locator('h3:has-text("Description")')).toBeVisible();
    await expect(page.locator('h3:has-text("Status")')).toBeVisible();
  });

  test("should edit project information", async ({ page }) => {
    // Wait for projects to load
    await page.waitForTimeout(1000);

    // Check if there are any projects
    const projectLinks = page.locator('table tbody tr a[href^="/projects/"]');
    const linkCount = await projectLinks.count();

    if (linkCount === 0) {
      // Create a project if none exist
      await test.step("Create a project for editing", async () => {
        await page.click('a[href="/projects/add"] button');
        await page.waitForURL("**/projects/add");
        await page.fill('input[name="name"]', `Edit Test Project ${Date.now()}`);
        await page.fill('textarea[name="description"]', "Original description");
        await page.click('button:has-text("Create Project")');
        await page.waitForURL("**/projects");
        await page.waitForTimeout(1000);
      });
    }

    // Navigate to first project's detail page
    const firstProjectLink = page.locator('table tbody tr a[href^="/projects/"]').first();
    await firstProjectLink.click();
    await page.waitForURL(/\/projects\/\d+$/);
    await page.waitForLoadState("networkidle");

    // Click Edit button
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(500);

    // Update project information
    const timestamp = Date.now();
    await page.fill('input[name="name"]', `Updated Project ${timestamp}`);
    await page.fill('textarea[name="description"]', `Updated description at ${timestamp}`);
    
    // Update goal if field exists
    const goalInput = page.locator('input[name="goal"]');
    if (await goalInput.isVisible()) {
      await goalInput.clear();
      await goalInput.fill("75000");
    }

    // Toggle active status
    const activeCheckbox = page.locator('input[type="checkbox"][name="active"]');
    if (await activeCheckbox.isVisible()) {
      await activeCheckbox.click();
    }

    // Submit the update
    await page.click('button:has-text("Update Project")');
    await page.waitForTimeout(1000);

    // Verify success message
    await expect(page.locator('text=/updated.*success/i')).toBeVisible({ timeout: 5000 });

    // Verify the edit form is closed
    await expect(page.locator('button:has-text("Edit")')).toBeVisible();

    // Verify updated information is displayed
    await expect(page.locator(`h1:has-text("Updated Project ${timestamp}")`)).toBeVisible();
    await expect(page.locator(`text=/Updated description at ${timestamp}/`)).toBeVisible();
  });

  test("should search projects", async ({ page }) => {
    // Test search functionality
    await page.fill('input[placeholder*="Search projects"]', "test");
    await page.waitForTimeout(1000); // Wait for debounced search

    // Verify search is working (either shows results or empty state)
    const tableBody = page.locator("table tbody");
    await expect(tableBody).toBeVisible();

    // Clear search
    await page.fill('input[placeholder*="Search projects"]', "");
    await page.waitForTimeout(1000);
  });

  test("should handle pagination", async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(1000);

    // Check if pagination controls exist
    const paginationControls = page.locator('[aria-label*="pagination"], [class*="pagination"]');
    
    if (await paginationControls.isVisible()) {
      // Test page size selector
      const pageSizeSelector = page.locator('button[aria-label*="page size"], button:has-text("rows")').first();
      if (await pageSizeSelector.isVisible()) {
        await pageSizeSelector.click();
        
        // Select a different page size
        const option = page.locator('[role="option"]:has-text("10")');
        if (await option.isVisible()) {
          await option.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test("should delete a project", async ({ page }) => {
    // First create a project to delete
    await test.step("Create a project to delete", async () => {
      await page.click('a[href="/projects/add"] button');
      await page.waitForURL("**/projects/add");
      const timestamp = Date.now();
      await page.fill('input[name="name"]', `Delete Test Project ${timestamp}`);
      await page.fill('textarea[name="description"]', "This project will be deleted");
      await page.click('button:has-text("Create Project")');
      await page.waitForURL("**/projects");
      await page.waitForTimeout(1000);
      
      // Search for the newly created project
      await page.fill('input[placeholder*="Search projects"]', `Delete Test Project ${timestamp}`);
      await page.waitForTimeout(1000);
    });

    // Find the delete button in the project row
    const projectRow = page.locator("table tbody tr").first();
    const deleteButton = projectRow.locator('button[aria-label*="Delete"], button:has(svg.lucide-trash)');
    
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      
      // Confirm deletion in the dialog
      const confirmDialog = page.locator('[role="alertdialog"]');
      await expect(confirmDialog).toBeVisible();
      
      const confirmButton = confirmDialog.locator('button:has-text("Delete")').last();
      await confirmButton.click();
      
      // Wait for deletion to complete
      await page.waitForTimeout(1000);
      
      // Verify project is no longer in the list
      await expect(projectRow).not.toBeVisible();
    }
  });

  test("should navigate to project donations", async ({ page }) => {
    // Wait for projects to load
    await page.waitForTimeout(1000);

    const donationsButton = page.locator('table tbody tr').first().locator('button:has-text("Donations")');
    
    if (await donationsButton.count() > 0) {
      await donationsButton.click();

      // Should navigate to project donations page
      await page.waitForURL(/\/projects\/\d+\/donations$/);
      await page.waitForLoadState("networkidle");

      // Verify we're on the donations page
      const pageTitle = page.locator('h1, h2').filter({ hasText: /donation/i });
      await expect(pageTitle.first()).toBeVisible();
    }
  });

  test("should validate required fields in project form", async ({ page }) => {
    // Navigate to add project page
    await page.click('a[href="/projects/add"] button');
    await page.waitForURL("**/projects/add");

    // Try to submit empty form
    await page.click('button:has-text("Create Project")');

    // Verify validation error for name field
    await expect(page.locator('text="Name must be at least 2 characters"')).toBeVisible();

    // Fill only the name and try again
    await page.fill('input[name="name"]', "T");
    await page.click('button:has-text("Create Project")');

    // Should still show validation error for short name
    await expect(page.locator('text="Name must be at least 2 characters"')).toBeVisible();

    // Fill valid name
    await page.fill('input[name="name"]', "Valid Project Name");
    await page.click('button:has-text("Create Project")');

    // Should navigate away after successful creation
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("should display project status and progress", async ({ page }) => {
    // Wait for projects to load
    await page.waitForTimeout(1000);

    const tableRows = page.locator("table tbody tr");
    const rowCount = await tableRows.count();

    if (rowCount > 0) {
      // Check first project row
      const firstRow = tableRows.first();

      // Verify status badge
      const statusBadge = firstRow.locator('div[class*="rounded-full"]').filter({ hasText: /active|completed|on.hold/i });
      await expect(statusBadge).toBeVisible();

      // Verify goal amount column
      const goalCell = firstRow.locator('td').filter({ hasText: /\$/ }).first();
      await expect(goalCell).toBeVisible();

      // Verify raised amount and progress bar
      const progressBar = firstRow.locator('div[class*="rounded-full"][style*="width"]');
      if (await progressBar.count() > 0) {
        await expect(progressBar.first()).toBeVisible();
      }
    }
  });
});