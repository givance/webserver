# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack
nvm use 22.4.0          # Required Node.js version

# Database
npm run db:generate     # Generate Drizzle migrations
npm run db:push         # Push schema changes to dev DB
npm run db:migrate      # Run migrations
npm run db:studio       # Open Drizzle Studio

# Build & Quality
npm run build           # Production build
npm run lint            # ESLint check
npm run start           # Start production server

# Background Jobs
npm run trigger:dev     # Run Trigger.dev jobs locally
npm run trigger:deploy  # Deploy background jobs

# Data Import
npm run import:boruch   # Import Boruch donor data
```

## Architecture Overview

This is a **Next.js 15** nonprofit donor management platform called "Givance" with sophisticated AI-powered features for donor outreach and management.

### Core Stack
- **Next.js 15** with App Router
- **TypeScript** with strict typing
- **tRPC v11** for type-safe APIs
- **Drizzle ORM** with PostgreSQL
- **Clerk** for multi-tenant authentication
- **TailwindCSS + Shadcn UI** components
- **Multiple AI providers** (OpenAI, Anthropic, Azure)
- **Trigger.dev** for background job processing

### Database Schema Architecture
Multi-tenant SaaS supporting:
- **Organizations** - Clerk-managed tenancy
- **Donors** - Individual/couple records with research capabilities
- **Projects** - Fundraising initiatives and campaigns
- **Communications** - Threaded conversations across channels
- **Staff** - Team members with OAuth integrations
- **Email Generation** - AI-powered bulk campaigns with tracking
- **Templates** - Reusable communication templates

### Key Features

#### AI-Powered Email Campaigns
- Multi-step campaign creation workflow (`src/app/(app)/campaign/`)
- AI generates personalized emails using donor history
- Bulk generation via Trigger.dev background jobs
- Email tracking and analytics

#### Donor Management
- Comprehensive donor profiles with external ID mapping
- AI-powered donor research and background analysis
- Donor stage classification and journey tracking
- High-potential donor identification

#### WhatsApp AI Assistant
- Business API integration for staff queries (`src/app/api/whatsapp/`)
- Natural language donor database queries
- Real-time donation statistics

## Development Guidelines

### Type Safety Requirements
- Use strict TypeScript - never use `any`
- Validate all inputs with Zod schemas
- Use interfaces for complex object types
- Leverage Drizzle for database type safety
- All tRPC routes must be strongly typed

### API Communication
- **Backend**: Always use tRPC routers in `src/app/api/trpc/routers/`
- **Frontend**: Never use tRPC directly - always use tRPC hooks
- Place business logic in `src/app/lib/services/`
- Keep route handlers thin and focused

### Component Organization
- Feature-based organization over type-based
- Components max 500 lines - break into smaller pieces
- Co-locate feature-specific code within feature folders
- Use `index.ts` files for clean re-exports
- Shared components go in `src/components/`

### Database Operations
- All database operations through Drizzle ORM
- Use transactions for multi-table operations
- Organization-scoped data access (multi-tenant)
- Schema changes require migrations via `npm run db:generate`

### Background Jobs
- Heavy operations (bulk email generation) use Trigger.dev
- Job definitions in `src/trigger/jobs/`
- Development: `npm run trigger:dev`
- Production: `npm run trigger:deploy`

### Error Handling & Logging
- Use try-catch for all async operations
- Backend logging via Winston logger (format messages inline)
- Frontend errors through toast notifications
- Return clear, consistent error responses from API routes

### Environment & Security
- Environment variables through `src/app/lib/env.ts` with type validation
- Multi-tenant security via Clerk organization scoping
- OAuth integrations for Gmail/Microsoft email access
- WhatsApp Business API with secure organization access

## Important File Locations

### Core Configuration
- `src/app/lib/db/schema.ts` - Database schema definitions
- `src/app/api/trpc/routers/_app.ts` - Main tRPC router
- `src/app/lib/env.ts` - Environment variable validation
- `drizzle.config.ts` - Database configuration

### Business Logic
- `src/app/lib/services/` - Core business services
- `src/app/lib/utils/email-generator/` - AI email generation
- `src/trigger/jobs/` - Background job definitions

### UI & Pages
- `src/app/(app)/` - Main application routes
- `src/components/ui/` - Shadcn UI components  
- `src/components/layout/MainLayout.tsx` - Application shell

### API Integration
- `src/app/api/trpc/routers/` - tRPC endpoint implementations
- `src/app/api/whatsapp/` - WhatsApp webhook handling
- `src/app/api/track/` - Email tracking endpoints

## Testing & Build Process

When fixing build errors:
1. Run `nvm use 22.4.0 && pnpm build`
2. Fix errors iteratively
3. Ensure build passes before completing tasks
4. Run linting: `npm run lint`

Never run `pnpm build` unless explicitly requested by the user.

## Component Development Patterns

### React Component Conventions
- **Functional Components Only**: Use arrow functions with TypeScript interfaces
- **File Naming**: PascalCase for components (`ProjectForm.tsx`, `DonorCard.tsx`)
- **Props Pattern**: Define explicit interfaces for all component props
  ```typescript
  interface ProjectFormProps {
    defaultValues?: Partial<ProjectFormValues>;
    onSubmit: (data: ProjectFormValues) => void;
    submitLabel?: string;
  }
  ```

### Shadcn/ui Component Usage
- **Class Variance Authority**: Use `cva()` for component variants
- **Composition Pattern**: Leverage Radix UI's `asChild` prop for flexibility
- **Styling**: Use `cn()` utility for conditional Tailwind classes
  ```typescript
  const buttonVariants = cva("base-classes", {
    variants: { variant: { default: "...", destructive: "..." } }
  });
  ```

### Form Development Patterns
- **React Hook Form + Zod**: Standard form validation pipeline
- **Form Components**: Use Shadcn form field pattern consistently
  ```typescript
  <FormField
    control={form.control}
    name="fieldName"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Label</FormLabel>
        <FormControl><Input {...field} /></FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
  ```

## Service Layer Architecture

### Service Class Patterns
- **Class-Based Services**: Stateless service classes with dependency injection
- **Error Handling**: Use `wrapDatabaseOperation()` for consistent error handling
- **Multi-Tenant**: Always scope operations to `organizationId`
  ```typescript
  export class OrganizationsService {
    async getOrganization(organizationId: string) {
      return await wrapDatabaseOperation(/* ... */);
    }
  }
  ```

### Business Logic Organization
- **Domain-Driven Boundaries**: Services aligned with business capabilities
- **Service Composition**: Complex operations compose multiple services
- **State Management**: Explicit state transitions for complex workflows (campaigns)

### AI Service Integration
- **Provider Abstraction**: Azure OpenAI with consistent client setup
- **Token Tracking**: Comprehensive usage monitoring across all AI operations
- **Pipeline Architecture**: Multi-stage AI workflows with reflection and refinement

## Testing Strategy

### Test Organization
```
src/__tests__/
├── unit/           # Service layer and utility tests
├── components/     # React component tests  
├── e2e/           # Playwright end-to-end tests
├── mocks/         # Mock implementations
└── factories/     # Test data generation
```

### Testing Patterns
- **Unit Tests**: Mock all external dependencies with `jest.mock()`
- **Component Tests**: Limited due to React 19/Jest compatibility issues
- **E2E Tests**: Full Playwright setup with Clerk authentication
- **Database Tests**: Real PostgreSQL for E2E, mocked for unit tests

### Mock Strategies
- **tRPC Mocking**: Type-safe mock client with procedure mocking
- **Database Mocking**: Drizzle ORM mocked with realistic responses
- **AI Services**: Mocked with expected response structures

## Database Development

### Drizzle ORM Patterns
- **Schema Organization**: Single schema file with explicit relations
- **Type Inference**: Heavy use of `InferSelectModel` and `InferInsertModel`
- **Query Building**: Mix of query builder and raw SQL for complex operations
  ```typescript
  export type Organization = InferSelectModel<typeof organizations>;
  export type NewOrganization = InferInsertModel<typeof organizations>;
  ```

### Migration Management
- **Schema Changes**: Always use `npm run db:generate` for migrations
- **Multi-tenant Data**: Organization-scoped queries in all operations
- **Transaction Support**: Use for multi-table operations

## Background Job Patterns

### Trigger.dev Integration
- **Job Definitions**: Located in `src/trigger/jobs/`
- **Concurrency Control**: Controlled batching to prevent resource exhaustion
- **State Management**: Track progress and handle failures gracefully
  ```typescript
  export const generateBulkEmailsTask = task({
    id: "generate-bulk-emails",
    run: async (payload, { ctx }) => {
      await processConcurrently(items, processor, MAX_CONCURRENCY);
    },
  });
  ```

## Security Requirements

### Multi-Tenant Security
- **Organization Scoping**: Every database query must include organization validation
- **Authorization**: Use `ctx.auth.user.organizationId` in all tRPC procedures
- **Data Isolation**: Never allow cross-organization data access

### Type Safety Enforcement
- **Strict TypeScript**: Never use `any` - use proper interfaces
- **Zod Validation**: Three-layer validation (environment, API, forms)
- **Input Validation**: All tRPC procedures must validate inputs

## Common Pitfalls & Gotchas

### Critical Security Issues
⚠️ **Organization ID Verification**: Most critical - always verify organization access
⚠️ **Direct Database Access**: Never query without organization scoping
⚠️ **Cross-Tenant Leaks**: Validate data belongs to requesting organization

### TypeScript Gotchas
- Avoid type casting with `as` - use proper type guards
- Always define Zod schemas for tRPC inputs/outputs
- Use consistent date handling (ISO strings vs Date objects)

### Database Performance
- Watch for N+1 queries - use Drizzle's `with` for relations
- Implement proper bulk operations for large datasets
- Add database indexes for frequently queried fields

### AI Integration Issues
- Implement token usage tracking to prevent bill shock
- Add rate limiting for AI API calls
- Handle AI service timeouts and failures gracefully

### Background Job Issues
- Implement proper concurrency limits
- Add idempotency for retry scenarios
- Track job progress and handle partial failures

## Documentation

Comprehensive documentation is available in the `/docs` directory:

### Core Documentation
- **[API Reference](./docs/api-reference.md)** - Complete tRPC API documentation with examples
- **[Database Schema](./docs/database-schema.md)** - Detailed schema, relationships, and migration guide
- **[Deployment Guide](./docs/deployment-guide.md)** - Production deployment, monitoring, and scaling
- **[AI Features](./docs/ai-features.md)** - AI implementation details, prompts, and optimization
- **[Security & Authentication](./docs/security-authentication.md)** - Security architecture and best practices

### Quick Links
- [Getting Started](./docs/README.md)
- [Architecture Overview](./docs/architecture.md)
- [Development Guide](./docs/development-guide.md)
- [Feature Documentation](./docs/features.md)
- [Tech Stack Details](./docs/tech-stack.md)