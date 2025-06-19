# API Reference

This document provides comprehensive documentation for all tRPC API endpoints in the Givance platform.

## Table of Contents
- [Authentication](#authentication)
- [Organizations](#organizations)
- [Donors](#donors)
- [Projects](#projects)
- [Donations](#donations)
- [Communications](#communications)
- [Email Campaigns](#email-campaigns)
- [AI Services](#ai-services)
- [Staff Management](#staff-management)
- [Integrations](#integrations)

## Authentication

All API endpoints require authentication via Clerk. The organization context is automatically determined from the authenticated user's active organization.

### Headers
```typescript
Authorization: Bearer <clerk-token>
```

## Organizations

### `organizations.current`
Get the current organization details for the authenticated user.

**Response:**
```typescript
{
  id: string;
  name: string;
  slug: string;
  donorJourneyGraph?: {
    stages: Array<{
      id: string;
      name: string;
      description: string;
      transitions: Array<{
        to: string;
        condition: string;
      }>;
    }>;
  };
  aiInstructions?: string;
  websiteData?: {
    url: string;
    content: string;
    lastCrawled: Date;
  };
}
```

### `organizations.update`
Update organization settings including AI instructions and donor journey configuration.

**Input:**
```typescript
{
  name?: string;
  aiInstructions?: string;
  donorJourneyGraph?: DonorJourneyGraph;
}
```

## Donors

### `donors.list`
Get paginated list of donors with filtering and search capabilities.

**Input:**
```typescript
{
  page?: number;              // Default: 1
  pageSize?: number;          // Default: 25, Max: 100
  search?: string;            // Search by name or email
  projectId?: string;         // Filter by project
  donorListId?: string;       // Filter by donor list
  stages?: string[];          // Filter by journey stages
  orderBy?: 'name' | 'lastContact' | 'totalDonated' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}
```

**Response:**
```typescript
{
  donors: Array<{
    id: string;
    organizationId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    donorType: 'individual' | 'couple';
    externalId?: string;
    journeyStage?: string;
    lastContactDate?: Date;
    totalDonated: number;
    donationCount: number;
    createdAt: Date;
    spouse?: {
      firstName?: string;
      lastName?: string;
      email?: string;
    };
    research?: {
      id: string;
      status: 'completed' | 'in_progress' | 'failed';
      data?: ResearchData;
    };
  }>;
  totalCount: number;
  hasMore: boolean;
}
```

### `donors.get`
Get detailed donor information by ID.

**Input:**
```typescript
{
  id: string;
}
```

### `donors.create`
Create a new donor record.

**Input:**
```typescript
{
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  donorType: 'individual' | 'couple';
  externalId?: string;
  spouse?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}
```

### `donors.update`
Update existing donor information.

**Input:**
```typescript
{
  id: string;
  // All fields from create are optional
}
```

### `donors.delete`
Delete a donor and all associated data.

**Input:**
```typescript
{
  id: string;
}
```

### `donors.bulkImport`
Import multiple donors from CSV or external system.

**Input:**
```typescript
{
  donors: Array<DonorInput>;
  updateExisting?: boolean;  // Update if externalId matches
  skipDuplicates?: boolean;  // Skip if email matches
}
```

## Projects

### `projects.list`
Get all projects for the organization.

**Response:**
```typescript
{
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    targetAmount?: number;
    currentAmount: number;
    donorCount: number;
    startDate?: Date;
    endDate?: Date;
    status: 'active' | 'completed' | 'draft';
  }>;
}
```

### `projects.create`
Create a new fundraising project.

**Input:**
```typescript
{
  name: string;
  description?: string;
  targetAmount?: number;
  startDate?: Date;
  endDate?: Date;
}
```

### `projects.analytics`
Get detailed analytics for a project.

**Input:**
```typescript
{
  id: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}
```

**Response:**
```typescript
{
  totalRaised: number;
  donorCount: number;
  averageDonation: number;
  topDonors: Array<{
    donorId: string;
    name: string;
    amount: number;
  }>;
  timeline: Array<{
    date: Date;
    amount: number;
    count: number;
  }>;
}
```

## Donations

### `donations.create`
Record a new donation.

**Input:**
```typescript
{
  donorId: string;
  projectId?: string;
  amount: number;
  date: Date;
  paymentMethod?: 'cash' | 'check' | 'credit_card' | 'wire' | 'other';
  notes?: string;
  isRecurring?: boolean;
}
```

### `donations.list`
Get donation history with filtering.

**Input:**
```typescript
{
  donorId?: string;
  projectId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
}
```

## Communications

### `communications.create`
Create a new communication record.

**Input:**
```typescript
{
  donorId: string;
  channel: 'email' | 'phone' | 'text' | 'whatsapp' | 'in_person';
  direction: 'inbound' | 'outbound';
  subject?: string;
  content: string;
  staffId?: string;
  threadId?: string;  // To continue existing thread
  scheduledFor?: Date;
}
```

### `communications.threads`
Get communication threads for a donor.

**Input:**
```typescript
{
  donorId: string;
  channel?: CommunicationChannel;
  limit?: number;
}
```

**Response:**
```typescript
{
  threads: Array<{
    id: string;
    latestMessage: {
      content: string;
      date: Date;
      direction: 'inbound' | 'outbound';
    };
    messageCount: number;
    participants: string[];
  }>;
}
```

## Email Campaigns

### `emailCampaigns.createSession`
Start a new AI-powered email campaign session.

**Input:**
```typescript
{
  name: string;
  description?: string;
}
```

**Response:**
```typescript
{
  sessionId: string;
  status: 'configuring' | 'generating' | 'completed';
}
```

### `emailCampaigns.chat`
Interact with the AI to refine campaign instructions.

**Input:**
```typescript
{
  sessionId: string;
  message: string;
}
```

**Response:**
```typescript
{
  response: string;
  suggestedInstructions?: string;
  readyToGenerate: boolean;
}
```

### `emailCampaigns.selectDonors`
Select donors for the campaign.

**Input:**
```typescript
{
  sessionId: string;
  donorListId?: string;
  donorIds?: string[];
  filters?: DonorFilters;
}
```

### `emailCampaigns.generateEmails`
Trigger bulk email generation (runs as background job).

**Input:**
```typescript
{
  sessionId: string;
  testMode?: boolean;  // Generate for subset only
}
```

**Response:**
```typescript
{
  jobId: string;
  estimatedTime: number;  // seconds
  emailCount: number;
}
```

### `emailCampaigns.getProgress`
Check generation progress.

**Input:**
```typescript
{
  jobId: string;
}
```

**Response:**
```typescript
{
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;  // 0-100
  completedCount: number;
  totalCount: number;
  errors?: string[];
}
```

### `emailCampaigns.listGeneratedEmails`
Get generated emails for review.

**Input:**
```typescript
{
  sessionId: string;
  status?: 'draft' | 'scheduled' | 'sent' | 'failed';
  page?: number;
  pageSize?: number;
}
```

### `emailCampaigns.sendEmail`
Send or schedule an individual email.

**Input:**
```typescript
{
  emailId: string;
  scheduledFor?: Date;  // Immediate if not provided
  staffId: string;      // Staff member whose email to send from
}
```

### `emailTracking.recordOpen`
Record email open event (called by tracking pixel).

**Input:**
```typescript
{
  trackerId: string;
  userAgent?: string;
  ipAddress?: string;
}
```

### `emailTracking.recordClick`
Record link click event.

**Input:**
```typescript
{
  trackerId: string;
  linkUrl: string;
  userAgent?: string;
  ipAddress?: string;
}
```

## AI Services

### `personResearch.start`
Initiate AI-powered donor research.

**Input:**
```typescript
{
  donorId: string;
  includeSpouse?: boolean;
  researchDepth?: 'basic' | 'standard' | 'comprehensive';
}
```

**Response:**
```typescript
{
  researchId: string;
  status: 'pending' | 'in_progress';
}
```

### `personResearch.getStatus`
Check research progress.

**Input:**
```typescript
{
  researchId: string;
}
```

**Response:**
```typescript
{
  status: 'pending' | 'searching' | 'analyzing' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  results?: {
    summary: string;
    age?: number;
    estimatedIncome?: string;
    employer?: string;
    interests: string[];
    givingCapacity?: 'low' | 'medium' | 'high' | 'major';
    sources: Array<{
      url: string;
      title: string;
      relevance: number;
    }>;
  };
}
```

### `donorJourney.analyze`
Analyze donor for journey stage placement.

**Input:**
```typescript
{
  donorId: string;
}
```

**Response:**
```typescript
{
  currentStage: string;
  confidence: number;
  reasoning: string;
  suggestedActions: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high';
    deadline?: Date;
  }>;
  potentialTransitions: Array<{
    toStage: string;
    likelihood: number;
    requirements: string[];
  }>;
}
```

### `donorJourney.predictActions`
Get AI-predicted next best actions for donors.

**Input:**
```typescript
{
  donorIds?: string[];  // All donors if not provided
  limit?: number;
}
```

**Response:**
```typescript
{
  predictions: Array<{
    donorId: string;
    donorName: string;
    currentStage: string;
    suggestedActions: Array<{
      action: string;
      reasoning: string;
      priority: 'low' | 'medium' | 'high';
      expectedOutcome: string;
    }>;
  }>;
}
```

## Staff Management

### `staff.list`
Get all staff members for the organization.

**Response:**
```typescript
{
  staff: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    permissions: string[];
    emailIntegration?: {
      provider: 'gmail' | 'microsoft';
      email: string;
      isActive: boolean;
    };
  }>;
}
```

### `gmail.connect`
Initiate Gmail OAuth connection.

**Input:**
```typescript
{
  redirectUrl: string;
}
```

**Response:**
```typescript
{
  authUrl: string;
}
```

### `gmail.callback`
Complete Gmail OAuth flow.

**Input:**
```typescript
{
  code: string;
  state: string;
}
```

### `gmail.sendEmail`
Send email via connected Gmail account.

**Input:**
```typescript
{
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string;  // base64
    contentType: string;
  }>;
  threadId?: string;  // For replies
}
```

### `microsoft.connect`
Initiate Microsoft OAuth connection.

**Input:**
```typescript
{
  redirectUrl: string;
}
```

### `microsoft.sendEmail`
Send email via connected Microsoft account.

**Input:**
```typescript
{
  // Same as gmail.sendEmail
}
```

## Integrations

### `whatsapp.validatePhoneNumber`
Validate phone number for WhatsApp integration.

**Input:**
```typescript
{
  phoneNumber: string;
}
```

**Response:**
```typescript
{
  isValid: boolean;
  hasWhatsapp: boolean;
  formattedNumber: string;
}
```

### `whatsapp.processQuery`
Process natural language query about donor data.

**Input:**
```typescript
{
  query: string;
  staffPhoneNumber: string;
}
```

**Response:**
```typescript
{
  answer: string;
  data?: any;  // Structured data if applicable
  suggestions?: string[];  // Related queries
}
```

### `templates.list`
Get email templates.

**Response:**
```typescript
{
  templates: Array<{
    id: string;
    name: string;
    subject: string;
    body: string;
    variables: string[];  // e.g., ["donor_name", "project_name"]
    category?: string;
    usageCount: number;
  }>;
}
```

### `templates.create`
Create a new email template.

**Input:**
```typescript
{
  name: string;
  subject: string;
  body: string;
  category?: string;
}
```

## Error Responses

All endpoints follow a consistent error response format:

```typescript
{
  error: {
    code: string;           // e.g., "UNAUTHORIZED", "NOT_FOUND", "VALIDATION_ERROR"
    message: string;        // Human-readable error message
    details?: any;          // Additional error context
  }
}
```

Common error codes:
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Lacks permission for the requested resource
- `NOT_FOUND`: Requested resource doesn't exist
- `VALIDATION_ERROR`: Input validation failed
- `RATE_LIMITED`: Too many requests
- `INTERNAL_ERROR`: Server error

## Rate Limiting

API endpoints are rate-limited per organization:
- Standard endpoints: 1000 requests per minute
- AI endpoints: 100 requests per minute
- Bulk operations: 10 requests per minute

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1678886400
```

## Webhooks

The platform supports webhooks for real-time updates:

### Events
- `donor.created`
- `donor.updated`
- `donation.created`
- `email.sent`
- `email.opened`
- `email.clicked`
- `research.completed`

### Webhook Payload
```typescript
{
  id: string;
  type: string;
  organizationId: string;
  data: any;  // Event-specific data
  createdAt: Date;
}
```

## Best Practices

1. **Pagination**: Always use pagination for list endpoints to avoid performance issues
2. **Filtering**: Use specific filters rather than fetching all data and filtering client-side
3. **Caching**: Implement appropriate caching for read-heavy operations
4. **Error Handling**: Always handle potential errors gracefully
5. **Batch Operations**: Use bulk endpoints when operating on multiple records
6. **Webhooks**: Subscribe to webhooks for real-time updates instead of polling

## SDK Usage

TypeScript example using tRPC hooks:

```typescript
import { api } from '~/trpc/react';

function DonorList() {
  const { data, isLoading, error } = api.donors.list.useQuery({
    page: 1,
    pageSize: 25,
    search: 'Smith'
  });

  const createDonor = api.donors.create.useMutation({
    onSuccess: () => {
      // Refetch donors list
      utils.donors.list.invalidate();
    }
  });

  // Usage
  createDonor.mutate({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com'
  });
}
```