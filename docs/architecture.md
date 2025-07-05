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

The application uses Next.js 15.3.1 with React 19 and the App Router for a modern, performant routing system:

```
src/app/
├── (app)/                  # Route group for authenticated pages
│   ├── campaign/          # Email campaign management
│   ├── donors/            # Donor management interface
│   ├── staff/             # Staff management
│   ├── research/          # Analytics and insights
│   ├── lists/             # Donor list management
│   ├── todos/             # Task management
│   └── settings/          # Application configuration
├── api/                   # API route handlers
│   ├── trpc/             # tRPC endpoint configuration
│   ├── webhook/          # External webhook handlers
│   ├── whatsapp/         # WhatsApp webhook handler
│   ├── track/            # Email tracking endpoints
│   └── signature-image/  # Signature image serving
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
├── signature/            # Email signature management
│   ├── SignatureEditor.tsx
│   ├── SignaturePreview.tsx
│   └── ImageGallery.tsx
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
│   ├── donors.ts                    # Donor management operations
│   ├── campaigns.ts                 # Campaign management
│   ├── agentic-email-campaigns.ts   # AI-powered campaign flows
│   ├── staff.ts                     # Staff operations
│   ├── analysis.ts                  # AI analysis operations
│   ├── lists.ts                     # Donor list management
│   ├── todos.ts                     # Task management
│   ├── whatsapp.ts                  # WhatsApp integration
│   ├── person-research.ts           # AI donor research
│   ├── email-tracking.ts            # Email analytics
│   ├── communication-threads.ts     # Thread management
│   ├── staff-gmail.ts               # Gmail integration
│   ├── staff-microsoft.ts           # Microsoft integration
│   └── templates.ts                 # Template management
├── _app.ts                          # Main router configuration
└── trpc.ts                          # tRPC configuration
```

### Service Layer Architecture

Business logic is encapsulated in service classes:

```
src/app/lib/services/
├── email-campaigns.service.ts           # Campaign management logic
├── agentic-email-generation.service.ts  # AI conversation flows
├── donor.service.ts                     # Donor operations
├── email-scheduling.service.ts          # Email scheduling
├── bulk-donor-research.service.ts       # Bulk research operations
├── donor-journey.service.ts             # Journey tracking
├── todo-service.ts                      # Task management
├── person-research/                     # Research pipeline
│   ├── web-search.service.ts
│   ├── web-crawler.service.ts
│   ├── answer-synthesis.service.ts
│   └── structured-data-extraction.service.ts
├── whatsapp/                            # WhatsApp AI
│   ├── whatsapp-ai.service.ts
│   ├── whatsapp-query-engine.service.ts
│   └── whatsapp-sql-engine.service.ts
└── gmail.service.ts                     # Gmail integration
```

### Background Jobs Architecture

Asynchronous processing using Trigger.dev v3:

```
src/trigger/jobs/
├── generateBulkEmails.ts         # Bulk email generation
├── sendSingleEmail.ts            # Individual email dispatch
├── bulkDonorResearch.ts          # Large-scale donor research
└── crawlAndSummarizeWebsite.ts   # Web content analysis
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
│Organizations│────▶│    Staff    │────▶│   Donors    │
│   (Clerk)   │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
        │                    │                 │
        ▼                    ▼                 ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Campaigns  │────▶│   Emails    │────▶│  Tracking   │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
        │                    │                 │
        ▼                    ▼                 ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Lists    │────▶│    Todos    │────▶│  Research   │
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

The platform supports multiple AI providers through Vercel AI SDK v4:

```typescript
// AI Service Architecture
class AIService {
  private providers = {
    anthropic: createAnthropic(),
    openai: createOpenAI(),
    azure: createAzure({
      baseURL: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
    })
  };

  async generateEmail(prompt: string, provider: string) {
    return this.providers[provider].generateCompletion(prompt);
  }
}
```

### Email Generation Pipeline

```
User Input → Agentic Conversation → Prompt Refinement → LLM Processing → Content Validation → Email Generation
    ↓              ↓                    ↓                    ↓                ↓                ↓
Requirements   Interactive Flow    Instruction Agent    AI Response      Quality Check    Formatted Email
```

## Security Architecture

### Authentication & Authorization

1. **Authentication**: Clerk for multi-tenant user management
2. **Organization Scoping**: All data scoped to active organization
3. **Route Protection**: Middleware-based route protection
4. **API Security**: tRPC procedures with input validation
5. **Data Validation**: Zod schemas for type-safe validation
6. **OAuth Integration**: Secure Gmail/Microsoft authentication

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

## Multi-Tenant Architecture

### Organization-Level Isolation

1. **Clerk Organizations**: Each customer is a separate Clerk organization
2. **Data Isolation**: All queries scoped by organizationId
3. **Permission Boundaries**: Staff can only access their organization's data
4. **Resource Limits**: Per-organization rate limiting and quotas

### Tenant Context Management

```typescript
// Every tRPC procedure includes organization context
const procedure = publicProcedure.use(async ({ ctx, next }) => {
  const organizationId = ctx.auth.user.organizationId;
  return next({
    ctx: { ...ctx, organizationId }
  });
});
```

## Communication Architecture

### Email System

1. **Provider Integration**: Gmail and Microsoft Graph API support
2. **Tracking Pipeline**: Pixel tracking for opens, link tracking for clicks
3. **Scheduling System**: Timezone-aware scheduling with constraints
4. **Signature Management**: Rich text signatures with image support

### WhatsApp Integration

1. **Business API**: Webhook-based message processing
2. **Natural Language Processing**: AI-powered query understanding
3. **Voice Support**: Whisper API for voice message transcription
4. **Permission System**: Staff-level phone number access control

## AI Pipeline Architecture

### Agentic Email Generation

```
Initial Request → Understanding Phase → Refinement Phase → Generation Phase
      ↓                   ↓                    ↓                  ↓
User Intent      Context Gathering     Instruction Polish    Bulk Generation
```

### Donor Research Pipeline

```
Research Request → Web Search → Content Crawling → Data Extraction → Synthesis
        ↓              ↓              ↓                  ↓              ↓
   Query Builder   Search APIs    Puppeteer        Structured AI    Final Report
```

### Analysis Pipeline

```
Donor Data → Stage Classification → Action Prediction → Todo Generation
     ↓              ↓                      ↓                  ↓
Historical    AI Classification      AI Recommendations   Task Creation
```

## Feature-Specific Architectures

### List Management
- Dynamic list creation with criteria-based filtering
- Bulk operations for member management
- Real-time member count updates
- CSV import/export capabilities

### Todo System
- AI-generated tasks from donor analysis
- Priority and deadline management
- Staff assignment and tracking
- Integration with donor journey stages

### Email Tracking
- Pixel-based open tracking
- Link wrapping for click tracking
- Real-time analytics dashboard
- Campaign performance metrics

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