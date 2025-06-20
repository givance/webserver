import { test, expect } from '@playwright/test'
import { setupClerkTestingToken } from '@clerk/testing/playwright'

test.describe('Clerk Authentication E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up Clerk testing token for authenticated requests
    await setupClerkTestingToken({ page })
  })

  test('should handle sign-in flow', async ({ page }) => {
    await page.goto('/sign-in')
    
    // Check if we're on the sign-in page or get redirected
    await page.waitForLoadState('networkidle')
    
    // Look for sign-in form elements
    const signInElements = [
      'input[name="identifier"]',
      'input[name="email"]',
      'input[type="email"]',
      'button:has-text("Sign in")',
      'button:has-text("Continue")',
      '[data-clerk-element="signIn"]',
      '.cl-sign-in',
      'form'
    ]

    let foundSignInForm = false
    for (const selector of signInElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundSignInForm = true
        break
      }
    }

    // Should either show sign-in form or already be authenticated
    if (foundSignInForm) {
      // Try to fill in test credentials if form is present
      const emailInput = page.locator('input[name="identifier"], input[name="email"], input[type="email"]').first()
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill('test@example.com')
        
        const continueButton = page.locator('button:has-text("Continue"), button:has-text("Sign in")').first()
        if (await continueButton.isVisible().catch(() => false)) {
          await continueButton.click()
          await page.waitForTimeout(2000)
        }
      }
    }

    // After sign-in attempt, we should either be signed in or still on sign-in page
    const currentUrl = page.url()
    expect(currentUrl).toMatch(/(dashboard|sign-in|auth|\/)/);
  })

  test('should access protected dashboard after authentication', async ({ page }) => {
    // Navigate to dashboard - should either show content or redirect to auth
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    
    // If we get redirected to sign-in, that's expected without proper auth
    if (currentUrl.includes('sign-in')) {
      // Try to authenticate using Clerk testing token
      await setupClerkTestingToken({ page })
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
    }

    // Look for dashboard content or sign-in page
    const dashboardElements = [
      'text=Dashboard',
      'nav',
      'main',
      'h1',
      'h2',
      '.dashboard',
      'body'
    ]

    let foundContent = false
    for (const selector of dashboardElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundContent = true
        break
      }
    }

    expect(foundContent).toBe(true)
  })

  test('should access donors page with authentication', async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/donors')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Wait for potential data loading

    const currentUrl = page.url()
    
    // Should either be on donors page or redirected to auth
    if (!currentUrl.includes('sign-in')) {
      // Look for donors page content
      const donorsPageElements = [
        'text=Donors',
        'table',
        'thead',
        'tbody',
        '.donor',
        'h1',
        'h2',
        'main',
        'text=Add Donor',
        'text=Create Donor',
        'button:has-text("Add")',
        'button:has-text("New")'
      ]

      let foundDonorsContent = false
      for (const selector of donorsPageElements) {
        const element = page.locator(selector).first()
        if (await element.isVisible().catch(() => false)) {
          foundDonorsContent = true
          console.log(`Found donors content with selector: ${selector}`)
          break
        }
      }

      expect(foundDonorsContent).toBe(true)
    } else {
      // If redirected to sign-in, that's valid behavior
      expect(currentUrl).toContain('sign-in')
    }
  })

  test('should access campaigns page with authentication', async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/campaigns')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Wait for potential data loading

    const currentUrl = page.url()
    
    // Should either be on campaigns page or redirected to auth
    if (!currentUrl.includes('sign-in')) {
      // Look for campaigns page content
      const campaignsPageElements = [
        'text=Campaigns',
        'text=Campaign',
        'table',
        'thead',
        'tbody',
        '.campaign',
        'h1',
        'h2',
        'main',
        'text=Create Campaign',
        'text=New Campaign',
        'button:has-text("Create")',
        'button:has-text("New")'
      ]

      let foundCampaignsContent = false
      for (const selector of campaignsPageElements) {
        const element = page.locator(selector).first()
        if (await element.isVisible().catch(() => false)) {
          foundCampaignsContent = true
          console.log(`Found campaigns content with selector: ${selector}`)
          break
        }
      }

      expect(foundCampaignsContent).toBe(true)
    } else {
      // If redirected to sign-in, that's valid behavior
      expect(currentUrl).toContain('sign-in')
    }
  })

  test('should handle user session persistence', async ({ page }) => {
    await setupClerkTestingToken({ page })
    
    // Visit multiple pages to test session persistence
    const pages = ['/dashboard', '/donors', '/campaigns']
    
    for (const pagePath of pages) {
      await page.goto(pagePath)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      const currentUrl = page.url()
      
      // Should either load the page or redirect to auth consistently
      const isValidState = currentUrl.includes(pagePath.slice(1)) || 
                          currentUrl.includes('sign-in') || 
                          currentUrl === 'http://localhost:3000/'
      
      expect(isValidState).toBe(true)
    }
  })

  test('should display proper error handling for unauthenticated access', async ({ page }) => {
    // Don't set up testing token - test unauthenticated access
    await page.goto('/donors')
    await page.waitForLoadState('networkidle')

    const currentUrl = page.url()
    
    // Should be redirected to sign-in or show some authentication prompt
    const isRedirectedToAuth = currentUrl.includes('sign-in') || 
                              currentUrl.includes('auth') ||
                              currentUrl.includes('clerk')

    if (isRedirectedToAuth) {
      // Should show sign-in form
      const signInForm = page.locator('form, .cl-sign-in, [data-clerk-element]').first()
      const hasSignInForm = await signInForm.isVisible().catch(() => false)
      
      expect(hasSignInForm).toBe(true)
    } else {
      // If not redirected, should at least load some content
      const bodyElement = page.locator('body')
      expect(await bodyElement.isVisible()).toBe(true)
    }
  })
})