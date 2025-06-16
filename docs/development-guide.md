# Development Guide

## Getting Started

This guide will help you set up your development environment and understand the development workflow for the Nonprofit Webserver project.

## Prerequisites

### Required Software

1. **Node.js 22.4.0**
   ```bash
   # Using nvm (recommended)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 22.4.0
   nvm use 22.4.0
   ```

2. **pnpm Package Manager**
   ```bash
   npm install -g pnpm
   ```

3. **PostgreSQL Database**
   ```bash
   # macOS (using Homebrew)
   brew install postgresql
   brew services start postgresql
   
   # Create database
   createdb nonprofit_db
   ```

4. **Git**
   ```bash
   # Verify installation
   git --version
   ```

### Development Tools (Recommended)

- **VS Code** with extensions:
  - TypeScript and JavaScript Language Features
  - Tailwind CSS IntelliSense
  - ESLint
  - Prettier
  - PostgreSQL (for database management)
- **Clerk Dashboard** access for authentication management
- **AI Provider API Keys** (Anthropic, OpenAI, Azure)

## Environment Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd webserver
```

### 2. Install Dependencies

```bash
nvm use 22.4.0
pnpm install
```

### 3. Environment Configuration

Create `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/nonprofit_db"

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/"

# AI Providers
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."
AZURE_OPENAI_API_KEY="..."
AZURE_OPENAI_ENDPOINT="https://..."

# Application Configuration
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# Email Tracking
TRACKING_SECRET="your-random-secret-string"

# Background Jobs (Trigger.dev)
TRIGGER_SECRET_KEY="tr_dev_..."
```

### 4. Database Setup

```bash
# Generate initial migration
pnpm db:generate

# Push schema to database
pnpm db:push

# Run migrations
pnpm db:migrate

# (Optional) Open database studio
pnpm db:studio
```

### 5. Start Development Server

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## Development Workflow

### Task-Driven Development

This project follows a structured 4-phase development approach:

#### Phase 1: Research
- Understand the requirements thoroughly
- Review existing code and architecture
- Identify dependencies and potential issues
- Document findings in `task.md`

#### Phase 2: Plan
- Break down work into specific, actionable tasks
- Update `task.md` with detailed task list
- Estimate effort and identify dependencies
- Plan implementation approach

#### Phase 3: Execution
- Implement changes according to the plan
- Follow established code conventions
- Write tests for new functionality
- Update documentation as needed

#### Phase 4: Review
- Test changes thoroughly
- Fix any linting errors
- Review code for quality and conventions
- Update task list with completion status

### Task Management

The project uses `task.md` for task tracking:

```markdown
# Task Title

## Overview
Brief description of what needs to be done

## Tasks

### Phase 1: Research & Analysis
- [ ] Research item 1
- [ ] Research item 2

### Phase 2: Planning
- [ ] Plan item 1
- [ ] Plan item 2

### Phase 3: Implementation
- [ ] Implementation item 1
- [ ] Implementation item 2

### Phase 4: Review & Testing
- [ ] Test item 1
- [ ] Fix linting errors
- [ ] Final review

## Relevant Files
- List of files that will be modified
- Brief description of changes for each

## Implementation Details
Detailed notes about the implementation approach
```

## Code Structure and Conventions

### File Organization

```
src/
├── app/                    # Next.js App Router
│   ├── (app)/             # Main application routes
│   │   ├── [feature]/     # Feature-specific pages
│   │   │   ├── page.tsx   # Page component
│   │   │   ├── layout.tsx # Layout (if needed)
│   │   │   └── components/ # Page-specific components
│   │   └── components/    # Shared components across features
│   ├── api/               # API routes
│   ├── components/        # App-level components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities and services
│   └── types/             # Type definitions
├── components/            # Global shared components
├── hooks/                 # Global custom hooks
└── lib/                   # Global utilities
```

### Naming Conventions

#### Files and Directories
- **Components**: PascalCase (`EmailListViewer.tsx`)
- **Hooks**: camelCase with `use` prefix (`useDonors.ts`)
- **Services**: camelCase with `.service` suffix (`email-campaigns.service.ts`)
- **Utilities**: kebab-case (`email-generator.ts`)
- **Types**: PascalCase with `.types` suffix (`Campaign.types.ts`)

#### Variables and Functions
- **Variables**: camelCase (`donorList`, `emailCount`)
- **Functions**: camelCase (`generateEmail`, `processDonors`)
- **Components**: PascalCase (`EmailViewer`, `DonorCard`)
- **Constants**: SCREAMING_SNAKE_CASE (`API_ENDPOINTS`, `DEFAULT_PAGE_SIZE`)

### TypeScript Conventions

#### Type Definitions
```typescript
// ✅ Good: Explicit interface definition
interface Donor {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  assignedToStaffId: number | null;
}

// ❌ Bad: Using any type
const donor: any = fetchDonor();

// ✅ Good: Nullable types
type StaffAssignment = {
  staffId: number | null;
  assignedDate: Date | null;
};
```

#### Function Documentation
```typescript
/**
 * Generates personalized emails for a list of donors
 * @param donors - List of donor records to generate emails for
 * @param template - Email template configuration
 * @param options - Additional generation options
 * @returns Promise resolving to generated email data
 */
async function generateEmails(
  donors: Donor[],
  template: EmailTemplate,
  options: GenerationOptions
): Promise<GeneratedEmail[]> {
  // Implementation
}
```

### React Component Conventions

#### Component Structure
```typescript
// ✅ Good component structure
interface EmailViewerProps {
  emails: Email[];
  onEmailSelect: (email: Email) => void;
  showPagination?: boolean;
}

export function EmailViewer({ emails, onEmailSelect, showPagination = true }: EmailViewerProps) {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  
  // Custom hooks
  const { trackingData } = useEmailTracking();
  
  // Event handlers
  const handleEmailClick = useCallback((email: Email) => {
    setSelectedEmail(email);
    onEmailSelect(email);
  }, [onEmailSelect]);
  
  // Render
  return (
    <div className="email-viewer">
      {/* Component JSX */}
    </div>
  );
}
```

#### Hook Usage
```typescript
// ✅ Good: Using custom hooks instead of direct tRPC
const { donors, isLoading, error } = useDonors();

// ❌ Bad: Direct tRPC usage in components
const { data: donors } = api.donors.getAll.useQuery();
```

### Backend Conventions

#### Service Classes
```typescript
// ✅ Good: Service class structure
export class EmailCampaignService {
  constructor(private db: Database, private logger: Logger) {}

  /**
   * Creates a new email campaign
   */
  async createCampaign(data: CreateCampaignData): Promise<Campaign> {
    try {
      this.logger.info(`Creating campaign for ${data.donorIds.length} donors`);
      
      const campaign = await this.db.insert(campaigns).values({
        instruction: data.instruction,
        selectedDonorIds: data.donorIds,
        status: 'pending'
      }).returning();

      return campaign[0];
    } catch (error) {
      this.logger.error(`Failed to create campaign: ${error.message}`);
      throw new Error('Campaign creation failed');
    }
  }
}
```

#### tRPC Procedures
```typescript
// ✅ Good: tRPC procedure structure
export const donorRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const { limit, offset } = input;
      
      return await ctx.db
        .select()
        .from(donors)
        .limit(limit)
        .offset(offset);
    }),

  create: publicProcedure
    .input(createDonorSchema)
    .mutation(async ({ input, ctx }) => {
      return await ctx.db
        .insert(donors)
        .values(input)
        .returning();
    }),
});
```

## Testing Guidelines

### Unit Testing
```typescript
// Example test structure
import { describe, it, expect, beforeEach } from 'vitest';
import { EmailCampaignService } from '../email-campaigns.service';

describe('EmailCampaignService', () => {
  let service: EmailCampaignService;
  
  beforeEach(() => {
    service = new EmailCampaignService(mockDb, mockLogger);
  });

  it('should create campaign successfully', async () => {
    const campaignData = {
      instruction: 'Test instruction',
      donorIds: [1, 2, 3]
    };

    const result = await service.createCampaign(campaignData);
    
    expect(result).toHaveProperty('id');
    expect(result.status).toBe('pending');
  });
});
```

### Integration Testing
```typescript
// Example API test
import { describe, it, expect } from 'vitest';
import { createCaller } from '../trpc/root';

describe('Donor API', () => {
  it('should fetch donors with pagination', async () => {
    const caller = createCaller({
      db: testDb,
      user: testUser
    });

    const result = await caller.donors.getAll({
      limit: 10,
      offset: 0
    });

    expect(result).toHaveLength(10);
    expect(result[0]).toHaveProperty('id');
  });
});
```

## Database Development

### Schema Changes

1. **Modify Schema**
   ```typescript
   // src/app/lib/db/schema.ts
   export const donors = pgTable('donors', {
     id: serial('id').primaryKey(),
     firstName: varchar('first_name', { length: 100 }).notNull(),
     lastName: varchar('last_name', { length: 100 }).notNull(),
     email: varchar('email', { length: 255 }).notNull().unique(),
     // Add new fields here
   });
   ```

2. **Generate Migration**
   ```bash
   pnpm db:generate
   ```

3. **Review Migration**
   Check generated SQL in `drizzle/migrations/`

4. **Apply Migration**
   ```bash
   pnpm db:push
   ```

### Query Development

```typescript
// ✅ Good: Type-safe queries with Drizzle
const donorsWithStaff = await db
  .select({
    donor: donors,
    staff: staff
  })
  .from(donors)
  .leftJoin(staff, eq(donors.assignedToStaffId, staff.id))
  .where(eq(donors.isActive, true))
  .limit(20);

// ✅ Good: Complex queries with proper typing
const campaignStats = await db
  .select({
    campaignId: campaigns.id,
    totalEmails: count(generatedEmails.id),
    openedEmails: countDistinct(emailTracking.id)
  })
  .from(campaigns)
  .leftJoin(generatedEmails, eq(campaigns.id, generatedEmails.campaignId))
  .leftJoin(emailTracking, and(
    eq(generatedEmails.id, emailTracking.emailId),
    eq(emailTracking.eventType, 'open')
  ))
  .groupBy(campaigns.id);
```

## Debugging and Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check PostgreSQL status
brew services list | grep postgresql

# Restart PostgreSQL
brew services restart postgresql

# Check connection
psql -h localhost -p 5432 -U username -d nonprofit_db
```

#### TypeScript Errors
```bash
# Clear TypeScript cache
rm -rf .next
rm tsconfig.tsbuildinfo

# Restart TypeScript service
# In VS Code: Cmd+Shift+P -> "TypeScript: Restart TS Server"
```

#### Build Errors
```bash
# Clear all caches
rm -rf .next node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

### Logging and Debugging

#### Backend Logging
```typescript
// Use structured logging
logger.info(`Processing ${donorCount} donors for campaign ${campaignId}`);
logger.error(`Database query failed: ${error.message}`, { 
  query: 'donors.getAll',
  parameters: { limit, offset }
});
```

#### Frontend Debugging
```typescript
// Use React Developer Tools
// Add temporary debugging
console.log('Donor data:', donors);
console.log('Component props:', { emails, onEmailSelect });

// Use debugger statements
debugger; // Will break in browser dev tools
```

## Performance Optimization

### Database Performance
- Use indexes for frequently queried columns
- Implement pagination for large datasets
- Use batch operations for bulk updates
- Monitor query performance with `EXPLAIN ANALYZE`

### Frontend Performance
- Implement virtualization for large lists
- Use React.memo for expensive components
- Implement proper key props in lists
- Optimize bundle size with code splitting

### Backend Performance
- Use background jobs for heavy operations
- Implement caching where appropriate
- Optimize database queries
- Monitor memory usage and connection pooling

## Deployment and Production

### Pre-deployment Checklist
- [ ] All tests passing
- [ ] TypeScript compilation successful
- [ ] ESLint checks passing
- [ ] Build process successful
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Performance testing completed

### Production Considerations
- Monitor application logs
- Set up error tracking
- Implement health checks
- Configure proper caching headers
- Set up database backups
- Monitor resource usage

This development guide should help you contribute effectively to the Nonprofit Webserver project while maintaining code quality and following established patterns. 