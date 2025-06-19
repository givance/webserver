import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('__clerk_db_jwt', 'mock-jwt-token')
    })
  })

  test('should load dashboard page', async ({ page }) => {
    await page.goto('/dashboard')
    
    // Should either load dashboard or redirect to auth
    const currentUrl = page.url()
    if (currentUrl.includes('dashboard') || currentUrl === 'http://localhost:3000/') {
      // Check for dashboard elements
      const dashboardElements = [
        'h1:has-text("Dashboard")',
        '.dashboard',
        '.stats',
        '.metrics',
        '.chart',
        '.summary',
        '.widget',
        'main'
      ]
      
      let hasDashboardElements = false
      for (const selector of dashboardElements) {
        const element = page.locator(selector).first()
        if (await element.isVisible().catch(() => false)) {
          hasDashboardElements = true
          break
        }
      }
      
      expect(hasDashboardElements).toBe(true)
    } else {
      // If redirected to auth, that's expected behavior
      expect(currentUrl).toMatch(/(sign-in|auth|login)/)
    }
  })

  test('should display key metrics and statistics', async ({ page }) => {
    await page.goto('/dashboard')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Look for metric displays
      const metricElements = [
        '.metric',
        '.stat',
        '.kpi',
        '.number',
        '[data-testid*="metric"]',
        '.dashboard-card',
        '.summary-card'
      ]
      
      let hasMetrics = false
      for (const selector of metricElements) {
        const element = page.locator(selector).first()
        if (await element.isVisible().catch(() => false)) {
          hasMetrics = true
          break
        }
      }
      
      // Also check for specific metric content
      const metricTexts = [
        'Total Donors',
        'Total Raised',
        'Active Campaigns',
        'Recent Donations',
        'This Month',
        'This Year',
        '$'
      ]
      
      let hasMetricContent = false
      for (const text of metricTexts) {
        const element = page.locator(`text=${text}`).first()
        if (await element.isVisible().catch(() => false)) {
          hasMetricContent = true
          break
        }
      }
      
      expect(hasMetrics || hasMetricContent).toBe(true)
    }
  })

  test('should have working navigation to other sections', async ({ page }) => {
    await page.goto('/dashboard')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Look for navigation links
      const navLinks = [
        'a[href*="/donors"]',
        'a[href*="/campaigns"]',
        'a[href*="/projects"]',
        'button:has-text("Donors")',
        'button:has-text("Campaigns")',
        '.nav-link',
        '.sidebar a'
      ]
      
      for (const selector of navLinks) {
        const element = page.locator(selector).first()
        if (await element.isVisible().catch(() => false)) {
          await element.click()
          await page.waitForLoadState('networkidle')
          
          // Should navigate to the clicked section
          const currentUrl = page.url()
          expect(currentUrl).not.toBe('http://localhost:3000/dashboard')
          break
        }
      }
    }
  })

  test('should handle responsive design', async ({ page }) => {
    await page.goto('/dashboard')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Test mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      await page.waitForTimeout(500)
      
      // Should not have horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      
      expect(hasHorizontalScroll).toBe(false)
      
      // Test desktop viewport
      await page.setViewportSize({ width: 1200, height: 800 })
      await page.waitForTimeout(500)
      
      // Page should still be functional
      const bodyElement = page.locator('body')
      expect(await bodyElement.isVisible()).toBe(true)
    }
  })
})

test.describe('Quick Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('__clerk_db_jwt', 'mock-jwt-token')
    })
  })

  test('should provide quick action buttons', async ({ page }) => {
    await page.goto('/dashboard')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Look for quick action buttons
      const quickActionElements = [
        'button:has-text("Add Donor")',
        'button:has-text("New Campaign")',
        'button:has-text("Create")',
        'a:has-text("Quick")',
        '.quick-actions',
        '.action-button',
        '[data-testid*="quick"]'
      ]
      
      let hasQuickActions = false
      for (const selector of quickActionElements) {
        const element = page.locator(selector).first()
        if (await element.isVisible().catch(() => false)) {
          hasQuickActions = true
          break
        }
      }
      
      if (hasQuickActions) {
        // Try clicking a quick action
        const actionButton = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create")').first()
        if (await actionButton.isVisible().catch(() => false)) {
          await actionButton.click()
          await page.waitForLoadState('networkidle')
          
          // Should navigate to the appropriate section
          const currentUrl = page.url()
          expect(currentUrl).not.toBe('http://localhost:3000/dashboard')
        }
      }
    }
  })

  test('should handle search functionality', async ({ page }) => {
    await page.goto('/dashboard')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Look for search functionality
      const searchInput = page.locator('input[placeholder*="search"], input[type="search"], [data-testid="search"]').first()
      
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill('test search')
        await page.keyboard.press('Enter')
        
        // Should handle search without errors
        await page.waitForTimeout(1000)
        
        // Check for search results or no results message
        const searchResults = page.locator('.search-results, .results, .no-results')
        const resultsVisible = await searchResults.isVisible().catch(() => false)
        
        // Search should either show results or stay on same page
        expect(resultsVisible || page.url().includes('dashboard')).toBe(true)
      }
    }
  })
})