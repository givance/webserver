import { test, expect } from '@playwright/test'

test.describe('Email Campaign Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Set up authentication - this would typically involve logging in
    // For now, we'll mock the authentication state
    await page.goto('/')
    
    // Mock authentication state
    await page.addInitScript(() => {
      window.localStorage.setItem('clerk-session', JSON.stringify({
        userId: 'test-user-id',
        orgId: 'test-org-id',
        isSignedIn: true
      }))
    })
  })

  test('should complete full campaign creation workflow', async ({ page }) => {
    // Navigate to campaign creation
    await page.goto('/campaign')
    await expect(page.getByText('Create New Campaign')).toBeVisible()

    // Step 1: Select Donors
    await expect(page.getByText('Step 1 of 4')).toBeVisible()
    await expect(page.getByText('Select Donors')).toBeVisible()

    // Select some donors
    await page.getByTestId('donor-checkbox-1').click()
    await page.getByTestId('donor-checkbox-2').click()
    await page.getByTestId('donor-checkbox-3').click()

    // Verify selected count
    await expect(page.getByText('3 donors selected')).toBeVisible()

    // Proceed to next step
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2: Campaign Name
    await expect(page.getByText('Step 2 of 4')).toBeVisible()
    await expect(page.getByText('Campaign Name')).toBeVisible()

    await page.getByPlaceholder('Enter campaign name').fill('Q4 Thank You Campaign')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3: Select Template (optional)
    await expect(page.getByText('Step 3 of 4')).toBeVisible()
    await expect(page.getByText('Select Template')).toBeVisible()

    // Skip template selection
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 4: Write Instructions
    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(page.getByText('Write Instructions')).toBeVisible()

    const instruction = `Please write personalized thank you emails to our donors. 
    Include:
    - Personal greeting using their name
    - Gratitude for their specific donation amount
    - Update on how their contribution is being used
    - Invitation to upcoming donor appreciation event
    
    Keep the tone warm and professional.`

    await page.getByPlaceholder('Write your email instruction...').fill(instruction)

    // Generate emails
    await page.getByRole('button', { name: 'Generate Emails' }).click()

    // Wait for AI generation
    await expect(page.getByText('Generating personalized emails...')).toBeVisible()
    
    // Should show progress
    await expect(page.getByRole('progressbar')).toBeVisible()

    // Wait for completion (this might take a while in real scenarios)
    await expect(page.getByText('Email generation completed!')).toBeVisible({ timeout: 30000 })

    // Verify results
    await expect(page.getByText('3 emails generated')).toBeVisible()
    
    // Should show preview of generated emails
    await expect(page.getByTestId('email-preview-1')).toBeVisible()
    await expect(page.getByTestId('email-preview-2')).toBeVisible()
    await expect(page.getByTestId('email-preview-3')).toBeVisible()

    // Each email should have subject and body
    const firstEmail = page.getByTestId('email-preview-1')
    await expect(firstEmail.getByTestId('email-subject')).not.toBeEmpty()
    await expect(firstEmail.getByTestId('email-body')).not.toBeEmpty()

    // Should be able to edit individual emails
    await firstEmail.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByTestId('email-edit-modal')).toBeVisible()
    
    await page.getByTestId('email-subject-input').fill('Updated Thank You Subject')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    
    await expect(page.getByText('Updated Thank You Subject')).toBeVisible()

    // Review and send
    await page.getByRole('button', { name: 'Review & Send' }).click()
    
    // Final review screen
    await expect(page.getByText('Review Campaign')).toBeVisible()
    await expect(page.getByText('Q4 Thank You Campaign')).toBeVisible()
    await expect(page.getByText('3 recipients')).toBeVisible()

    // Send campaign
    await page.getByRole('button', { name: 'Send Campaign' }).click()

    // Confirmation
    await expect(page.getByText('Campaign sent successfully!')).toBeVisible()
    await expect(page.getByText('3 emails queued for delivery')).toBeVisible()

    // Should redirect to campaign results
    await expect(page).toHaveURL(/\/campaign\/results/)
  })

  test('should handle campaign editing workflow', async ({ page }) => {
    // Navigate to existing campaigns
    await page.goto('/existing-campaigns')
    
    // Find and edit a campaign
    await page.getByTestId('campaign-row-1').getByRole('button', { name: 'Edit' }).click()

    // Should start at instruction step in edit mode
    await expect(page.getByText('Edit Campaign')).toBeVisible()
    await expect(page.getByText('Write Instructions')).toBeVisible()

    // Should show existing chat history
    await expect(page.getByTestId('chat-history')).toBeVisible()
    
    // Should show previous instruction
    const instructionInput = page.getByPlaceholder('Write your email instruction...')
    await expect(instructionInput).not.toBeEmpty()

    // Refine the instruction
    await instructionInput.fill('Please update the previous emails to include our new volunteer opportunity information.')

    // Generate updated emails
    await page.getByRole('button', { name: 'Generate Updated Emails' }).click()

    await expect(page.getByText('Updating emails...')).toBeVisible()
    await expect(page.getByText('Emails updated successfully!')).toBeVisible({ timeout: 30000 })

    // Should show updated emails
    await expect(page.getByText('volunteer opportunity')).toBeVisible()
  })

  test('should validate required fields and show appropriate errors', async ({ page }) => {
    await page.goto('/campaign')

    // Try to proceed without selecting donors
    await page.getByRole('button', { name: 'Next' }).click()
    
    await expect(page.getByText('Please select at least one donor')).toBeVisible()
    await expect(page.getByText('Step 1 of 4')).toBeVisible() // Should stay on same step

    // Select donors and proceed
    await page.getByTestId('donor-checkbox-1').click()
    await page.getByRole('button', { name: 'Next' }).click()

    // Try to proceed without campaign name
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Please enter a campaign name')).toBeVisible()

    // Enter campaign name and proceed
    await page.getByPlaceholder('Enter campaign name').fill('Test Campaign')
    await page.getByRole('button', { name: 'Next' }).click()

    // Skip template
    await page.getByRole('button', { name: 'Next' }).click()

    // Try to generate without instruction
    await page.getByRole('button', { name: 'Generate Emails' }).click()
    await expect(page.getByText('Please provide an instruction')).toBeVisible()
  })

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('/api/trpc/emailGeneration.generateEmails', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      })
    })

    await page.goto('/campaign')

    // Complete the workflow
    await page.getByTestId('donor-checkbox-1').click()
    await page.getByRole('button', { name: 'Next' }).click()
    
    await page.getByPlaceholder('Enter campaign name').fill('Test Campaign')
    await page.getByRole('button', { name: 'Next' }).click()
    
    await page.getByRole('button', { name: 'Next' }).click()
    
    await page.getByPlaceholder('Write your email instruction...').fill('Test instruction')
    await page.getByRole('button', { name: 'Generate Emails' }).click()

    // Should show error message
    await expect(page.getByText('Failed to generate emails')).toBeVisible()
    await expect(page.getByText('Please try again')).toBeVisible()

    // Should allow retry
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  test('should support browser back/forward navigation', async ({ page }) => {
    await page.goto('/campaign')

    // Progress through steps
    await page.getByTestId('donor-checkbox-1').click()
    await page.getByRole('button', { name: 'Next' }).click()

    await page.getByPlaceholder('Enter campaign name').fill('Test Campaign')
    await page.getByRole('button', { name: 'Next' }).click()

    // Use browser back button
    await page.goBack()
    
    // Should be on campaign name step with data preserved
    await expect(page.getByText('Step 2 of 4')).toBeVisible()
    await expect(page.getByDisplayValue('Test Campaign')).toBeVisible()

    // Use browser forward button
    await page.goForward()
    
    // Should be on template step
    await expect(page.getByText('Step 3 of 4')).toBeVisible()
  })

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto('/campaign')

    // Should show mobile-optimized layout
    await expect(page.getByTestId('mobile-campaign-header')).toBeVisible()
    
    // Step indicators should be compact on mobile
    await expect(page.getByTestId('compact-step-indicator')).toBeVisible()

    // Donor selection should work with touch
    await page.getByTestId('donor-checkbox-1').tap()
    await expect(page.getByTestId('donor-checkbox-1')).toBeChecked()

    // Navigation should work
    await page.getByRole('button', { name: 'Next' }).tap()
    await expect(page.getByText('Step 2 of 4')).toBeVisible()
  })
})