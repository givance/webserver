# Technology Stack Documentation

## Overview

The Nonprofit Webserver is built using a modern, full-stack technology architecture that prioritizes type safety, developer experience, and scalability. This document provides comprehensive details about all technologies, libraries, and tools used in the project.

## Core Technologies

### Frontend Stack

#### Framework & Runtime
- **Next.js 15.3.1**: React-based full-stack framework with App Router
  - Server-side rendering (SSR) and static site generation (SSG)
  - API routes for serverless functions
  - Built-in optimization for performance and SEO
  - Image optimization and font optimization
  - Automatic code splitting and lazy loading

#### UI Library & Styling
- **React 19.0.0**: Latest version of React with concurrent features
- **Radix UI**: Unstyled, accessible UI primitives
  - `@radix-ui/react-*`: Complete set of components (dialog, dropdown, tabs, etc.)
  - Keyboard navigation and screen reader support
  - Customizable and composable components
- **shadcn/ui**: Pre-built components using Radix UI primitives
  - Consistent design system
  - Tailwind CSS integration
  - Customizable theme system
- **Tailwind CSS 4.0**: Utility-first CSS framework
  - Custom design system with CSS variables
  - Dark mode support (currently disabled)
  - Typography plugin for rich text styling
  - Mobile-first responsive design

#### State Management & Data Fetching
- **tRPC 11.1.1**: End-to-end typesafe APIs
  - Type inference from server to client
  - Built-in validation with Zod
  - Optimistic updates and caching
  - WebSocket support for real-time features
- **TanStack Query 5.74.4**: Powerful data synchronization
  - Server state management
  - Background refetching
  - Optimistic updates
  - Offline support

#### Form Handling & Validation
- **React Hook Form 7.56.1**: Performant forms with minimal re-renders
- **Zod 3.24.3**: TypeScript-first schema validation
- **@hookform/resolvers 5.0.1**: Zod integration for form validation

#### Icons & Graphics
- **Lucide React 0.503.0**: Beautiful, customizable icons
- **Recharts 2.15.3**: Composable charting library built on D3

### Backend Stack

#### Runtime & API Layer
- **Node.js 22.4.0**: JavaScript runtime with latest features
- **Next.js API Routes**: Serverless API endpoints
- **tRPC Server 11.1.1**: Type-safe API server
  - Procedure-based API design
  - Middleware support for authentication and logging
  - Input validation with Zod schemas
  - Error handling and status codes

#### Database & ORM
- **PostgreSQL**: Robust, ACID-compliant relational database
- **Drizzle ORM 0.43.1**: Type-safe ORM with SQL-like syntax
  - Zero-runtime overhead
  - SQL migration system
  - Type inference from schema
  - Optimized query building
- **Drizzle Kit 0.31.0**: Database management toolkit
  - Schema migrations
  - Database introspection
  - Studio for database management

#### Authentication & Security
- **Clerk 6.19.0**: Complete authentication and user management
  - OAuth providers (Google, GitHub, etc.)
  - Multi-factor authentication
  - User management dashboard
  - Session management
  - Webhook support for user events

#### AI & Machine Learning
- **Vercel AI SDK 4.3.10**: Unified interface for AI providers
  - Stream support for real-time responses
  - Multiple provider support
  - Built-in rate limiting
  - Error handling and retries
- **Anthropic SDK 0.50.4**: Claude AI integration
- **OpenAI SDK 4.100.0**: GPT model integration
- **Azure OpenAI**: Enterprise AI services integration

#### Background Jobs & Processing
- **Trigger.dev 3.3.17**: Modern background job framework
  - Type-safe job definitions
  - Retry logic and error handling
  - Job monitoring and debugging
  - Scheduled and delayed jobs
  - Webhook-triggered jobs

#### Logging & Monitoring
- **Winston 3.17.0**: Flexible logging library
  - Multiple transport support
  - Structured logging with JSON format
  - Log levels and filtering
  - File and console output

### Development & Build Tools

#### TypeScript & Tooling
- **TypeScript 5.x**: Static type checking
  - Strict mode enabled
  - Path mapping for imports
  - Declaration files for type safety
- **ESLint 9.x**: Code linting and formatting
  - Next.js recommended rules
  - Custom rules for project standards
  - TypeScript integration

#### Package Management
- **pnpm**: Fast, disk space efficient package manager
  - Faster installs than npm/yarn
  - Strict dependency resolution
  - Workspace support for monorepos

#### Build & Development
- **Turbopack**: Next.js bundler (development mode)
  - Faster hot module replacement
  - Improved development experience
- **PostCSS**: CSS post-processing
  - Tailwind CSS processing
  - Autoprefixer for browser compatibility

## Third-Party Services & APIs

### Email & Communication
- **Microsoft Graph API**: Integration with Outlook/Exchange
  - Email sending and receiving
  - Calendar integration
  - Contact management
- **Custom Email Tracking**: Pixel-based tracking system
  - Open rate tracking
  - Click tracking with redirects
  - Bounce handling

### File Processing & Generation
- **Puppeteer 24.8.2**: Headless browser automation
  - PDF generation from HTML
  - Screenshot capture
  - Web scraping capabilities
- **XLSX 0.18.5**: Spreadsheet processing
  - Excel file reading and writing
  - CSV import/export
  - Data validation and transformation

### Data Processing
- **CSV Parse 5.6.0**: Robust CSV parsing
- **Cheerio 1.0.0**: Server-side HTML parsing
- **JSdom 26.1.0**: DOM implementation for Node.js
- **Axios 1.9.0**: HTTP client for API requests

### Utilities & Helpers
- **Date-fns 4.1.0**: Modern date utility library
- **UUID 11.1.0**: Unique identifier generation
- **MD5 2.3.0**: Hashing utility
- **Class Variance Authority 0.7.1**: Conditional class utilities
- **clsx 2.1.1**: Class name utility
- **Tailwind Merge 3.2.0**: Tailwind class merging

## Development Environment

### Code Quality & Standards
- **ESLint Configuration**:
  ```javascript
  // eslint.config.mjs
  {
    extends: ["next/core-web-vitals", "next/typescript"],
    rules: {
      // Custom rules for project standards
    }
  }
  ```

- **TypeScript Configuration**:
  ```json
  // tsconfig.json
  {
    "compilerOptions": {
      "strict": true,
      "target": "ES2017",
      "moduleResolution": "bundler",
      "paths": {
        "@/*": ["./src/*"]
      }
    }
  }
  ```

### Environment Management
- **@t3-oss/env-nextjs 0.13.0**: Type-safe environment variables
  - Runtime validation
  - Client/server variable separation
  - TypeScript integration
- **Dotenv 16.5.0**: Environment variable loading

### Testing Framework (Planned)
- **Vitest**: Fast unit testing framework
- **Playwright**: End-to-end testing
- **Testing Library**: React component testing

## Database Architecture

### Schema Design
```typescript
// Example schema structure
export const donors = pgTable('donors', {
  id: serial('id').primaryKey(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  assignedToStaffId: integer('assigned_to_staff_id').references(() => staff.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### Migration System
- **Drizzle Kit** for schema migrations
- **SQL-based migrations** for complex changes
- **Version-controlled** migration files
- **Rollback support** for safe deployments

## API Architecture

### tRPC Router Structure
```typescript
// Example router setup
export const appRouter = createTRPCRouter({
  donors: donorRouter,
  campaigns: campaignRouter,
  staff: staffRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
```

### Procedure Types
- **Query Procedures**: Data fetching operations
- **Mutation Procedures**: Data modification operations
- **Subscription Procedures**: Real-time data streams (planned)

## Security Implementation

### Authentication Flow
1. **Clerk Integration**: User sign-up/sign-in
2. **Session Management**: JWT tokens
3. **Route Protection**: Middleware-based guards
4. **API Security**: tRPC context validation

### Data Protection
- **Input Validation**: Zod schemas for all inputs
- **SQL Injection Prevention**: Parameterized queries via Drizzle
- **XSS Protection**: React's built-in XSS prevention
- **CSRF Protection**: Next.js built-in CSRF protection

## Performance Optimizations

### Frontend Performance
- **Code Splitting**: Automatic route-based splitting
- **Image Optimization**: Next.js Image component
- **Font Optimization**: Next.js font optimization
- **Bundle Analysis**: Webpack bundle analyzer
- **Caching**: React Query for server state caching

### Backend Performance
- **Database Indexing**: Strategic index placement
- **Connection Pooling**: PostgreSQL connection management
- **Query Optimization**: Drizzle query optimization
- **Background Jobs**: Async processing for heavy operations

### Build Optimizations
```typescript
// next.config.ts
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side optimizations
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};
```

## Deployment Architecture

### Build Process
1. **Type Checking**: TypeScript compilation
2. **Linting**: ESLint validation
3. **Building**: Next.js production build
4. **Testing**: Automated test suite (planned)
5. **Deployment**: Platform-specific deployment

### Environment Configuration
```bash
# Production environment variables
NODE_ENV=production
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
ANTHROPIC_API_KEY=...
```

### Monitoring & Observability
- **Application Logs**: Winston logging
- **Error Tracking**: Planned integration with Sentry
- **Performance Monitoring**: Planned APM integration
- **Database Monitoring**: PostgreSQL performance metrics

## Development Workflow Tools

### Package Scripts
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "NODE_OPTIONS=\"--max-old-space-size=4096\" next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Development Dependencies
- **@types/***: TypeScript type definitions
- **tsx 4.19.4**: TypeScript execution engine
- **Drizzle Kit**: Database management CLI
- **ESLint**: Code linting
- **Tailwind CSS**: Styling framework

## Future Technology Considerations

### Planned Additions
- **Redis**: Caching layer for improved performance
- **Docker**: Containerization for consistent deployments
- **Kubernetes**: Container orchestration for scaling
- **GraphQL**: Alternative API layer for mobile apps
- **WebSockets**: Real-time features enhancement
- **Elastic Search**: Advanced search capabilities

### Upgrade Path
- **React 19**: Already on latest version
- **Next.js**: Regular updates to latest stable versions
- **Node.js**: LTS version upgrades
- **Database**: PostgreSQL version upgrades

This technology stack provides a solid foundation for building a scalable, maintainable, and performant nonprofit management platform while ensuring excellent developer experience through type safety and modern tooling.