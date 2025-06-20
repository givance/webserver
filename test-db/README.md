# PostgreSQL Test Database Setup

This directory contains utilities for setting up and managing the PostgreSQL test database used in end-to-end tests.

## Overview

The test database setup has been migrated from SQLite to PostgreSQL for better consistency with the production environment. The setup uses Drizzle ORM for type-safe database operations and migrations.

## Quick Start

### 1. Prerequisites

- PostgreSQL server running locally
- Node.js version 22.4.0 (`nvm use 22.4.0`)
- pnpm package manager

### 2. Create Test Database

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create test database and user
CREATE DATABASE givance_test;
CREATE USER test WITH ENCRYPTED PASSWORD 'test';
GRANT ALL PRIVILEGES ON DATABASE givance_test TO test;
\q
```

### 3. Set Environment Variables

Create a `.env.test` file in the project root:

```env
# PostgreSQL Test Database
DATABASE_URL=postgresql://test:test@localhost:5432/givance_test

# Clerk Test Configuration
CLERK_PUBLISHABLE_KEY=pk_test_your_test_key_here
CLERK_SECRET_KEY=sk_test_your_test_key_here

# Other test environment variables...
```

### 4. Run Tests

```bash
# Run all E2E tests (includes database setup)
pnpm test:e2e

# Run specific database integration tests
pnpm test:e2e database-integration
```

## Database Setup Process

The test database setup follows this sequence:

1. **Connection**: Connects to PostgreSQL using `DATABASE_URL` from `.env.test`
2. **Cleanup**: Removes existing test data (safe for repeated runs)
3. **Migrations**: Runs all Drizzle migrations to create tables
4. **Test Data**: Inserts comprehensive test data including:
   - Test users and organizations
   - Sample donors with various states and classifications
   - Staff members
   - Email campaigns
   - Projects

## Test Data Structure

### Test Organization
- **ID**: `org_2yl9dNO866AsVhdsRMmTr2CtJ4a`
- **Name**: "Test Org"
- **Admin User**: `user_2yl6QlrDHV2dq83Yql2WS9LZWpo`

### Test Donors
1. **Alice Johnson** (CA) - Engaged donor, regular pattern
2. **Bob Smith** (NY) - High potential, committed donor
3. **Carol Davis** (TX) - New donor, growth potential

### Test Campaigns  
1. **E2E Test Campaign 1** - Completed thank you emails
2. **E2E Test Campaign 2** - Pending year-end appeal

## Files Structure

```
test-db/
├── setup-test-db.ts          # Standalone PostgreSQL setup (backward compatibility)
└── README.md                 # This file

src/__tests__/e2e/setup/
└── database-setup.ts         # Main PostgreSQL test database setup
```

## Key Features

### Type-Safe Operations
- Uses Drizzle ORM for all database operations
- Full TypeScript support with proper schema types
- No raw SQL queries (except for verification tests)

### Production Consistency
- PostgreSQL matches production database
- Same migration system as production
- Consistent data types and constraints

### Parallel Test Support
- Proper connection pooling
- Clean setup/teardown between test runs
- Safe concurrent access patterns

### Comprehensive Test Data
- Realistic donor profiles with various states
- Multiple campaign scenarios
- Organization hierarchy with proper memberships

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection manually  
psql -h localhost -p 5432 -U test -d givance_test
```

### Migration Issues

```bash
# Check migration status
pnpm drizzle-kit studio

# Reset and recreate database
dropdb -U postgres givance_test
createdb -U postgres givance_test
```

### Environment Variables

Ensure `.env.test` exists with correct `DATABASE_URL`:
- Format: `postgresql://username:password@host:port/database`
- Test user must have full privileges on test database

### Common Issues

1. **"DATABASE_URL not found"**: Create `.env.test` file with proper PostgreSQL URL
2. **"Connection refused"**: Ensure PostgreSQL server is running on localhost:5432
3. **"Permission denied"**: Grant privileges to test user on test database
4. **"Migration failed"**: Check that schema files are properly compiled

## Integration with Tests

The database setup integrates with Playwright tests through:

1. **Global Setup**: `global.setup.ts` runs database setup before all tests
2. **Test Integration**: E2E tests connect to the same PostgreSQL database
3. **Data Verification**: Tests can query database directly for verification
4. **Cleanup**: Automatic cleanup between test runs

## Development Workflow

### Adding Test Data

1. Update `createTestData()` function in `database-setup.ts`
2. Add new test data using Drizzle ORM insert operations
3. Update test expectations to match new data

### Schema Changes

1. Create new migration: `pnpm drizzle-kit generate`
2. Test migration on test database
3. Update test data creation if needed
4. Run tests to verify compatibility

### Debugging

1. Enable SQL logging in database setup
2. Use Drizzle Studio to inspect test data: `pnpm drizzle-kit studio`
3. Check Playwright test output for database connection logs
4. Use PostgreSQL logs for connection debugging

## Performance Considerations

- Database setup runs once per test session
- Connection pooling minimizes overhead
- Proper cleanup prevents data accumulation
- Indexes maintained from production schema

The PostgreSQL test setup provides a robust foundation for comprehensive end-to-end testing with production-like data and schema consistency. 