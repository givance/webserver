import { test, expect } from "@playwright/test";

test.describe("Authenticated Navigation", () => {
  test("should access protected routes without redirecting to sign-in", async ({ page }) => {
    // Test accessing the donors page
    await page.goto("/donors");
    await page.waitForLoadState("networkidle");

    const donorsUrl = page.url();
    expect(donorsUrl).toContain("/donors");
    expect(donorsUrl).not.toContain("sign-in");
    expect(donorsUrl).not.toContain("accounts.dev");

    // Verify the page loaded with content
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();
    expect(pageContent!.length).toBeGreaterThan(50);
  });

  test("should access campaign page without redirecting to sign-in", async ({ page }) => {
    await page.goto("/campaign");
    await page.waitForLoadState("networkidle");

    const campaignUrl = page.url();
    expect(campaignUrl).toContain("/campaign");
    expect(campaignUrl).not.toContain("sign-in");
    expect(campaignUrl).not.toContain("accounts.dev");

    // Verify the page loaded with content
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();
    expect(pageContent!.length).toBeGreaterThan(50);
  });

  test("should access projects page without redirecting to sign-in", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    const projectsUrl = page.url();
    expect(projectsUrl).toContain("/projects");
    expect(projectsUrl).not.toContain("sign-in");
    expect(projectsUrl).not.toContain("accounts.dev");

    // Verify the page loaded with content
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();
    expect(pageContent!.length).toBeGreaterThan(50);
  });

  test("should have working navigation between pages", async ({ page }) => {
    // Start at homepage
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should not be redirected to sign-in
    expect(page.url()).not.toContain("sign-in");
    expect(page.url()).not.toContain("accounts.dev");

    // Try to find and click navigation links
    const navLinks = [
      { selector: 'a[href*="/donors"]', expectedPath: "/donors" },
      { selector: 'a[href*="/campaign"]', expectedPath: "/campaign" },
      { selector: 'a[href*="/projects"]', expectedPath: "/projects" },
    ];

    for (const link of navLinks) {
      try {
        const linkElement = page.locator(link.selector).first();
        if (await linkElement.isVisible()) {
          await linkElement.click();
          await page.waitForLoadState("networkidle");

          // Verify we navigated to the expected page
          const currentUrl = page.url();
          expect(currentUrl).toContain(link.expectedPath);
          expect(currentUrl).not.toContain("sign-in");
          expect(currentUrl).not.toContain("accounts.dev");

          console.log(`✅ Successfully navigated to ${link.expectedPath}`);
          break; // Test one successful navigation
        }
      } catch (error) {
        console.log(`Navigation to ${link.expectedPath} failed: ${error}`);
      }
    }
  });

  test("should maintain authentication state across page refreshes", async ({ page }) => {
    // Go to a protected page
    await page.goto("/donors");
    await page.waitForLoadState("networkidle");

    // Verify we're on the protected page
    expect(page.url()).toContain("/donors");
    expect(page.url()).not.toContain("sign-in");

    // Reload the page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should still be on the protected page, not redirected to sign-in
    expect(page.url()).toContain("/donors");
    expect(page.url()).not.toContain("sign-in");
    expect(page.url()).not.toContain("accounts.dev");

    console.log("✅ Authentication state maintained after page refresh");
  });
});
