# Testing Documentation

This document provides comprehensive information about the testing setup, patterns, and best practices for the Givance nonprofit donor management platform.

## Overview

Our testing strategy follows a pyramid approach with comprehensive coverage at multiple levels:

- **Unit Tests** (70%): Test individual functions, components, and services
- **Integration Tests** (20%): Test API endpoints, database operations, and service interactions  
- **E2E Tests** (10%): Test complete user workflows and critical business scenarios

## Test Stack

### Core Testing Technologies
- **Jest**: JavaScript testing framework for unit and integration tests
- **React Testing Library**: Component testing utilities focused on user behavior
- **Playwright**: End-to-end testing for cross-browser automation
- **MSW (Mock Service Worker)**: API mocking for reliable test isolation

### Supporting Tools
- **@faker-js/faker**: Test data generation
- **@testing-library/jest-dom**: Additional Jest matchers for DOM testing
- **@testing-library/user-event**: Realistic user interaction simulation

## Running Tests

### Quick Commands
```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run linting
npm run lint

# Run type checking
npx tsc --noEmit
```

### Test Database Setup
```bash
# Set up test database
createdb givance_test

# Run migrations
npm run db:push
```

## Test Organization

### Directory Structure
```
src/
├── __tests__/
│   ├── setup.ts                 # Jest configuration
│   ├── db/
│   │   └── test-db.ts          # Database test utilities
│   ├── factories/
│   │   └── index.ts            # Test data factories
│   ├── mocks/
│   │   ├── server.ts           # MSW server setup
│   │   ├── handlers.ts         # API mock handlers
│   │   └── ai-services.ts      # AI service mocks
│   ├── utils/
│   │   └── test-utils.tsx      # Testing utilities
│   ├── services/               # Service layer tests
│   ├── api/                    # API/tRPC tests
│   ├── components/             # Component tests
│   └── utils/                  # Utility function tests
e2e/                            # End-to-end tests
```

### Naming Conventions
- Test files: `*.test.ts` or `*.test.tsx`
- E2E tests: `*.spec.ts`
- Mocks: `*.mock.ts`
- Factories: `*Factory.ts`

## Testing Patterns

### Unit Testing

#### Service Layer Testing
```typescript
import { EmailGenerationService } from '../../app/lib/services/email-generation.service'
import { testDb, createTestOrganization, withTestDb } from '../db/test-db'

describe('EmailGenerationService', () => {
  describe('validateEmailGenerationInput', () => {
    it('should validate valid input correctly', () => {
      const validInput = {
        instruction: 'Send thank you emails',
        donors: [{ id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' }],
        organizationName: 'Test Org'
      }

      expect(() => EmailGenerationService.validateInput(validInput)).not.toThrow()
    })
  })
})
```

#### Component Testing
```typescript
import { render, screen, fireEvent } from '../utils/test-utils'
import { CampaignSteps } from '../../app/(app)/campaign/components/CampaignSteps'

describe('CampaignSteps', () => {
  it('should render with step 1 as default', () => {
    render(<CampaignSteps onClose={jest.fn()} />)
    
    expect(screen.getByText('Select Donors')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
  })
})
```

### Integration Testing

#### API Testing
```typescript
import { appRouter } from '../../app/api/trpc/routers/_app'
import { testDb, createTestOrganization, withTestDb } from '../db/test-db'

describe('Donors Router', () => {
  it('should return paginated donors for organization', withTestDb(async () => {
    const org = await createTestOrganization()
    const caller = appRouter.createCaller(mockContext)
    
    const result = await caller.donors.getAll({
      page: 1,
      pageSize: 10
    })

    expect(result.donors).toBeDefined()
    expect(result.totalCount).toBeGreaterThanOrEqual(0)
  }))
})
```

### End-to-End Testing

#### Critical User Journeys
```typescript
import { test, expect } from '@playwright/test'

test('should complete full campaign creation workflow', async ({ page }) => {
  await page.goto('/campaign')
  
  // Step 1: Select Donors
  await page.getByTestId('donor-checkbox-1').click()
  await page.getByRole('button', { name: 'Next' }).click()
  
  // Step 2: Campaign Name
  await page.getByPlaceholder('Enter campaign name').fill('Q4 Thank You Campaign')
  await page.getByRole('button', { name: 'Next' }).click()
  
  // Continue through workflow...
})
```

## Test Data Management

### Factories
Use factories for consistent test data generation:

```typescript
import { createDonorFactory, createOrganizationFactory } from '../factories'

const org = createOrganizationFactory({ name: 'Test Org' })
const donor = createDonorFactory(org.id, { firstName: 'John', lastName: 'Doe' })
```

### Database Testing
Use the `withTestDb` helper for database isolation:

```typescript
import { withTestDb, testDb } from '../db/test-db'

it('should create donor', withTestDb(async () => {
  const donor = await testDb.insert(schema.donors).values(donorData).returning()
  expect(donor.id).toBeDefined()
}))
```

### API Mocking
Mock external APIs using MSW:

```typescript
// In handlers.ts
http.post('https://api.openai.com/v1/chat/completions', () => {
  return HttpResponse.json(mockOpenAIResponse)
})
```

## Coverage Requirements

### Minimum Coverage Thresholds
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

### Coverage Exclusions
- Type definition files (`*.d.ts`)
- Story files (`*.stories.*`)
- Index files (`index.ts`)
- Layout and page components
- Middleware

## Best Practices

### Testing Principles
1. **Test behavior, not implementation**: Focus on what the code does, not how it does it
2. **Arrange, Act, Assert**: Structure tests clearly with setup, execution, and verification
3. **One assertion per test**: Keep tests focused and easy to understand
4. **Descriptive test names**: Use clear, descriptive names that explain the scenario
5. **Independent tests**: Each test should be able to run in isolation

### What to Test
✅ **DO Test:**
- Business logic and edge cases
- User interactions and workflows
- Error handling and validation
- Data transformations
- Integration points
- Accessibility requirements

❌ **DON'T Test:**
- Implementation details
- Third-party libraries
- Simple getters/setters
- Mock implementations
- Generated code

### Component Testing Guidelines
- Use `render` from test-utils for consistent provider setup
- Test user interactions, not component internals
- Mock external dependencies and API calls
- Test both happy path and error scenarios
- Verify accessibility attributes

### API Testing Guidelines
- Test all CRUD operations
- Verify authorization and scoping
- Test input validation and sanitization
- Test error responses and edge cases
- Use real database transactions when possible

### Performance Testing
- Lighthouse CI for performance metrics
- Bundle size analysis
- Memory leak detection
- Database query optimization
- API response time monitoring

## CI/CD Integration

### GitHub Actions Workflow
Our CI pipeline runs:
1. **Unit Tests**: Jest tests with coverage reporting
2. **E2E Tests**: Playwright tests across browsers
3. **Type Checking**: TypeScript compilation
4. **Linting**: ESLint code quality checks
5. **Security Scanning**: Dependency vulnerability checks
6. **Performance Testing**: Lighthouse CI (PR only)

### Pre-commit Hooks
```bash
# Install pre-commit hooks
npm run prepare

# Manual pre-commit check
npm run pre-commit
```

## Debugging Tests

### Jest Debugging
```bash
# Run specific test file
npm test -- donors.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should validate"

# Debug mode
npm test -- --detectOpenHandles --forceExit
```

### Playwright Debugging
```bash
# Run with UI mode
npm run test:e2e:ui

# Debug specific test
npx playwright test campaign-creation.spec.ts --debug

# Show trace viewer
npx playwright show-trace trace.zip
```

## Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Reset test database
dropdb givance_test && createdb givance_test
npm run db:push
```

#### Memory Issues
```bash
# Run tests with increased memory
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

#### Flaky Tests
- Use `waitFor` for async operations
- Mock time-dependent functionality
- Ensure proper cleanup in `afterEach`
- Use stable selectors in E2E tests

### Test Data Cleanup
```typescript
// In test setup
afterEach(async () => {
  await resetDatabase()
  jest.clearAllMocks()
})
```

## Monitoring and Reporting

### Coverage Reports
- Generated in `coverage/` directory
- HTML report: `coverage/lcov-report/index.html`
- Uploaded to Codecov in CI

### Test Results
- Jest: Console output with detailed results
- Playwright: HTML report in `playwright-report/`
- GitHub Actions: Test results in PR comments

### Performance Metrics
- Lighthouse CI reports
- Bundle analysis in CI
- Performance budgets enforced

## Contributing

### Adding New Tests
1. Follow existing patterns and structure
2. Use appropriate test type (unit/integration/e2e)
3. Write descriptive test names and comments
4. Ensure tests are deterministic and fast
5. Update documentation if needed

### Test Review Checklist
- [ ] Tests cover both happy path and edge cases
- [ ] Test names are descriptive and clear
- [ ] Tests are isolated and independent
- [ ] Appropriate mocking is used
- [ ] Performance impact is considered
- [ ] Accessibility is tested where relevant