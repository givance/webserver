# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
pnpm run dev              # Start dev server with Turbopack
nvm use 22.4.0          # Recommended Node.js version (also works with 24.x)

# Database
pnpm run db:generate     # Generate Drizzle migrations
pnpm run db:push         # Push schema changes to dev DB
pnpm run db:migrate      # Run migrations
pnpm run db:studio       # Open Drizzle Studio

# Build & Quality
pnpm run build           # Production build
pnpm run lint            # ESLint check
pnpm run start           # Start production server
pnpm run prepare         # Install Husky git hooks

# Background Jobs
pnpm run trigger:dev     # Run Trigger.dev jobs locally (uses pnpm dlx)
pnpm run trigger:deploy  # Deploy background jobs (uses pnpm dlx)

# Data Import
pnpm run import:boruch   # Import Boruch donor data
```

## Architecture Overview

This is a **Next.js 15** nonprofit donor management platform called "Givance" with sophisticated AI-powered features for donor outreach and management.

### Core Stack

- **Next.js 15.3.1** with App Router
- **React 19** with compatibility layer for testing
- **TypeScript** with strict typing
- **tRPC v11** for type-safe APIs
- **Drizzle ORM** with PostgreSQL (Note: Prisma is in package.json but not used)
- **Clerk** for multi-tenant authentication
- **TailwindCSS + Shadcn UI** components
- **AI SDK v4** with multiple providers (OpenAI, Anthropic, Azure)
- **Trigger.dev v3** for background job processing
- **Prettier** with Husky pre-commit hooks for code formatting
- **Lint-staged** for git pre-commit formatting

### Database Schema Architecture

Multi-tenant SaaS supporting:

- **Organizations** - Clerk-managed tenancy
- **Donors** - Individual/couple records with research capabilities
- **Projects** - Fundraising initiatives and campaigns
- **Communications** - Threaded conversations across channels
- **Staff** - Team members with OAuth integrations
- **Email Generation** - AI-powered bulk campaigns with tracking
- **Templates** - Reusable communication templates
- **Signatures** - Rich text email signatures with image support
- **Todos** - Task management with AI-powered action predictions
- **Lists** - Donor list management and segmentation
- **Analysis** - AI-powered donor stage classification and action prediction

### Key Features

#### AI-Powered Email Campaigns

- Multi-step campaign creation workflow (`src/app/(app)/campaign/`)
- **Agentic Email Generation** - Iterative AI conversation flows for email creation
  - Smart conflict detection and best practice validation
  - Multi-step conversation tracking with explicit generation requests
  - Unified service for smart email generation across campaigns
- AI generates personalized emails using donor history
- Bulk generation via Trigger.dev background jobs
- Advanced email scheduling with timezone support and daily limits
- Email tracking (opens, clicks) and analytics
- Rich text signature editor with image management
- Campaign monitoring with automatic completion detection

#### Donor Management

- Comprehensive donor profiles with external ID mapping
- AI-powered donor research and background analysis
- **Bulk Donor Research** - Background job processing for large-scale research
- **Donor Journey Analysis** - AI stage classification and action prediction
- **Person Research Pipeline** - Multi-stage web crawling and synthesis
- High-potential donor identification
- Automated todo generation from AI predictions

#### WhatsApp AI Assistant

- Business API integration for staff queries (`src/app/api/whatsapp/`)
- Natural language to SQL conversion for donor queries
- Real-time donation statistics and insights
- Conversation history management
- Permission-based access control
- **Advanced AI Tools**:
  - Donor action insights tool - identifies donors needing immediate attention
  - Comprehensive donor analysis with full history integration
  - Activity logging for all WhatsApp interactions
  - Query tools integration with SQL engine

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
- Schema changes require migrations via `pnpm run db:generate`

### Background Jobs

- Heavy operations (bulk email generation) use Trigger.dev
- Job definitions in `src/trigger/jobs/`
- Development: `pnpm run trigger:dev`
- Production: `pnpm run trigger:deploy`

### Error Handling & Logging

- Use try-catch for all async operations
- Backend logging via Winston logger (format messages inline)
- Frontend errors through toast notifications
- Return clear, consistent error responses from API routes

### Environment & Security

- Environment variables through `src/app/lib/env.ts` with type validation
- **Feature Flags**: `USE_AGENTIC_FLOW` for agentic email generation
- **AI Provider Keys**:
  - Azure OpenAI configurations including GPT-4.1 and O3 deployments
  - Anthropic and OpenAI API keys
- **Search Integration**:
  - `GOOGLE_SEARCH_API_KEY` for web search
  - `GOOGLE_SEARCH_ENGINE_ID` (optional) for custom search engine
- **WhatsApp Integration**:
  - `WHATSAPP_TOKEN` - Business API authentication
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Webhook verification
- Multi-tenant security via Clerk organization scoping
- OAuth integrations for Gmail/Microsoft email access
- Multiple OAuth redirect URIs for different environments

## Important File Locations

### Core Configuration

- `src/app/lib/db/schema.ts` - Database schema definitions
- `src/app/api/trpc/routers/_app.ts` - Main tRPC router
- `src/app/lib/env.ts` - Environment variable validation
- `drizzle.config.ts` - Database configuration

### Business Logic

- `src/app/lib/services/` - Core business services
  - `agentic-email-generation.service.ts` - Iterative AI email flows
  - `unified-smart-email-generation.service.ts` - Unified smart email generation
  - `email-scheduling.service.ts` - Campaign scheduling and control
  - `donor-journey.service.ts` - Journey visualization
  - `todo-service.ts` - Task management
  - `person-research/` - Research pipeline services
  - `whatsapp/` - WhatsApp AI services
    - `donor-action-insights-tool.ts` - Immediate attention analysis
    - `donor-analysis-tool.ts` - Comprehensive donor analysis
- `src/app/lib/analysis/` - AI analysis services
  - `action-prediction-service.ts` - Next action predictions
  - `stage-classification-service.ts` - Donor stage classification
- `src/app/lib/utils/email-generator/` - AI email generation
  - `agentic-flow.ts` - Agentic conversation flow handler
- `src/trigger/jobs/` - Background job definitions

### UI & Pages

- `src/app/(app)/` - Main application routes
  - `/campaign` - Campaign creation and management
  - `/existing-campaigns` - View existing email campaigns
  - `/whatsapp` - WhatsApp chat interface
  - `/research` - Donor research interface
  - `/lists` - Donor list management
  - `/settings/donor-journey` - Journey configuration
  - `/settings/email-schedule` - Email scheduling settings
  - `/settings/memories` - Organization memories management
- `src/components/ui/` - Shadcn UI components
- `src/components/layout/MainLayout.tsx` - Application shell
- `src/components/signature/` - Email signature management
  - `SignatureEditor.tsx` - Rich text editor
  - `ImageGallery.tsx` - Signature image management

### API Integration

- `src/app/api/trpc/routers/` - tRPC endpoint implementations
  - `agentic-email-campaigns.ts` - Agentic email generation
  - `analysis.ts` - AI analysis operations
  - `communication-threads.ts` - Thread management
  - `communications.ts` - Communication management
  - `donations.ts` - Donation tracking
  - `donors.ts` - Donor management
  - `email-campaigns.ts` - Campaign operations
  - `email-tracking.ts` - Tracking functionality
  - `gmail.ts` & `staff-gmail.ts` - Gmail integrations
  - `lists.ts` - List management
  - `microsoft.ts` & `staff-microsoft.ts` - Microsoft integrations
  - `organizations.ts` - Organization management
  - `person-research.ts` - Research operations
  - `projects.ts` - Project management
  - `smart-email-generation.ts` - Smart email generation
  - `staff.ts` - Staff management
  - `templates.ts` - Template management
  - `todos.ts` - Task management
  - `users.ts` - User management
  - `whatsapp.ts` - WhatsApp operations
- `src/app/api/webhook/` - General webhook handling
- `src/app/api/whatsapp/webhook/` - WhatsApp webhook handling
- `src/app/api/track/` - Email tracking endpoints (open/click)
- `src/app/api/signature-image/` - Signature image serving

## Testing & Build Process

When fixing build errors:

1. Run `nvm use 22.4.0 && pnpm run build`
2. Fix errors iteratively
3. Ensure build passes before completing tasks
4. Run linting: `pnpm run lint`

Never run `pnpm run build` unless explicitly requested by the user.

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
  const buttonVariants = cva('base-classes', {
    variants: { variant: { default: '...', destructive: '...' } },
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
  - React 19 compatibility layer at `src/__tests__/react19-compat.ts`
- **E2E Tests**: Full Playwright setup with Clerk authentication
  - Extensive helper functions for donations, projects, staff, templates
  - Page object models for common interactions
- **Database Tests**: Real PostgreSQL for E2E, mocked for unit tests
- **MSW Integration**: Mock Service Worker for API mocking
- **Test Utilities**: Custom utilities for tRPC route testing
- **Mock Services**: Comprehensive mocks for AI services with realistic responses

### Mock Strategies

- **tRPC Mocking**: Type-safe mock client with procedure mocking
- **Database Mocking**: Drizzle ORM mocked with realistic responses
- **AI Services**: Mocked with expected response structures
- **MSW Handlers**: API route mocking with Mock Service Worker
- **Test Factories**: Data generation utilities for testing

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

- **Schema Changes**: Always use `pnpm run db:generate` for migrations
- **Multi-tenant Data**: Organization-scoped queries in all operations
- **Transaction Support**: Use for multi-table operations

## Background Job Patterns

### Trigger.dev Integration

- **Job Definitions**: Located in `src/trigger/jobs/`
  - `generateBulkEmails.ts` - Bulk email generation
  - `bulkDonorResearch.ts` - Large-scale donor research
  - `crawlAndSummarizeWebsite.ts` - Web content analysis
  - `sendSingleEmail.ts` - Individual email delivery
  - `checkCampaignCompletion.ts` - Campaign completion monitoring
- **Configuration**:
  - Max duration: 3600 seconds (1 hour)
  - Retry with exponential backoff and randomization
- **Concurrency Control**: Controlled batching to prevent resource exhaustion
- **State Management**: Track progress and handle failures gracefully
  ```typescript
  export const generateBulkEmailsTask = task({
    id: 'generate-bulk-emails',
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

## Package Manager Note

- This project uses **pnpm** for most commands but **pnpm** for specific operations:
  - Trigger.dev commands use `pnpm dlx` (configured in package.json)
  - Git pre-commit hooks use `pnpm lint-staged` (via Husky)
- Always use `pnpm run` for development, build, and test commands
- Husky automatically sets Node 22.4.0 and runs Prettier on staged files

## Code Formatting & Git Hooks

### Prettier Configuration

- **Auto-formatting**: Runs on pre-commit via Husky and lint-staged
- **Configuration** (`.prettierrc.json`):
  - Single quotes for strings
  - ES5 trailing commas
  - 100 character line width
  - 2 space indentation
  - Semicolons required

### Git Hooks (Husky)

- **Pre-commit**: Automatically formats staged files with Prettier
- **Setup**: Run `pnpm run prepare` after cloning
- **Node Version**: Automatically uses Node 22.4.0 in hooks

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
