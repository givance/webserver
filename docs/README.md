# Nonprofit Webserver - Onboarding Documentation

Welcome to the Nonprofit Webserver project! This comprehensive guide will help you understand and contribute to our donor management and email campaign platform.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [Architecture & Tech Stack](#architecture--tech-stack)
4. [Project Structure](#project-structure)
5. [Development Workflow](#development-workflow)
6. [Key Features](#key-features)
7. [Code Conventions](#code-conventions)
8. [Environment Setup](#environment-setup)
9. [Database Management](#database-management)
10. [Testing & Deployment](#testing--deployment)

---

## Project Overview

The Nonprofit Webserver is a sophisticated donor management and email campaign platform designed specifically for nonprofit organizations. The platform enables nonprofits to manage donors, create personalized communication campaigns, track engagement, and analyze donor behavior through AI-powered insights.

### Business Purpose

This platform serves as a comprehensive CRM and communication hub for nonprofit organizations, providing:
- **Donor Management**: Centralized donor database with detailed profiles and interaction history
- **AI-Powered Email Campaigns**: Generate personalized emails using large language models (LLMs)
- **Campaign Analytics**: Track email opens, clicks, and donor engagement
- **Staff Management**: Assign donors to staff members and track interactions
- **Research Tools**: Analyze donor patterns and generate insights
- **Communication Tracking**: Monitor all touchpoints with donors

### Target Users

- **Nonprofit Staff**: Development officers, fundraising coordinators, executive directors
- **Campaign Managers**: Users responsible for creating and managing donor outreach campaigns
- **Administrators**: IT staff and organization administrators managing the platform

---

## Quick Start

### Prerequisites

- **Node.js**: Version 22.4.0 (use `nvm use 22.4.0`)
- **pnpm**: Package manager
- **PostgreSQL**: Database server
- **Git**: Version control

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd webserver
   ```

2. **Install dependencies**
   ```bash
   nvm use 22.4.0
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   pnpm db:generate
   pnpm db:push
   pnpm db:migrate
   ```

5. **Start development server**
   ```bash
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## Architecture & Tech Stack

### Frontend Architecture

- **Framework**: Next.js 15 with App Router
- **UI Library**: Radix UI primitives with shadcn/ui components
- **Styling**: Tailwind CSS with CSS variables
- **State Management**: React hooks and tRPC for server state
- **Icons**: Lucide React
- **Forms**: React Hook Form with Zod validation

### Backend Architecture

- **Runtime**: Node.js 22.4.0
- **API Layer**: tRPC (Type-safe Remote Procedure Calls)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Clerk
- **Background Jobs**: Trigger.dev
- **Logging**: Winston (backend only)
- **AI/LLM**: Vercel AI SDK with multiple providers (Anthropic, OpenAI, Azure)

### Database Layer

- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Migrations**: Drizzle Kit
- **Schema**: Type-safe schema definitions

### Third-Party Integrations

- **Email Tracking**: Custom tracking system
- **AI Providers**: Anthropic Claude, OpenAI GPT, Azure OpenAI
- **Authentication**: Clerk
- **File Processing**: Puppeteer for PDF generation
- **Spreadsheet Processing**: XLSX library

---

## Project Structure

```
webserver/
├── docs/                     # Documentation
├── drizzle/                  # Database migrations
├── public/                   # Static assets
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (app)/           # Main application routes
│   │   │   ├── campaign/    # Email campaign management
│   │   │   ├── donors/      # Donor management
│   │   │   ├── staff/       # Staff management
│   │   │   ├── research/    # Analytics and insights
│   │   │   └── settings/    # Application settings
│   │   ├── api/             # API routes
│   │   │   ├── trpc/        # tRPC API endpoints
│   │   │   ├── webhook/     # Webhook handlers
│   │   │   └── track/       # Email tracking
│   │   ├── components/      # Reusable components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utility libraries
│   │   │   ├── db/          # Database configuration
│   │   │   ├── services/    # Business logic services
│   │   │   └── utils/       # Helper functions
│   │   └── types/           # TypeScript type definitions
│   ├── components/          # Shared UI components
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/          # Layout components
│   │   └── [feature]/       # Feature-specific components
│   ├── server/              # Server-side code
│   │   └── api/             # API router configuration
│   └── trigger/             # Background job definitions
├── task.md                  # Current development tasks
└── [config files]          # Various configuration files
```

### Key Directory Explanations

- **`src/app/(app)/`**: Main application routes using Next.js App Router
- **`src/app/api/`**: API endpoints including tRPC routes and webhooks
- **`src/app/lib/services/`**: Business logic and service layer
- **`src/components/`**: Reusable UI components organized by feature
- **`src/trigger/`**: Background job definitions for async processing

---

## Development Workflow

### Task Management

The project follows a structured 4-phase development approach:

1. **Research**: Understanding requirements and existing code
2. **Plan**: Creating detailed task lists and documentation
3. **Execution**: Implementing changes according to the plan
4. **Review**: Testing, fixing lint errors, and final review

### Task Tracking

- **Task File**: `task.md` maintains current development status
- **Task Sections**: Tasks are organized by phase and status
- **Progress Tracking**: Use `[x]` for completed tasks, `[ ]` for pending

### Code Organization Principles

1. **Feature-First**: Organize code by business features, not technical layers
2. **Flat Structure**: Avoid deep nesting; keep hierarchies shallow
3. **Co-location**: Keep related files close together
4. **Index Exports**: Use index files for clean imports

---

## Key Features

### 1. Donor Management
- Comprehensive donor profiles with contact information
- Staff assignment and interaction tracking
- Import/export capabilities
- Advanced filtering and search

### 2. AI-Powered Email Campaigns
- Generate personalized emails using LLMs
- Batch processing for large donor lists
- Preview and refinement capabilities
- Reference-based content generation

### 3. Campaign Analytics
- Email open and click tracking
- Campaign performance metrics
- Donor engagement analytics
- Real-time tracking dashboard

### 4. Staff Management
- User roles and permissions
- Staff assignment to donors
- Activity tracking and reporting

### 5. Research & Insights
- Donor behavior analysis
- Campaign effectiveness reports
- Data visualization and charts
- Export capabilities for further analysis

---

## Code Conventions

### TypeScript Standards

- **No `any` types**: Always use explicit typing
- **Interface Documentation**: JSDoc comments for complex interfaces
- **Function Documentation**: Required for functions >40 lines
- **Error Handling**: Proper try-catch with context logging

### Frontend Conventions

- **Component Size**: Maximum 500 lines; break into smaller components if longer
- **Hook Usage**: Never use tRPC directly in components; always use custom hooks
- **Naming**: Clear, descriptive component and function names
- **File Organization**: Feature-based organization over technical grouping

### Backend Conventions

- **tRPC Usage**: All backend communication through tRPC
- **Logging Format**: Inline formatting with context (not object notation)
- **Environment Variables**: Accessed through the `env` module
- **Error Handling**: Structured error responses with proper status codes

### Example Code Patterns

```typescript
// ✅ Good: Using custom hook instead of direct tRPC
const { donors } = useDonors();

// ❌ Bad: Direct tRPC usage in component
const donors = api.donors.getAll.useQuery();

// ✅ Good: Inline logging with context
logger.info(`Generated ${emailCount} emails for campaign ${campaignId}`);

// ❌ Bad: Object-style logging
logger.info("Generated emails", { emailCount, campaignId });
```

---

## Environment Setup

### Required Environment Variables

Create a `.env` file in the root directory with:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/nonprofit_db"

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/"

# AI Providers
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."
AZURE_OPENAI_API_KEY="..."
AZURE_OPENAI_ENDPOINT="https://..."

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# Email Tracking
TRACKING_SECRET="your-tracking-secret"

# Background Jobs (Trigger.dev)
TRIGGER_SECRET_KEY="tr_..."
```

### Development Tools

- **Database Management**: Use `pnpm db:studio` for Drizzle Studio
- **Code Formatting**: ESLint configured with Next.js rules
- **Type Checking**: TypeScript strict mode enabled
- **Package Management**: Use `pnpm` exclusively

---

## Database Management

### Schema Management

- **Schema File**: `src/app/lib/db/schema.ts`
- **Migrations**: Generated in `drizzle/migrations/`
- **Configuration**: `drizzle.config.ts`

### Common Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Push schema changes to database
pnpm db:push

# Run migrations
pnpm db:migrate

# Open database studio
pnpm db:studio
```

### Database Design Principles

- **Type Safety**: All database operations are type-safe through Drizzle
- **Relationships**: Proper foreign key constraints and relationships
- **Indexing**: Strategic indexing for performance-critical queries
- **Migrations**: All schema changes through version-controlled migrations

---

## Testing & Deployment

### Build Process

```bash
# Development build
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

### Build Requirements

- **Node Version**: Must use Node.js 22.4.0
- **Memory**: Increased Node memory limit for builds
- **TypeScript**: Strict type checking enabled
- **Bundle Analysis**: Webpack configured for optimal bundling

### Deployment Checklist

1. **Environment Variables**: All required vars configured
2. **Database**: Migrations applied
3. **Build Success**: `pnpm build` completes without errors
4. **Type Safety**: No TypeScript errors
5. **Linting**: All ESLint rules passing

### Performance Considerations

- **Bundle Size**: Winston excluded from client bundle
- **Database Queries**: Optimized with proper indexing
- **Caching**: Strategic use of React Query for server state
- **Memory Management**: Proper cleanup in useEffect hooks

---

## Additional Resources

- **Task Management**: See `task.md` for current development status
- **API Documentation**: Auto-generated tRPC documentation
- **Component Library**: shadcn/ui documentation
- **Database Schema**: Drizzle Studio for visual schema exploration

---

## Getting Help

When working on this project:

1. **Check Task File**: Review `task.md` for context and current status
2. **Follow Conventions**: Adhere to established patterns and conventions
3. **Test Thoroughly**: Always test changes across different scenarios
4. **Document Changes**: Update relevant documentation when making significant changes
5. **Code Review**: Ensure all changes maintain code quality standards

Welcome to the team! This platform plays a crucial role in helping nonprofits build stronger relationships with their donors and create more effective fundraising campaigns. 