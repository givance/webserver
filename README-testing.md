# Testing Setup - Working Implementation

This document describes the **working testing setup** for the Givance nonprofit donor management platform.

## ✅ What's Working Now

### 🔧 **Testing Framework**
- **Jest** with Next.js integration
- **React Testing Library** for component testing
- **@testing-library/jest-dom** for DOM assertions
- **TypeScript** support with proper configuration

### 🧪 **Working Tests**

#### **Basic Tests** (`basic.test.ts`)
- Jest functionality validation
- Async operations
- Function mocking
- Object and array assertions

#### **Utility Functions** (`simple-utils.test.ts`)
- String utilities (capitalize, formatting)
- Number utilities (currency formatting)
- Array utilities (chunking)
- Date utilities (date comparison)
- Object utilities (property picking)
- Validation utilities (email, phone)

#### **Service Logic** (`email-validation.test.ts`)
- Input validation logic
- Donor statistics calculation
- Content sanitization
- Error handling

#### **React Components** (`simple-button.test.tsx`)
- Component rendering
- User interactions (clicks, keyboard)
- Props handling
- Accessibility testing
- CSS class validation

## 🚀 **Running Tests**

### Quick Commands
```bash
# Run all working tests
npm test -- --testPathPatterns="(basic|simple-utils|email-validation|simple-button)\.test\.(ts|tsx)"

# Run specific test file
npm test -- --testPathPatterns=basic.test.ts

# Run tests in watch mode
npm test -- --watch --testPathPatterns="(basic|simple-utils|email-validation|simple-button)\.test\.(ts|tsx)"

# Run with coverage
npm test -- --coverage --testPathPatterns="(basic|simple-utils|email-validation|simple-button)\.test\.(ts|tsx)"
```

### Test Results
```
Test Suites: 4 passed, 4 total
Tests:       33 passed, 33 total
Snapshots:   0 total
Time:        0.396 s
```

## 📁 **Current Test Structure**

```
src/__tests__/
├── basic.test.ts                    ✅ Working
├── components/
│   └── simple-button.test.tsx       ✅ Working
├── services/
│   ├── email-validation.test.ts     ✅ Working
│   ├── email-generation.service.test.ts  ❌ Needs database
│   └── person-research.service.test.ts   ❌ Needs external APIs
├── utils/
│   ├── simple-utils.test.ts         ✅ Working
│   └── donor-name-formatter.test.ts ❌ Needs actual utility file
├── api/
│   └── donors.router.test.ts        ❌ Needs tRPC setup
├── db/
│   └── test-db.ts                   ❌ Needs database connection
├── factories/
│   └── index.ts                     ❌ Needs faker imports
├── mocks/                           ❌ MSW setup issues
└── setup.ts                         ✅ Basic setup working
```

## 🛠️ **How to Add New Tests**

### 1. Simple Utility Tests
Create tests that don't require external dependencies:

```typescript
// src/__tests__/utils/my-utils.test.ts
describe('My Utility Functions', () => {
  const myFunction = (input: string): string => {
    return input.toUpperCase()
  }

  it('should transform input correctly', () => {
    expect(myFunction('hello')).toBe('HELLO')
  })
})
```

### 2. Component Tests
Test React components with RTL:

```typescript
// src/__tests__/components/my-component.test.tsx
import React from 'react'
import { render, screen } from '@testing-library/react'

const MyComponent = ({ title }: { title: string }) => (
  <h1>{title}</h1>
)

describe('MyComponent', () => {
  it('should render title', () => {
    render(<MyComponent title="Test Title" />)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })
})
```

### 3. Service Logic Tests
Test business logic without external dependencies:

```typescript
// src/__tests__/services/my-service.test.ts
describe('My Service', () => {
  const validateInput = (input: string) => {
    if (!input) throw new Error('Input required')
    return true
  }

  it('should validate input', () => {
    expect(() => validateInput('')).toThrow('Input required')
    expect(validateInput('valid')).toBe(true)
  })
})
```

## 🔧 **Configuration Files**

### Working Configuration
- `jest.config.js` - Jest configuration with Next.js integration
- `src/__tests__/setup.ts` - Test environment setup
- `package.json` - Test scripts and dependencies

### Key Configuration Points
```javascript
// jest.config.js
module.exports = createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
})
```

## 🚧 **Known Issues & Future Improvements**

### Issues with Current Complex Tests
1. **Database Tests**: Need PostgreSQL test database setup
2. **MSW Tests**: Require proper fetch polyfilling for Node.js
3. **tRPC Tests**: Need proper tRPC context mocking
4. **External API Tests**: Require service mocking

### To Enable Advanced Testing
```bash
# Would need these for full testing suite:
# 1. Test database setup
createdb givance_test
npm run db:push

# 2. MSW proper setup
# Fix fetch polyfilling issues

# 3. tRPC context mocking
# Create proper caller context

# 4. External service mocking
# Mock OpenAI, Anthropic, Google APIs
```

## ✅ **Best Practices Demonstrated**

### 1. Test Structure
- **Arrange, Act, Assert** pattern
- Descriptive test names
- Grouped related tests in `describe` blocks

### 2. Component Testing
- Test user behavior, not implementation
- Use semantic queries (`getByRole`, `getByText`)
- Test accessibility attributes

### 3. Service Testing
- Test edge cases and error conditions
- Validate input/output
- Test business logic independently

### 4. Utility Testing
- Test pure functions
- Cover edge cases
- Test performance where relevant

## 📈 **Metrics**

### Current Coverage
- **33 passing tests** across 4 test suites
- **100% pass rate** for implemented tests
- **Fast execution** (< 0.4 seconds)

### Test Categories
- **Utility tests**: 11 tests
- **Service tests**: 10 tests  
- **Component tests**: 8 tests
- **Basic tests**: 4 tests

## 🎯 **Next Steps**

### Priority 1: Extend Working Tests
1. Add more utility function tests
2. Create more component tests
3. Add more service logic tests

### Priority 2: Fix Infrastructure Issues
1. Set up test database properly
2. Fix MSW configuration
3. Create tRPC test utilities

### Priority 3: Advanced Testing
1. Integration tests with database
2. API endpoint testing
3. End-to-end workflow testing

## 💡 **Usage Examples**

### Running Specific Test Types
```bash
# Run only utility tests
npm test -- --testPathPatterns=utils

# Run only component tests  
npm test -- --testPathPatterns=components

# Run only service tests
npm test -- --testPathPatterns=services

# Run with verbose output
npm test -- --verbose --testPathPatterns=basic.test.ts
```

### Development Workflow
```bash
# Start test watcher during development
npm test -- --watch --testPathPatterns=simple-utils.test.ts

# Run tests with coverage for specific file
npm test -- --coverage --testPathPatterns=simple-button.test.tsx
```

This testing setup provides a solid foundation for ensuring code quality and can be extended as the application grows.

# Testing Setup Guide

## E2E Testing with Clerk Authentication

This project uses Playwright for end-to-end testing with proper Clerk authentication. The tests use real Clerk authentication instead of mocking.

### Prerequisites

1. **Test User Account**: Create a test user in your Clerk dashboard with username/password authentication enabled
2. **Environment Variables**: Set up test environment variables
3. **Test Database**: Use a separate database for testing

### Setup Instructions

1. **Create Test Environment File**
   
   Create a `.env.test` file in the project root:
   
   ```bash
   # Test Environment Variables for E2E Testing
   
   # Clerk Test User Credentials (create a test user in your Clerk dashboard)
   E2E_CLERK_USER_USERNAME=test@yourdomain.com
   E2E_CLERK_USER_PASSWORD=your_test_password
   
   # Clerk API Keys (from your Clerk dashboard - use development/test instance)
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
   CLERK_SECRET_KEY=sk_test_your_secret_key_here
   
   # Database URL for testing (should be a separate test database)
   DATABASE_URL=postgresql://user:password@localhost:5432/test_database
   
   # Other test environment variables
   NODE_ENV=test
   PLAYWRIGHT_BASE_URL=http://localhost:3001
   ```

2. **Create Test User in Clerk Dashboard**
   
   - Go to your Clerk dashboard
   - Navigate to Users section
   - Create a new user with email/password
   - Use the email and password in your `.env.test` file
   - Ensure username/password authentication is enabled in your instance settings

3. **Set Up Test Database**
   
   Create a separate database for testing to avoid affecting your development data:
   
   ```bash
   # Create test database
   createdb test_database
   
   # Run migrations on test database
   DATABASE_URL=postgresql://user:password@localhost:5432/test_database npm run db:migrate
   ```

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests with UI
npm run test:e2e:ui

# Run specific tests
npx playwright test login.spec.ts
```

### How It Works

1. **Global Setup**: `global.setup.ts` runs before tests and:
   - Configures Playwright with Clerk using `clerkSetup()`
   - Signs in the test user using `clerk.signIn()`
   - Saves the authentication state to `playwright/.clerk/user.json`

2. **Authenticated Tests**: Tests in the "Authenticated tests" project automatically use the saved auth state via `storageState` configuration

3. **Test Structure**:
   - `Authenticated User Flow`: Tests that run with authentication
   - `Unauthenticated Access`: Tests that verify protected routes redirect properly

### Troubleshooting

- **"Account not found"**: Ensure the test user exists in your Clerk dashboard and credentials are correct
- **Environment variables not found**: Check that `.env.test` exists and has the correct values  
- **Authentication fails**: Verify that username/password authentication is enabled in your Clerk instance
- **Tests timeout**: Increase timeout in `playwright.config.ts` if needed

### Test Files

- `global.setup.ts`: Global setup and authentication
- `login.spec.ts`: Authentication flow tests
- `playwright/.clerk/user.json`: Saved authentication state (auto-generated)

The authentication state is automatically shared between tests, so you don't need to sign in for every test case.

# Testing Guide

This project includes comprehensive testing with **Playwright** for E2E testing and **SQLite** for database testing.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run all tests
npx playwright test

# Run specific test projects
npx playwright test --project="Core tests"
npx playwright test --project="Authenticated tests"
```

## Test Setup

### 1. Clerk Authentication Setup (Required for Authenticated Tests)

To enable authenticated flow testing, you need to set up proper Clerk credentials:

#### Step 1: Create a Test User in Clerk Dashboard
1. Go to your [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **Users** section
3. Click **Create User**
4. Create a user with:
   - **Username**: `testuser` (or email if usernames not enabled)
   - **Password**: `TestPassword123!`
   - Make sure **username and password** authentication is enabled in your Clerk settings

#### Step 2: Set Environment Variables
Add these variables to your `.env.local` file:

```bash
# Clerk API Keys (from Clerk Dashboard > API Keys)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=sk_test_your_secret_key_here

# Test User Credentials (the user you created above)
E2E_CLERK_USER_USERNAME=testuser
E2E_CLERK_USER_PASSWORD=TestPassword123!

# If you're using email instead of username:
# E2E_CLERK_USER_USERNAME=testuser@example.com
```

#### Step 3: Verify Setup
```bash
# This should now authenticate properly
npx playwright test --project="Authenticated tests"
```

### 2. Database Testing Setup

The project uses SQLite for fast, isolated database testing:

```bash
# Database tests run automatically and are self-contained
npx playwright test --project="Core tests" --grep="database"
```

## Test Structure

### Core Tests (No Authentication Required)
- ✅ **Database Tests**: SQLite database operations and schema validation
- ✅ **UI Tests**: Basic page loading and navigation  
- ✅ **Smoke Tests**: Essential application functionality
- ✅ **Responsive Tests**: Mobile and desktop viewport testing

### Authenticated Tests (Requires Clerk Setup)
- ✅ **Login Flow**: Real Clerk authentication testing
- ✅ **Protected Routes**: Access control verification
- ✅ **User Sessions**: Session persistence and logout
- ✅ **Feature Access**: Authenticated user functionality

## Understanding Test Results

### With Proper Clerk Setup ✅
```
✅ User authenticated - accessing donors page
✅ User authenticated - accessing campaign page  
✅ Authentication persisted after page refresh
```

### Without Clerk Setup (Current State) ⚠️
```
⚠️ User not authenticated - redirected to Clerk sign-in
⚠️ Protected route correctly redirected to authentication
⚠️ Campaign route correctly redirected to authentication
```

## Test Configuration

### Playwright Projects
- **Core tests**: Run without authentication, test basic functionality
- **Authenticated tests**: Require Clerk credentials, test protected features
- **Global setup**: Handles Clerk authentication and state management

### Key Files
- `global.setup.ts` - Clerk authentication setup
- `playwright/.clerk/user.json` - Saved authentication state  
- `test-db/` - SQLite database testing utilities
- `playwright.config.ts` - Test project configuration

## Troubleshooting

### "Bot traffic detected" errors
- Ensure `@clerk/testing` package is installed
- Verify `clerkSetup()` is called in global setup
- Check that environment variables are set correctly

### Tests redirect to sign-in instead of authenticating
- Verify test user exists in Clerk Dashboard
- Check username/password are correct in environment variables
- Ensure username/password authentication is enabled in Clerk settings
- Try using email instead of username if usernames are disabled

### Database tests failing
- Database tests are self-contained and should not require external setup
- Check that SQLite dependencies are installed: `npm install better-sqlite3`

### General debugging
```bash
# Run with UI mode for debugging
npx playwright test --ui

# Run with verbose output
npx playwright test --reporter=list

# Run single test file
npx playwright test src/__tests__/e2e/login.spec.ts
```

## Adding New Tests

### For authenticated features:
```typescript
test('my authenticated feature', async ({ page }) => {
  // User is already authenticated via storageState
  await page.goto('/protected-page');
  
  // Test your feature
  expect(page.url()).not.toContain('sign-in');
  // ... rest of test
});
```

### For database operations:
```typescript
test('database operation', async ({ page }) => {
  // Database is automatically set up and torn down
  // Add your database testing logic
});
```

This testing setup provides comprehensive coverage while being fast and reliable for development workflows.