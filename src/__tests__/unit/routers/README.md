# tRPC Router Unit Tests

This directory contains unit tests for all tRPC routers in the application.

## Test Structure

Each router test file follows a consistent pattern:

1. **Mock Dependencies**: All external dependencies (services, database) are mocked
2. **Test Context**: Uses test utilities to create proper authentication contexts
3. **Comprehensive Coverage**: Tests cover:
   - Happy path scenarios
   - Error handling
   - Input validation
   - Authorization checks
   - Organization isolation

## Test Files

- `example.test.ts` - Simple public procedures (hello, add, getServerTime)
- `todos.test.ts` - Todo management with CRUD operations and filtering
- `projects.test.ts` - Project management with organization scoping
- `donations.test.ts` - Donation tracking with donor/project validation
- `templates.test.ts` - Email template management with direct DB mocking
- `donors.test.ts` - Complex donor management with notes, staff assignment

## Key Testing Patterns

### 1. Context Creation

```typescript
// Authenticated user context
const ctx = createProtectedTestContext();

// Custom organization
const ctx = createProtectedTestContext({
  user: { organizationId: "org-2" }
});

// Unauthenticated context
const ctx = createTestContext({ auth: { user: null } });
```

### 2. Service Mocking

```typescript
// Mock service methods
mockDonorsData.getDonorById.mockResolvedValue(mockDonor);

// Mock database operations
mockDb.update = jest.fn().mockReturnValue({
  set: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue([result])
  })
});
```

### 3. Error Testing

```typescript
// Test specific error codes
await expectTRPCError(
  caller.getById({ id: 999 }),
  "NOT_FOUND",
  "Donor not found"
);
```

### 4. Input Validation

```typescript
// Test invalid inputs
await expect(
  caller.create({ email: "invalid-email" })
).rejects.toThrow();
```

## Running Tests

```bash
# Run all router tests
npm test src/__tests__/unit/routers

# Run specific router test
npm test src/__tests__/unit/routers/donors.test.ts

# Run with coverage
npm test -- --coverage src/__tests__/unit/routers
```

## Adding New Router Tests

When adding tests for a new router:

1. Create a new test file: `[router-name].test.ts`
2. Import the router and test utilities
3. Mock all external dependencies
4. Test each procedure with:
   - Success cases
   - Authorization failures
   - Validation errors
   - Not found scenarios
   - Organization isolation

## Test Utilities

The `trpc-router-test-utils.ts` file provides:

- `createProtectedTestContext()` - Creates authenticated context
- `createTestContext()` - Creates custom context
- `expectTRPCError()` - Asserts specific tRPC errors
- `createMockBackendUser()` - Creates mock user objects

## Best Practices

1. **Always mock external dependencies** - Never make real DB/API calls
2. **Test authorization** - Verify procedures check user permissions
3. **Test organization isolation** - Ensure multi-tenant security
4. **Test edge cases** - Empty results, null values, missing data
5. **Use descriptive test names** - Clear about what's being tested
6. **Mock at appropriate level** - Service layer for business logic, DB for direct queries