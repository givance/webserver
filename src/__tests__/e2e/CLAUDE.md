# E2E Testing Guide for AI Assistants

This guide provides comprehensive instructions for AI assistants on how to write, maintain, and debug end-to-end (E2E) tests for the Givance nonprofit donor management platform using Playwright.

## Architecture Overview

### Test Organization Structure
```
src/__tests__/e2e/
├── auth/              # Authentication and authorization tests
├── campaigns/         # Email campaign functionality tests  
├── core/             # Smoke tests, accessibility, database integration
├── donations/        # Donation management tests
├── donors/           # Donor CRUD and management tests
├── projects/         # Project management tests
├── staff/            # Staff management tests
├── setup/            # Global test setup and authentication
└── utils/            # Test utilities and data factories
```

### Test Configuration
- **Base Config**: `playwright.config.ts` - Full configuration with multiple projects
- **Headless Config**: `playwright.config.headless.ts` - For CI/CD and automated runs
- **Test Projects**: 8 distinct projects (setup, auth, campaigns, donors, donations, projects, staff, core)
- **Authentication**: Clerk-based with shared state across test projects

## Core Testing Principles

### 1. Multi-Tenant Security Testing
**CRITICAL**: Every test must respect organization boundaries
```typescript
// ✅ CORRECT - Always verify organization scoping
test('should only show organization donors', async ({ page }) => {
  await page.goto('/donors');
  
  // Verify no cross-tenant data leakage
  const donorRows = page.locator('[data-testid="donor-row"]');
  await expect(donorRows).toHaveCount(3); // Expected test data count
});

// ❌ WRONG - Don't assume data without verification
test('should show donors', async ({ page }) => {
  await page.goto('/donors');
  // Missing verification of correct organization data
});
```

### 2. Robust Element Selection
Use multiple fallback strategies for finding UI elements:
```typescript
// ✅ CORRECT - Multiple selector strategies
const selectors = [
  'button:has-text("Edit")',
  '[data-testid="edit-button"]',
  '.edit-btn',
  'button[aria-label*="edit"]'
];

for (const selector of selectors) {
  const element = page.locator(selector).first();
  if (await element.isVisible().catch(() => false)) {
    await element.click();
    break;
  }
}
```

### 3. Timing and Wait Strategies
Handle the complex async nature of the Next.js application:
```typescript
// ✅ CORRECT - Comprehensive waiting strategy
await page.goto('/donors');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000); // Allow for data loading

// Wait for specific content to appear
await expect(page.locator('text="Loading..."')).toBeHidden();
await expect(page.locator('[data-testid="donor-table"]')).toBeVisible();
```

## Authentication & Setup Patterns

### Global Authentication Setup
Tests depend on `setup/auth.setup.ts` for Clerk authentication:
```typescript
// All test projects depend on the 'setup' project
{
  name: "donors",
  use: {
    storageState: "playwright/.clerk/user.json", // Shared auth state
  },
  dependencies: ["setup"], // Critical dependency
}
```

### Test Data Management
Tests use a combination of:
- **Global Setup**: Creates baseline test data (3 donors, 1 campaign, etc.)
- **Test-Specific Data**: Created/cleaned within individual tests
- **Data Factories**: Utilities for generating consistent test data

```typescript
// ✅ CORRECT - Clean up test-specific data
test.afterEach(async ({ page }) => {
  console.log('🧹 Cleaning up test-created data...');
  // Clean only data created by this specific test
  // Global test data remains for other tests
  console.log('✅ Test data cleanup complete');
});
```

## Common UI Patterns & Best Practices

### 1. Form Testing Patterns
```typescript
test('should create new donor with validation', async ({ page }) => {
  await page.goto('/donors/add');
  
  // Test form validation first
  await page.click('button:has-text("Save")');
  await expect(page.locator('text="Name is required"')).toBeVisible();
  
  // Fill valid data
  await page.fill('[name="firstName"]', 'Test');
  await page.fill('[name="lastName"]', 'Donor');
  await page.fill('[name="email"]', 'test@example.com');
  
  // Submit and verify
  await page.click('button:has-text("Save")');
  await expect(page).toHaveURL(/\/donors$/);
});
```

### 2. Table/List Testing
```typescript
test('should display and interact with donor table', async ({ page }) => {
  await page.goto('/donors');
  
  // Verify table structure
  const table = page.locator('[data-testid="donor-table"]');
  await expect(table).toBeVisible();
  
  // Check for expected columns
  await expect(page.locator('th:has-text("Name")')).toBeVisible();
  await expect(page.locator('th:has-text("Email")')).toBeVisible();
  
  // Verify data rows (based on global test data)
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3); // Expected from global setup
});
```

### 3. Modal/Dialog Testing
```typescript
test('should edit donor via modal', async ({ page }) => {
  await page.goto('/donors');
  
  // Open edit modal
  await page.click('button:has-text("Edit")');
  
  // Wait for modal to appear
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  
  // Interact with modal content
  await page.fill('input[name="firstName"]', 'Updated Name');
  
  // Save and verify modal closes
  await page.click('button:has-text("Save")');
  await expect(modal).toBeHidden();
});
```

## Error Handling & Debugging

### 1. Graceful Degradation
Tests should handle missing UI elements gracefully:
```typescript
test('should handle optional UI elements', async ({ page }) => {
  await page.goto('/donors');
  
  // Check if optional feature is available
  const advancedButton = page.locator('button:has-text("Advanced")');
  const isAdvancedVisible = await advancedButton.isVisible().catch(() => false);
  
  if (isAdvancedVisible) {
    await advancedButton.click();
    // Test advanced functionality
  } else {
    console.log('ℹ️ Advanced features not available - skipping advanced tests');
    // Continue with basic functionality tests
  }
});
```

### 2. Comprehensive Error Reporting
```typescript
test('should provide helpful error context', async ({ page }) => {
  try {
    await page.goto('/donors');
    await expect(page.locator('[data-testid="donor-count"]')).toContainText('3');
  } catch (error) {
    // Capture current state for debugging
    const currentUrl = page.url();
    const pageContent = await page.locator('body').textContent();
    
    console.log('❌ Test failed at URL:', currentUrl);
    console.log('📄 Page content (first 500 chars):', pageContent?.substring(0, 500));
    
    throw new Error(`Donor count verification failed. Current URL: ${currentUrl}`);
  }
});
```

### 3. Screenshot and Debugging Support
```typescript
// Playwright automatically takes screenshots on failure
// Add custom screenshots for debugging complex flows
await page.screenshot({ path: 'debug-state.png', fullPage: true });
```

## Performance & Reliability Best Practices

### 1. Test Isolation
```typescript
// ✅ CORRECT - Each test is independent
test('should create donor', async ({ page }) => {
  // Create unique test data
  const uniqueEmail = `test-${Date.now()}@example.com`;
  
  await page.goto('/donors/add');
  await page.fill('[name="email"]', uniqueEmail);
  // ... rest of test
});
```

### 2. Efficient Waiting
```typescript
// ✅ CORRECT - Specific waits
await page.waitForResponse(resp => 
  resp.url().includes('/api/trpc/donors.list') && resp.status() === 200
);

// ❌ AVOID - Arbitrary timeouts
await page.waitForTimeout(5000); // Use sparingly, only when necessary
```

### 3. Resource Management
```typescript
test.describe('Heavy operations', () => {
  test.beforeAll(async () => {
    // Setup expensive resources once
  });
  
  test.afterAll(async () => {
    // Clean up expensive resources
  });
});
```

## Common Failure Patterns & Solutions

### 1. Timing Issues
**Problem**: Elements not found due to loading states
**Solution**: Use proper wait strategies
```typescript
// Wait for loading to complete
await expect(page.locator('text="Loading..."')).toBeHidden();
await page.waitForLoadState('networkidle');
```

### 2. Authentication State
**Problem**: Tests failing due to lost authentication
**Solution**: Verify auth state before critical operations
```typescript
// Verify authenticated state
await page.goto('/');
if (page.url().includes('sign-in')) {
  throw new Error('Authentication lost - check auth setup');
}
```

### 3. Dynamic Content
**Problem**: Content changes between test runs
**Solution**: Test for patterns, not exact content
```typescript
// ✅ CORRECT - Test for pattern
await expect(page.locator('[data-testid="donor-email"]')).toMatch(/\S+@\S+\.\S+/);

// ❌ FRAGILE - Exact content match
await expect(page.locator('[data-testid="donor-email"]')).toHaveText('test@example.com');
```

## Database Integration Testing

### Test Data Lifecycle
```typescript
test.describe('Database Integration', () => {
  test('should persist data across page refreshes', async ({ page }) => {
    // Create data
    await page.goto('/donors/add');
    const testEmail = `persistent-${Date.now()}@example.com`;
    await page.fill('[name="email"]', testEmail);
    await page.click('button:has-text("Save")');
    
    // Verify persistence
    await page.reload();
    await expect(page.locator(`text="${testEmail}"`)).toBeVisible();
    
    // Cleanup
    await page.click(`button[data-donor-email="${testEmail}"]:has-text("Delete")`);
  });
});
```

## Accessibility Testing Integration

### Basic Accessibility Checks
```typescript
test('should meet basic accessibility requirements', async ({ page }) => {
  await page.goto('/donors');
  
  // Check for proper heading structure
  const mainHeading = page.locator('h1');
  await expect(mainHeading).toBeVisible();
  
  // Verify form labels
  const inputs = page.locator('input[type="text"]');
  for (const input of await inputs.all()) {
    const hasLabel = await input.getAttribute('aria-label') || 
                    await page.locator(`label[for="${await input.getAttribute('id')}"]`).count() > 0;
    expect(hasLabel).toBeTruthy();
  }
});
```

## Campaign & Email Testing Specifics

### Email Generation Testing
```typescript
test('should generate and edit campaign emails', async ({ page }) => {
  await page.goto('/existing-campaigns');
  
  // Find campaign with generated emails
  await page.click('button:has-text("View")');
  await page.waitForURL(/\/campaign\/results\/\w+/);
  
  // Test email editing
  const firstTab = page.locator('[role="tab"]').first();
  await firstTab.click();
  
  await page.click('button:has-text("Edit")');
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible();
  
  // Make changes and verify persistence
  const testContent = `Test content - ${Date.now()}`;
  await page.fill('textarea', testContent);
  await page.click('button:has-text("Save")');
  
  // Verify changes persist after refresh
  await page.reload();
  await firstTab.click();
  await expect(page.locator(`text*="${testContent}"`)).toBeVisible();
});
```

## Mobile & Responsive Testing

### Viewport Testing
```typescript
test('should work on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/donors');
  
  // Check mobile-specific elements
  const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click();
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  }
  
  // Verify no excessive horizontal scrolling
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const horizontalScroll = scrollWidth - clientWidth;
  
  if (horizontalScroll > 50) {
    console.log(`⚠️ Warning: ${horizontalScroll}px horizontal scroll detected`);
  }
});
```

## CI/CD & Automation Considerations

### Headless Configuration
Always use headless config for automated runs:
```bash
npm run test:e2e -- --config=playwright.config.headless.ts
```

### Environment Variables
Tests require proper environment setup:
```typescript
// Tests automatically load from .env.test, then .env.local
// Ensure these are set:
// - CLERK_PUBLISHABLE_KEY
// - CLERK_SECRET_KEY  
// - DATABASE_URL (test database)
```

### Test Output & Reporting
```typescript
// Use consistent logging for debugging
console.log('🔧 Starting test setup...');
console.log('✅ Test completed successfully');
console.log('❌ Test failed:', error.message);
console.log('⚠️ Warning: Non-critical issue detected');
console.log('ℹ️ Info: Additional context');
```

This guide ensures AI assistants can write robust, maintainable e2e tests that properly test the complex multi-tenant nonprofit donor management platform while handling the real-world challenges of testing modern web applications.