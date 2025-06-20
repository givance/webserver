# E2E Tests Organization

This directory contains end-to-end tests organized by component for easy execution and maintenance.

## Directory Structure

```
src/__tests__/e2e/
├── auth/           # Authentication and login tests
├── campaigns/      # Campaign management tests
├── donors/         # Donor management tests
├── donations/      # Donation management tests
├── projects/       # Project management tests
├── staff/          # Staff management tests
├── core/           # Core functionality (database, dashboard, smoke tests)
└── setup/          # Test setup and configuration files
```

## Running Tests

### Run all e2e tests
```bash
pnpm test:e2e
```

### Run tests by component
```bash
pnpm test:e2e:auth          # Authentication tests
pnpm test:e2e:campaigns     # Campaign tests
pnpm test:e2e:donors        # Donor tests
pnpm test:e2e:donations     # Donation tests
pnpm test:e2e:projects      # Project tests
pnpm test:e2e:staff         # Staff tests
pnpm test:e2e:core          # Core functionality tests
```

### Run with UI
```bash
pnpm test:e2e:ui
```

### Run all authenticated tests (legacy)
```bash
pnpm test:e2e:authenticated
```

## Test Configuration

Each component has its own Playwright project configuration in `playwright.config.ts`, allowing for:
- Component-specific test execution
- Isolated test environments
- Parallel execution where appropriate
- Shared authentication state

## Adding New Tests

When adding new tests:
1. Place them in the appropriate component directory
2. Follow the naming convention: `*.spec.ts`
3. Use the shared authentication state when needed
4. Update this README if adding new components 