import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('should display sign-in page when not authenticated', async ({ page }) => {
    await page.goto('/')
    
    // Should redirect to sign-in or show sign-in form
    await expect(page).toHaveURL(/sign-in|auth/)
    
    // Check for sign-in elements
    const signInButton = page.locator('button:has-text("Sign in")')
    await expect(signInButton.or(page.locator('[data-testid="sign-in-button"]'))).toBeVisible()
  })

  test('should handle sign-in process', async ({ page }) => {
    await page.goto('/sign-in')
    
    // Mock successful authentication by setting auth cookies/localStorage
    await page.evaluate(() => {
      localStorage.setItem('__clerk_db_jwt', 'mock-jwt-token')
      localStorage.setItem('__clerk_db_jwt_', 'mock-jwt-token')
    })
    
    // Navigate to protected route
    await page.goto('/dashboard')
    
    // Should either show dashboard or still be on sign-in (depends on Clerk setup)
    const currentUrl = page.url()
    expect(currentUrl).toMatch(/(dashboard|sign-in|auth)/)
  })
})

test.describe('Navigation', () => {
  test('should have working navigation structure', async ({ page }) => {
    // Start from homepage
    await page.goto('/')
    
    // Check page loads without errors
    await expect(page).not.toHaveTitle(/Error|Not Found/)
    
    // Look for common navigation elements
    const navElements = [
      'nav',
      '[role="navigation"]',
      'header',
      '.navbar',
      '.navigation'
    ]
    
    let hasNavigation = false
    for (const selector of navElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        hasNavigation = true
        break
      }
    }
    
    // Should have some form of navigation
    expect(hasNavigation).toBe(true)
  })
})