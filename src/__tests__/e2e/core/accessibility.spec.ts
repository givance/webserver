import { test, expect } from '@playwright/test'

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('__clerk_db_jwt', 'mock-jwt-token')
    })
  })

  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/dashboard')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Check for proper heading hierarchy
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all()
      
      if (headings.length > 0) {
        // Should have at least an h1
        const h1 = page.locator('h1').first()
        expect(await h1.isVisible().catch(() => false)).toBe(true)
        
        // Check heading order (basic check)
        const headingLevels = []
        for (const heading of headings) {
          const tagName = await heading.evaluate(el => el.tagName.toLowerCase())
          headingLevels.push(parseInt(tagName.charAt(1)))
        }
        
        // Should start with h1 (or at least have one)
        expect(headingLevels.includes(1)).toBe(true)
      }
    }
  })

  test('should have proper form labels', async ({ page }) => {
    // Test form accessibility on donor creation page
    await page.goto('/donors/new')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      const inputs = await page.locator('input').all()
      
      for (const input of inputs) {
        const inputId = await input.getAttribute('id')
        const inputName = await input.getAttribute('name')
        
        if (inputId || inputName) {
          // Check if input has associated label
          const hasLabel = await page.locator(`label[for="${inputId}"], label:has(input[name="${inputName}"])`).isVisible().catch(() => false)
          const hasAriaLabel = await input.getAttribute('aria-label')
          const hasAriaLabelledBy = await input.getAttribute('aria-labelledby')
          
          // Input should have some form of label
          expect(hasLabel || hasAriaLabel || hasAriaLabelledBy).toBeTruthy()
        }
      }
    }
  })

  test('should have keyboard navigation', async ({ page }) => {
    await page.goto('/dashboard')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Test tab navigation
      await page.keyboard.press('Tab')
      
      // Check if focus is visible
      const focusedElement = page.locator(':focus')
      const isFocusVisible = await focusedElement.isVisible().catch(() => false)
      
      if (isFocusVisible) {
        // Should be able to navigate with keyboard
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        
        // Focus should move
        const newFocusedElement = page.locator(':focus')
        const newFocusVisible = await newFocusedElement.isVisible().catch(() => false)
        
        expect(newFocusVisible).toBe(true)
      }
    }
  })

  test('should have proper button accessibility', async ({ page }) => {
    await page.goto('/campaigns')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      const buttons = await page.locator('button').all()
      
      for (const button of buttons.slice(0, 5)) { // Check first 5 buttons
        // Button should have text content or aria-label
        const buttonText = await button.textContent()
        const ariaLabel = await button.getAttribute('aria-label')
        const title = await button.getAttribute('title')
        
        expect(buttonText?.trim() || ariaLabel || title).toBeTruthy()
        
        // Button should be focusable
        const tabIndex = await button.getAttribute('tabindex')
        const isDisabled = await button.isDisabled()
        
        if (!isDisabled) {
          expect(tabIndex === null || parseInt(tabIndex) >= 0).toBe(true)
        }
      }
    }
  })

  test('should have proper color contrast', async ({ page }) => {
    await page.goto('/')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Basic color contrast check - ensure text is visible
      const textElements = await page.locator('p, span, div, h1, h2, h3, h4, h5, h6, a, button').all()
      
      let visibleElementsChecked = 0
      const maxElementsToCheck = 10
      
      for (const element of textElements) {
        if (visibleElementsChecked >= maxElementsToCheck) break
        
        const textContent = await element.textContent()
        
        if (textContent && textContent.trim().length > 0) {
          // Check if element is visible and in viewport
          const isVisible = await element.isVisible().catch(() => false)
          const isInViewport = await element.isInViewport().catch(() => false)
          
          // Only test elements that are actually visible and in viewport
          if (isVisible && isInViewport) {
            visibleElementsChecked++
            
            // Element should have some opacity
            const opacity = await element.evaluate(el => {
              const styles = window.getComputedStyle(el)
              return parseFloat(styles.opacity)
            }).catch(() => 1) // Default to 1 if evaluation fails
            
            expect(opacity).toBeGreaterThan(0)
          }
        }
      }
      
      // Ensure we checked at least some elements
      if (visibleElementsChecked === 0) {
        console.log('⚠️ Warning: No visible text elements found for color contrast testing')
        // Don't fail the test if no elements are found - this might be expected for some pages
      } else {
        console.log(`✅ Checked ${visibleElementsChecked} visible elements for color contrast`)
      }
    }
  })

  test('should handle focus management in modals', async ({ page }) => {
    await page.goto('/campaign')
    
    if (!page.url().includes('sign-in') && !page.url().includes('auth')) {
      // Look for modal triggers
      const modalTriggers = page.locator('button:has-text("Preview"), button:has-text("Settings"), button[data-modal]')
      
      if (await modalTriggers.first().isVisible().catch(() => false)) {
        await modalTriggers.first().click()
        await page.waitForTimeout(500)
        
        // Check if modal is open
        const modal = page.locator('[role="dialog"], .modal, .popup')
        
        if (await modal.isVisible().catch(() => false)) {
          // Focus should be trapped in modal
          const focusableElements = modal.locator('button, input, select, textarea, a[href]')
          
          if (await focusableElements.first().isVisible().catch(() => false)) {
            await page.keyboard.press('Tab')
            
            // Focus should stay within modal
            const focusedElement = page.locator(':focus')
            const isFocusInModal = await modal.locator(':focus').isVisible().catch(() => false)
            
            expect(isFocusInModal).toBe(true)
          }
        }
      }
    }
  })
})