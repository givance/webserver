import { test as setup } from '@playwright/test'
import { setupClerkTestingToken } from '@clerk/testing/playwright'

const authFile = 'playwright/.clerk/user.json'

setup('direct authentication', async ({ page }) => {
  console.log('🔐 Direct authentication setup...')
  
  // Apply Clerk test token
  await setupClerkTestingToken({ page })
  
  // Create a test user session programmatically
  // This works with Clerk's test mode when using test keys
  await page.route('**/*', async (route, request) => {
    // Add test auth headers to all requests
    const headers = {
      ...request.headers(),
      'Authorization': 'Bearer test_token',
      'X-Clerk-Testing': 'true'
    }
    
    await route.continue({ headers })
  })
  
  // Go directly to a protected route
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  
  // Check if we need to handle sign-in
  if (page.url().includes('sign-in')) {
    console.log('📝 Handling Clerk sign-in form...')
    
    try {
      // More robust selectors for Clerk's forms
      // Try by placeholder text first
      const emailField = page.getByPlaceholder(/email|e-mail/i).first()
      await emailField.waitFor({ state: 'visible', timeout: 5000 })
      await emailField.fill('test@example.com')
      
      // Look for continue button
      await page.getByRole('button', { name: /continue|next/i }).first().click()
      
      // Wait a bit for form transition
      await page.waitForTimeout(1500)
      
      // Fill password
      const passwordField = page.getByPlaceholder(/password/i).first()
      await passwordField.waitFor({ state: 'visible', timeout: 5000 })
      await passwordField.fill('testpass123')
      
      // Submit
      await page.getByRole('button', { name: /sign in|continue/i }).first().click()
      
      // Wait for navigation away from sign-in
      await page.waitForURL(url => !url.includes('sign-in'), { timeout: 10000 })
      
    } catch (error) {
      console.error('❌ Form interaction failed:', error)
      // Take a screenshot for debugging
      await page.screenshot({ path: 'test-results/auth-error.png' })
    }
  }
  
  // Verify we're authenticated
  const finalUrl = page.url()
  console.log('📍 Final URL:', finalUrl)
  
  if (!finalUrl.includes('sign-in')) {
    // Save auth state
    await page.context().storageState({ path: authFile })
    console.log('✅ Authentication successful')
  } else {
    throw new Error('Failed to authenticate - still on sign-in page')
  }
})