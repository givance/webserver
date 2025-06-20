import { test as setup } from '@playwright/test'
import { setupClerkTestingToken } from '@clerk/testing/playwright'

const authFile = 'playwright/.clerk/user.json'

setup('authenticate', async ({ page }) => {
  console.log('🔐 Starting authentication setup...')
  
  // Set up Clerk testing token - this enables test mode
  await setupClerkTestingToken({ page })
  
  // Navigate to the app
  await page.goto('/')
  console.log('📍 Navigated to homepage')
  
  // Wait for page to load
  await page.waitForLoadState('networkidle')
  
  // Check if we're on a Clerk-hosted sign-in page
  const isClerkSignIn = page.url().includes('clerk.accounts.dev') || page.url().includes('sign-in')
  
  if (isClerkSignIn) {
    console.log('🔑 On Clerk sign-in page, attempting test user login...')
    
    try {
      // For Clerk test mode, we can use any email/password combination
      // The test mode will accept any credentials
      const testEmail = 'test.user@example.com'
      const testPassword = 'password123!'
      
      // Wait for form to be ready
      await page.waitForTimeout(2000)
      
      // Try to find the identifier/email field
      const identifierField = await page.waitForSelector(
        'input[name="identifier"], input[name="email"], input[type="email"], input[id="identifier-field"]',
        { timeout: 10000 }
      )
      
      if (identifierField) {
        await identifierField.click()
        await identifierField.fill(testEmail)
        console.log(`✅ Entered email: ${testEmail}`)
        
        // Press Enter or click Continue
        await page.keyboard.press('Enter')
        console.log('✅ Submitted email')
        
        // Wait for password field
        await page.waitForTimeout(2000)
        
        const passwordField = await page.waitForSelector(
          'input[name="password"], input[type="password"], input[id="password-field"]',
          { timeout: 10000 }
        )
        
        if (passwordField) {
          await passwordField.click()
          await passwordField.fill(testPassword)
          console.log('✅ Entered password')
          
          // Submit the form
          await page.keyboard.press('Enter')
          console.log('✅ Submitted credentials')
          
          // Wait for redirect
          await page.waitForURL(url => !url.includes('sign-in') && !url.includes('clerk.accounts.dev'), {
            timeout: 15000
          })
          
          console.log('✅ Successfully authenticated')
        }
      }
    } catch (error) {
      console.error('❌ Error during authentication:', error)
      
      // Try alternative approach - direct navigation with test token
      console.log('🔄 Attempting alternative authentication method...')
      
      // In test mode, we can sometimes bypass login by navigating directly
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
    }
  } else {
    console.log('✅ Already authenticated or not on sign-in page')
  }
  
  // Verify we're authenticated by checking we're not on sign-in
  const finalUrl = page.url()
  if (!finalUrl.includes('sign-in') && !finalUrl.includes('clerk.accounts.dev')) {
    console.log('✅ Authentication successful - saving state')
    
    // Save authentication state
    await page.context().storageState({ path: authFile })
  } else {
    console.error('❌ Failed to authenticate - still on sign-in page')
    throw new Error('Authentication failed')
  }
})