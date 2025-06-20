import { test as setup } from '@playwright/test'

const authFile = 'playwright/.clerk/user.json'

setup('authenticate with clerk test token', async ({ page }) => {
  console.log('🔐 Setting up Clerk test authentication...')
  
  // In Clerk test mode with proper test keys, we can inject a test session
  // This approach bypasses the UI login flow entirely
  
  // Set test authentication cookies/tokens
  await page.addInitScript(() => {
    // Clerk stores auth data in localStorage and cookies
    // In test mode, we can set these directly
    const testUserId = 'user_test_123'
    const testSessionId = 'sess_test_123'
    
    // Set Clerk client-side session data
    window.localStorage.setItem('__clerk_client_jwt', JSON.stringify({
      id: testSessionId,
      userId: testUserId,
      status: 'active',
      lastActiveAt: Date.now(),
      expireAt: Date.now() + 3600000 // 1 hour from now
    }))
    
    // Set additional Clerk data
    window.localStorage.setItem('__clerk_db_jwt', 'test_jwt_token')
  })
  
  // Navigate to the app
  await page.goto('/')
  console.log('📍 Navigated to homepage')
  
  // Wait for the app to load
  await page.waitForLoadState('networkidle')
  
  // If we're still on sign-in, try the manual approach
  if (page.url().includes('sign-in') || page.url().includes('clerk.accounts.dev')) {
    console.log('⚠️ Still on sign-in page, attempting UI login...')
    
    // Use Clerk's dev instance test credentials
    await page.getByLabel('Email address').fill('test@example.com')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    
    // Wait for password field
    await page.waitForTimeout(1000)
    
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    
    // Wait for redirect
    await page.waitForURL(url => !url.includes('sign-in'), { timeout: 10000 })
  }
  
  // Save the authentication state
  await page.context().storageState({ path: authFile })
  console.log('✅ Authentication state saved')
})