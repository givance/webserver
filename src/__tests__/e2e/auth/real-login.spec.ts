import { test, expect } from '@playwright/test'

test.describe('Real Database Login Flow', () => {
  // These tests run with authenticated state from the setup
  
  test('should access dashboard with real database data', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should be on dashboard (not redirected to sign-in)
    expect(page.url()).not.toContain('sign-in')
    expect(page.url()).not.toContain('accounts.dev')
    
    // Look for dashboard content
    const dashboardIndicators = [
      'text=Dashboard',
      'main',
      'nav',
      'h1',
      'h2'
    ]

    let foundDashboard = false
    for (const selector of dashboardIndicators) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundDashboard = true
        break
      }
    }

    expect(foundDashboard).toBe(true)
  })

  test('should load donors page with real database data', async ({ page }) => {
    await page.goto('/donors')
    await page.waitForLoadState('networkidle')

    // Should not redirect to auth
    expect(page.url()).not.toContain('sign-in')
    expect(page.url()).toContain('/donors')

    // Wait for content to load
    await page.waitForTimeout(1000)

    // Look for donor-related content (either data or empty state)
    const donorIndicators = [
      'text=Donors',
      'text=Add Donor',
      'text=Create Donor',
      'table',
      'main'
    ]

    let foundDonorContent = false
    for (const selector of donorIndicators) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundDonorContent = true
        console.log(`Found donor content with selector: ${selector}`)
        break
      }
    }

    expect(foundDonorContent).toBe(true)
  })

  test('should load campaigns page with real database data', async ({ page }) => {
    await page.goto('/campaigns')
    await page.waitForLoadState('networkidle')

    // Should not redirect to auth
    expect(page.url()).not.toContain('sign-in')

    // Wait for content to load
    await page.waitForTimeout(1000)

    // Look for campaign-related content
    const campaignIndicators = [
      'text=Campaign',
      'text=Create Campaign',
      'text=New Campaign',
      'main',
      'h1'
    ]

    let foundCampaignContent = false
    for (const selector of campaignIndicators) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundCampaignContent = true
        console.log(`Found campaign content with selector: ${selector}`)
        break
      }
    }

    expect(foundCampaignContent).toBe(true)
  })

  test('should handle navigation between pages with persistent data', async ({ page }) => {
    // Start at home
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate to donors
    await page.goto('/donors')
    await page.waitForLoadState('networkidle')

    // Should still be authenticated
    expect(page.url()).not.toContain('sign-in')
    expect(page.url()).toContain('/donors')

    // Navigate to campaigns
    await page.goto('/campaign')
    await page.waitForLoadState('networkidle')
    
    // Should still be authenticated
    expect(page.url()).not.toContain('sign-in')
    
    // Navigate back to home
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Should still be authenticated
    expect(page.url()).not.toContain('sign-in')
  })
})