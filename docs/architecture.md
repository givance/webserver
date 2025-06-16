# Architecture Documentation

## System Architecture Overview

The Nonprofit Webserver follows a modern full-stack architecture with clear separation of concerns, type safety, and scalable design patterns.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Browser)                         │
├─────────────────────────────────────────────────────────────┤
│  Next.js Frontend (App Router)                             │
│  ├── React Components (shadcn/ui)                          │
│  ├── Custom Hooks                                          │
│  ├── tRPC Client                                          │
│  └── Tailwind CSS                                         │
├─────────────────────────────────────────────────────────────┤
│  Next.js API Layer                                         │
│  ├── tRPC Routes                                          │
│  ├── Webhook Endpoints                                     │
│  ├── Email Tracking                                       │
│  └── Authentication (Clerk)                               │
├─────────────────────────────────────────────────────────────┤
│  Business Logic Layer                                      │
│  ├── Services                                             │
│  ├── AI Integration (Vercel AI SDK)                       │
│  ├── Background Jobs (Trigger.dev)                        │
│  └── Data Processing                                      │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                               │
│  ├── Drizzle ORM                                         │
│  ├── PostgreSQL Database                                  │
│  └── Type-safe Schema                                     │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Next.js App Router Structure

The application uses Next.js 15 with the App Router for a modern, performant routing system:

```
src/app/
├── (app)/                  # Route group for authenticated pages
│   ├── campaign/          # Email campaign management
│   ├── donors/            # Donor management interface
│   ├── staff/             # Staff management
│   ├── research/          # Analytics and insights
│   └── settings/          # Application configuration
├── api/                   # API route handlers
│   ├── trpc/             # tRPC endpoint configuration
│   ├── webhook/          # External webhook handlers
│   └── track/            # Email tracking endpoints
├── layout.tsx            # Root layout with providers
├── page.tsx              # Home page
└── globals.css           # Global styles
```

### Component Architecture

Components are organized using a feature-first approach:

```
src/components/
├── ui/                    # Base UI components (shadcn/ui)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   └── [other-ui-components].tsx
├── layout/               # Layout-specific components
│   ├── header.tsx
│   ├── sidebar.tsx
│   └── footer.tsx
├── campaign/             # Campaign feature components
│   ├── EmailListViewer.tsx
│   ├── CampaignResults.tsx
│   └── [other-campaign-components].tsx
└── [feature]/            # Other feature-specific components
```

### State Management Strategy

1. **Server State**: Managed by tRPC + TanStack Query
2. **Client State**: React hooks (useState, useReducer)
3. **Form State**: React Hook Form with Zod validation
4. **Global State**: React Context (minimal usage)

## Backend Architecture

### tRPC API Layer

Type-safe API communication using tRPC:

```typescript
// Router structure
src/app/api/trpc/
├── routers/
│   ├── donors.ts         # Donor management operations
│   ├── campaigns.ts      # Campaign management
│   ├── staff.ts          # Staff operations
│   └── analytics.ts      # Analytics and reporting
├── root.ts              # Root router configuration
└── trpc.ts              # tRPC configuration
```

### Service Layer Architecture

Business logic is encapsulated in service classes:

```
src/app/lib/services/
├── email-campaigns.service.ts    # Campaign management logic
├── donor.service.ts              # Donor operations
├── ai.service.ts                 # AI/LLM integration
├── tracking.service.ts           # Email tracking
└── analytics.service.ts          # Data analysis
```

### Background Jobs Architecture

Asynchronous processing using Trigger.dev:

```
src/trigger/jobs/
├── email-generation.ts     # Bulk email generation
├── campaign-sending.ts     # Email dispatch
├── analytics-processing.ts # Data analysis jobs
└── data-import.ts          # Data import operations
```

## Database Architecture

### Schema Design

The database uses Drizzle ORM for type-safe database operations:

```
src/app/lib/db/
├── schema.ts              # Complete database schema
├── migrations/            # Version-controlled migrations
├── seeds/                 # Database seed data
└── queries/               # Complex queries and views
```

### Key Entities and Relationships

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Users     │────▶│    Staff    │────▶│   Donors    │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Campaigns  │────▶│   Emails    │────▶│  Tracking   │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Database Performance Optimizations

1. **Strategic Indexing**: Performance-critical queries have dedicated indexes
2. **Connection Pooling**: Efficient database connection management
3. **Query Optimization**: Drizzle's query builder for optimal SQL generation
4. **Batch Operations**: Bulk operations for large datasets

## AI Integration Architecture

### LLM Provider Integration

The platform supports multiple AI providers through Vercel AI SDK:

```typescript
// AI Service Architecture
class AIService {
  private providers = {
    anthropic: new AnthropicProvider(),
    openai: new OpenAIProvider(),
    azure: new AzureOpenAIProvider()
  };

  async generateEmail(prompt: string, provider: string) {
    return this.providers[provider].generateCompletion(prompt);
  }
}
```

### Email Generation Pipeline

```
User Input → Prompt Engineering → LLM Processing → Content Validation → Email Generation
    ↓              ↓                    ↓                ↓                ↓
Requirements   Context Building    AI Response      Quality Check    Formatted Email
```

## Security Architecture

### Authentication & Authorization

1. **Authentication**: Clerk for user management and session handling
2. **Route Protection**: Middleware-based route protection
3. **API Security**: tRPC procedures with input validation
4. **Data Validation**: Zod schemas for type-safe validation

### Data Protection

1. **Environment Variables**: Sensitive data in environment variables
2. **API Key Management**: Secure storage and rotation
3. **Database Security**: Connection encryption and access controls
4. **Input Sanitization**: All user inputs validated and sanitized

## Performance Architecture

### Frontend Performance

1. **Code Splitting**: Automatic route-based code splitting
2. **Image Optimization**: Next.js Image component for optimized loading
3. **Bundle Optimization**: Tree shaking and dead code elimination
4. **Caching Strategy**: Strategic caching with TanStack Query

### Backend Performance

1. **Database Optimization**: Query optimization and indexing
2. **Background Processing**: CPU-intensive tasks moved to background jobs
3. **Memory Management**: Efficient memory usage patterns
4. **Connection Pooling**: Database connection optimization

## Scalability Considerations

### Horizontal Scaling

1. **Stateless Design**: API layer designed for horizontal scaling
2. **Background Jobs**: Distributed job processing capability
3. **Database Sharding**: Schema designed for potential sharding
4. **CDN Integration**: Static asset distribution

### Vertical Scaling

1. **Efficient Queries**: Optimized database operations
2. **Memory Management**: Proper resource cleanup
3. **Caching Layers**: Multiple levels of caching
4. **Connection Optimization**: Efficient resource utilization

## Monitoring & Observability

### Logging Architecture

1. **Structured Logging**: Winston logger with structured formats
2. **Context Preservation**: Request tracing and context propagation
3. **Error Tracking**: Comprehensive error logging with stack traces
4. **Performance Metrics**: Query performance and response time tracking

### Health Monitoring

1. **Database Health**: Connection pool and query performance monitoring
2. **API Health**: Response times and error rates
3. **Background Jobs**: Job queue health and processing times
4. **External Services**: AI provider availability and response times

## Deployment Architecture

### Development Environment

```
Developer Machine → GitHub → CI/CD Pipeline → Staging Environment
```

### Production Environment

```
GitHub → CI/CD Pipeline → Production Build → Deployment → Health Checks
```

### Infrastructure Components

1. **Application Server**: Node.js runtime environment
2. **Database**: PostgreSQL with connection pooling
3. **Background Jobs**: Trigger.dev for async processing
4. **File Storage**: Static asset storage and serving
5. **Monitoring**: Application and infrastructure monitoring

This architecture provides a solid foundation for a scalable, maintainable, and secure nonprofit management platform while maintaining excellent developer experience through type safety and modern tooling. 