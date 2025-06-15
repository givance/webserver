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