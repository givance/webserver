import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect } from '@playwright/test'

test('sign in and access dashboard', async ({ page }) => {
  console.log('🔐 Starting authentication test...')
  
  // Apply Clerk testing token to enable test mode
  await setupClerkTestingToken({ page })
  
  // Navigate to home page first
  await page.goto('/')
  console.log('📍 Navigated to home page')
  
  // Wait for the page to fully load and potentially redirect
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  
  const currentUrl = page.url()
  console.log('📍 Current URL:', currentUrl)
  
  // Check if we're redirected to Clerk sign-in
  if (currentUrl.includes('sign-in') || currentUrl.includes('clerk.accounts.dev')) {
    console.log('🔑 On sign-in page, attempting login...')
    
    try {
      // Wait for the form to be ready
      await page.waitForTimeout(2000)
      
      // Try multiple selectors for the email field
      const emailSelectors = [
        'input[name="identifier"]',
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="e-mail" i]',
        'input[aria-label*="email" i]',
        '.cl-formFieldInput__identifier',
        '.cl-formFieldInput'
      ]
      
      let emailFilled = false
      for (const selector of emailSelectors) {
        try {
          const element = page.locator(selector).first()
          if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
            await element.click()
            await element.fill('testuser@example.com')
            console.log(`✅ Filled email using selector: ${selector}`)
            emailFilled = true
            break
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!emailFilled) {
        throw new Error('Could not find email input field')
      }
      
      // Try to submit the email form
      const submitSelectors = [
        'button:has-text("Continue")',
        'button:has-text("Next")',
        'button[type="submit"]',
        '.cl-formButtonPrimary'
      ]
      
      let submitted = false
      for (const selector of submitSelectors) {
        try {
          const element = page.locator(selector).first()
          if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
            await element.click()
            console.log(`✅ Clicked submit using selector: ${selector}`)
            submitted = true
            break
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!submitted) {
        // Try pressing Enter as a fallback
        await page.keyboard.press('Enter')
        console.log('✅ Pressed Enter to submit')
      }
      
      // Wait for password field to appear
      await page.waitForTimeout(2000)
      
      // Try multiple selectors for password field
      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[placeholder*="password" i]',
        'input[aria-label*="password" i]',
        '.cl-formFieldInput__password',
        '.cl-formFieldInput[type="password"]'
      ]
      
      let passwordFilled = false
      for (const selector of passwordSelectors) {
        try {
          const element = page.locator(selector).first()
          if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
            await element.click()
            await element.fill('password123')
            console.log(`✅ Filled password using selector: ${selector}`)
            passwordFilled = true
            break
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!passwordFilled) {
        throw new Error('Could not find password input field')
      }
      
      // Submit the password form
      submitted = false
      for (const selector of submitSelectors) {
        try {
          const element = page.locator(selector).first()
          if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
            await element.click()
            console.log(`✅ Clicked final submit using selector: ${selector}`)
            submitted = true
            break
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!submitted) {
        await page.keyboard.press('Enter')
        console.log('✅ Pressed Enter to submit password')
      }
      
      // Wait for redirect away from sign-in
      await page.waitForURL(url => !url.includes('sign-in') && !url.includes('clerk.accounts.dev'), { 
        timeout: 15000 
      })
      
      console.log('✅ Successfully authenticated and redirected')
      
    } catch (error) {
      console.error('❌ Error during sign-in:', error)
      await page.screenshot({ path: 'test-results/sign-in-error.png', fullPage: true })
      throw error
    }
  } else {
    console.log('✅ Already authenticated or no sign-in required')
  }
  
  // Now navigate to dashboard
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  
  // Verify we can access dashboard
  const dashboardUrl = page.url()
  expect(dashboardUrl).not.toContain('sign-in')
  expect(dashboardUrl).not.toContain('clerk.accounts.dev')
  
  console.log('✅ Successfully accessed dashboard:', dashboardUrl)
})