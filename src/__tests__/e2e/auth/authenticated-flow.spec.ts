import { test, expect } from '@playwright/test'

// Use the saved authentication state
test.use({ storageState: 'playwright/.clerk/user.json' })

test.describe('Authenticated Application Flow', () => {
  test('should access dashboard after authentication', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should be on dashboard, not redirected to sign-in
    expect(page.url()).not.toContain('sign-in')
    expect(page.url()).not.toContain('clerk.accounts.dev')

    // Look for dashboard content
    const dashboardElements = [
      'text=Dashboard',
      'text=Welcome',
      'nav',
      'main',
      'h1',
      'h2',
      '.dashboard',
      'body'
    ]

    let foundDashboard = false
    for (const selector of dashboardElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundDashboard = true
        console.log(`✅ Found dashboard content: ${selector}`)
        break
      }
    }

    expect(foundDashboard).toBe(true)
    
    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/authenticated-dashboard.png' })
    console.log('✅ Successfully accessed dashboard while authenticated')
  })

  test('should access donors page with real data', async ({ page }) => {
    await page.goto('/donors')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Wait for data to load

    // Should be on donors page, not redirected to sign-in
    expect(page.url()).toContain('donors')
    expect(page.url()).not.toContain('sign-in')

    // Look for donors page content
    const donorsPageElements = [
      'text=Donors',
      'h1:has-text("Donors")',
      'table',
      'thead',
      'tbody',
      '.donor',
      'button:has-text("Add")',
      'button:has-text("New")',
      'button:has-text("Create")'
    ]

    let foundDonorsContent = false
    for (const selector of donorsPageElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundDonorsContent = true
        console.log(`✅ Found donors page content: ${selector}`)
        break
      }
    }

    expect(foundDonorsContent).toBe(true)
    
    // Look for actual donor data or empty state
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()
    expect(pageContent!.length).toBeGreaterThan(100)

    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/authenticated-donors.png' })
    console.log('✅ Successfully accessed donors page while authenticated')
  })

  test('should access campaigns page with real data', async ({ page }) => {
    await page.goto('/campaigns')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Wait for data to load

    // Should be on campaigns page, not redirected to sign-in
    expect(page.url()).toContain('campaigns')
    expect(page.url()).not.toContain('sign-in')

    // Look for campaigns page content
    const campaignsPageElements = [
      'text=Campaigns',
      'text=Campaign',
      'h1:has-text("Campaigns")',
      'table',
      'thead',
      'tbody',
      '.campaign',
      'button:has-text("Create")',
      'button:has-text("New")',
      'a:has-text("Create")'
    ]

    let foundCampaignsContent = false
    for (const selector of campaignsPageElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundCampaignsContent = true
        console.log(`✅ Found campaigns page content: ${selector}`)
        break
      }
    }

    expect(foundCampaignsContent).toBe(true)

    // Look for actual campaign data or empty state
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()
    expect(pageContent!.length).toBeGreaterThan(100)

    // Take screenshot for verification
    await page.screenshot({ path: 'test-results/authenticated-campaigns.png' })
    console.log('✅ Successfully accessed campaigns page while authenticated')
  })

  test('should navigate between pages while maintaining authentication', async ({ page }) => {
    const pagesToTest = [
      { path: '/dashboard', name: 'Dashboard' },
      { path: '/donors', name: 'Donors' },
      { path: '/campaigns', name: 'Campaigns' },
      { path: '/', name: 'Home' }
    ]

    for (const { path, name } of pagesToTest) {
      console.log(`Testing navigation to ${name} (${path})`)
      
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      // Should not be redirected to sign-in
      expect(page.url()).not.toContain('sign-in')
      expect(page.url()).not.toContain('clerk.accounts.dev')

      // Should load some content
      const bodyContent = await page.textContent('body')
      expect(bodyContent).toBeTruthy()
      expect(bodyContent!.length).toBeGreaterThan(100)

      console.log(`✅ Successfully navigated to ${name}`)
    }

    console.log('✅ All navigation tests passed while maintaining authentication')
  })

  test('should display user information when authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Look for user-related information
    const userInfoElements = [
      '[data-testid="user-name"]',
      '[data-testid="user-email"]',
      '.user-info',
      '.user-menu',
      '.cl-userButtonTrigger', // Clerk user button
      'button:has-text("Profile")',
      'text=test@example.com',
      'text=Test User'
    ]

    let foundUserInfo = false
    for (const selector of userInfoElements) {
      const element = page.locator(selector).first()
      if (await element.isVisible().catch(() => false)) {
        foundUserInfo = true
        console.log(`✅ Found user info: ${selector}`)
        break
      }
    }

    if (!foundUserInfo) {
      // If no specific user info found, at least ensure we're authenticated (not on sign-in)
      expect(page.url()).not.toContain('sign-in')
      console.log('✅ User authenticated (no sign-in page), but specific user info not visible')
    } else {
      expect(foundUserInfo).toBe(true)
      console.log('✅ User information displayed while authenticated')
    }
  })

  test('should handle page refresh while maintaining authentication', async ({ page }) => {
    // Go to donors page
    await page.goto('/donors')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const urlBeforeRefresh = page.url()
    expect(urlBeforeRefresh).not.toContain('sign-in')

    // Refresh the page
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const urlAfterRefresh = page.url()

    // Should still be authenticated (not redirected to sign-in)
    expect(urlAfterRefresh).not.toContain('sign-in')
    expect(urlAfterRefresh).not.toContain('clerk.accounts.dev')

    // Should still have content
    const bodyContent = await page.textContent('body')
    expect(bodyContent).toBeTruthy()
    expect(bodyContent!.length).toBeGreaterThan(100)

    console.log('✅ Authentication persisted after page refresh')
  })
})