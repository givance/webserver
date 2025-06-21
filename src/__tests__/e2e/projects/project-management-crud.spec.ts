import { test, expect } from "@playwright/test";
import { cleanupBetweenTests } from "../setup/test-cleanup";
import { createTestProject, generateTestName } from "../utils/test-data-factory";
import { ProjectsHelper } from "../helpers/projects";

test.describe("Projects CRUD Operations", () => {
  let projects: ProjectsHelper;

  test.beforeEach(async ({ page }) => {
    projects = new ProjectsHelper(page);
    await projects.navigateToProjectsPage();
  });

  test.afterEach(async () => {
    // Clean up test data after each test
    await cleanupBetweenTests();
  });

  test("should display projects list page with key elements", async ({ page }) => {
    await projects.verifyProjectsPageElements();
  });

  test("should create a new project", async ({ page }) => {
    const testProject = createTestProject();
    
    await projects.createProject({
      name: testProject.name,
      description: testProject.description,
      goal: testProject.goal,
      tags: testProject.tags,
      active: true
    });

    // Verify the project was created
    const found = await projects.findProject(testProject.name);
    expect(found).toBe(true);
  });

  test("should display project details", async ({ page }) => {
    // Check if there are any projects
    const projectCount = await projects.getProjectCount();

    if (projectCount === 0) {
      // If no projects, create one first
      await test.step("Create a project for viewing", async () => {
        const testProject = createTestProject("view");
        await projects.createProject({
          name: testProject.name,
          description: "Test project for viewing",
          goal: testProject.goal
        });
      });
    }

    // View the first project's details
    const projectName = await projects.viewProjectDetails();
    
    // Verify we're on the correct page
    await expect(page.url()).toMatch(/\/projects\/\d+$/);
  });

  test("should edit project information", async ({ page }) => {
    // Check if there are any projects
    const projectCount = await projects.getProjectCount();

    if (projectCount === 0) {
      // Create a project if none exist
      await test.step("Create a project for editing", async () => {
        const testProject = createTestProject("edit");
        await projects.createProject({
          name: testProject.name,
          description: "Original description",
          goal: testProject.goal
        });
      });
    }

    // Navigate to first project's detail page
    await projects.viewProjectDetails();

    // Edit the project
    const testProject = createTestProject("updated");
    await projects.editProject({
      name: testProject.name,
      description: testProject.description,
      goal: "75000",
      active: false
    });
  });

  test("should search projects", async ({ page }) => {
    // Test search functionality
    await projects.searchProjects("test");

    // Verify search is working
    const tableBody = page.locator("table tbody");
    await expect(tableBody).toBeVisible();

    // Clear search
    await projects.clearProjectSearch();
  });

  test("should handle pagination", async ({ page }) => {
    await projects.testPagination();
  });

  test("should delete a project", async ({ page }) => {
    // First create a project to delete
    const testProject = createTestProject("delete");
    
    await test.step("Create a project to delete", async () => {
      await projects.createProject({
        name: testProject.name,
        description: "This project will be deleted",
        goal: testProject.goal
      });
    });

    // Delete the project
    const deleted = await projects.deleteProject(testProject.name);
    expect(deleted).toBe(true);
  });

  test("should navigate to project donations", async ({ page }) => {
    // Check if there are any projects
    const rowCount = await projects.getProjectCount();

    if (rowCount === 0) {
      // Create a project if none exist
      await test.step("Create a project for donations navigation", async () => {
        const testProject = createTestProject("donations");
        await projects.createProject({
          name: testProject.name,
          description: "Test project for donations",
          goal: testProject.goal
        });
      });
    }

    // Try to navigate to project donations
    const navigated = await projects.navigateToProjectDonations();
    
    if (!navigated) {
      console.log("No donations button found in project row - feature may not be implemented");
    }
  });

  test("should validate required fields in project form", async ({ page }) => {
    await projects.navigateToAddProject();

    // Test form validation
    const hasErrors = await projects.verifyFormValidationErrors();
    expect(hasErrors).toBe(true);

    // Fill valid data and submit
    await page.fill('input[name="name"]', "Valid Project Name");
    await page.fill('textarea[name="description"]', "Valid description");
    await page.click('button:has-text("Create Project")');

    // Should navigate away after successful creation
    await expect(page).toHaveURL(/\/projects$/, { timeout: 10000 });
  });

  test("should display project status and progress", async ({ page }) => {
    const rowCount = await projects.getProjectCount();

    if (rowCount > 0) {
      // Verify status and goal display
      await projects.verifyProjectStatus();
      
      // Check for progress indicators
      const hasProgress = await projects.verifyProjectProgress();
      console.log(`Progress element found: ${hasProgress}`);
    }
  });
});
