# API Reference

This document provides comprehensive documentation for all tRPC API endpoints in the Givance platform.

## Table of Contents
- [Authentication](#authentication)
- [Organizations](#organizations)
- [Donors](#donors)
- [Donor Lists](#donor-lists)
- [Projects](#projects)
- [Donations](#donations)
- [Communications](#communications)
- [Communication Threads](#communication-threads)
- [Email Campaigns](#email-campaigns)
- [Agentic Email Campaigns](#agentic-email-campaigns)
- [Email Tracking](#email-tracking)
- [AI Services](#ai-services)
- [Analysis](#analysis)
- [Person Research](#person-research)
- [Todos](#todos)
- [Staff Management](#staff-management)
- [WhatsApp](#whatsapp)
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

## Donor Lists

### `lists.create`
Create a new donor list.

**Input:**
```typescript
{
  name: string;
  description?: string;
}
```

### `lists.list`
Get all donor lists for the organization.

**Response:**
```typescript
{
  lists: Array<{
    id: string;
    name: string;
    description?: string;
    memberCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
}
```

### `lists.getById`
Get a specific donor list by ID.

**Input:**
```typescript
{
  id: string;
}
```

### `lists.update`
Update a donor list.

**Input:**
```typescript
{
  id: string;
  name?: string;
  description?: string;
}
```

### `lists.delete`
Delete a donor list.

**Input:**
```typescript
{
  id: string;
  deleteDonors?: boolean;  // Also delete donors that are only in this list
}
```

### `lists.addDonors`
Add donors to a list.

**Input:**
```typescript
{
  listId: string;
  donorIds: string[];
}
```

### `lists.removeDonors`
Remove donors from a list.

**Input:**
```typescript
{
  listId: string;
  donorIds: string[];
}
```

### `lists.createByCriteria`
Create a new list based on filtering criteria.

**Input:**
```typescript
{
  name: string;
  description?: string;
  criteria: {
    stages?: string[];
    minDonationAmount?: number;
    maxDonationAmount?: number;
    lastContactBefore?: Date;
    lastContactAfter?: Date;
    hasEmail?: boolean;
    assignedStaffIds?: string[];
  };
}
```

### `lists.bulkUpdateMembersStaff`
Bulk update staff assignment for all members of a list.

**Input:**
```typescript
{
  listId: string;
  staffId: string;
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

## Communication Threads

### `communicationThreads.createThread`
Create a new communication thread.

**Input:**
```typescript
{
  subject: string;
  donorIds?: string[];
  staffIds?: string[];
}
```

### `communicationThreads.getThread`
Get a communication thread by ID.

**Input:**
```typescript
{
  id: string;
  includeMessages?: boolean;
  includeParticipants?: boolean;
}
```

### `communicationThreads.listThreads`
List communication threads with filtering.

**Input:**
```typescript
{
  donorId?: string;
  staffId?: string;
  page?: number;
  pageSize?: number;
}
```

### `communicationThreads.addMessage`
Add a message to a thread.

**Input:**
```typescript
{
  threadId: string;
  content: string;
  authorType: 'staff' | 'donor' | 'system';
  authorId: string;
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
  }>;
}
```

## Agentic Email Campaigns

### `agenticEmailCampaigns.startFlow`
Start a new agentic email generation conversation.

**Input:**
```typescript
{
  projectId?: string;
  donorIds: string[];
  initialMessage: string;
}
```

**Response:**
```typescript
{
  sessionId: string;
  response: string;
  phase: 'understanding' | 'refining' | 'generating';
}
```

### `agenticEmailCampaigns.continueFlow`
Continue an existing agentic conversation.

**Input:**
```typescript
{
  sessionId: string;
  message: string;
}
```

### `agenticEmailCampaigns.generateFinalPrompt`
Generate the final prompt for user confirmation.

**Input:**
```typescript
{
  sessionId: string;
}
```

### `agenticEmailCampaigns.executeGeneration`
Execute email generation with the confirmed prompt.

**Input:**
```typescript
{
  sessionId: string;
  confirmedPrompt: string;
}
```

## Email Tracking

### `emailTracking.getSessionStats`
Get tracking statistics for an email generation session.

**Input:**
```typescript
{
  sessionId: string;
}
```

**Response:**
```typescript
{
  totalEmails: number;
  sentEmails: number;
  openedEmails: number;
  clickedEmails: number;
  openRate: number;
  clickRate: number;
}
```

### `emailTracking.getDonorStatsForSession`
Get tracking statistics for all donors in a session.

**Input:**
```typescript
{
  sessionId: string;
}
```

### `emailTracking.getEmailTracking`
Get detailed tracking data for a specific email.

**Input:**
```typescript
{
  emailId: string;
  donorId: string;
}
```

### `emailTracking.hasEmailBeenOpened`
Check if a specific email has been opened.

**Input:**
```typescript
{
  emailId: string;
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

## Analysis

### `analysis.analyzeDonors`
Analyze multiple donors through the complete AI pipeline.

**Input:**
```typescript
{
  donorIds: string[];
  includeStageClassification?: boolean;
  includeActionPrediction?: boolean;
  includeStageTransition?: boolean;
}
```

**Response:**
```typescript
{
  results: Array<{
    donorId: string;
    stageClassification?: {
      currentStage: string;
      confidence: number;
      reasoning: string;
    };
    actionPredictions?: Array<{
      action: string;
      priority: 'low' | 'medium' | 'high';
      deadline?: Date;
      reasoning: string;
    }>;
    stageTransition?: {
      fromStage: string;
      toStage: string;
      transitioned: boolean;
    };
  }>;
}
```

## Person Research

### `personResearch.conductDonorResearch`
Conduct comprehensive AI-powered research on a donor.

**Input:**
```typescript
{
  donorId: string;
  researchDepth?: 'basic' | 'standard' | 'comprehensive';
}
```

### `personResearch.getDonorResearch`
Get research results for a specific donor.

**Input:**
```typescript
{
  donorId: string;
  version?: number;  // Latest if not specified
}
```

### `personResearch.startBulkDonorResearch`
Start bulk research for all unresearched donors.

**Response:**
```typescript
{
  jobId: string;
  donorCount: number;
  estimatedTime: number;
}
```

### `personResearch.getResearchStatistics`
Get research statistics for the organization.

**Response:**
```typescript
{
  totalDonors: number;
  researchedDonors: number;
  failedResearch: number;
  averageResearchTime: number;
  lastResearchDate?: Date;
}
```

## Todos

### `todos.create`
Create a new todo.

**Input:**
```typescript
{
  title: string;
  description?: string;
  donorId?: string;
  assigneeId?: string;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high';
  type?: 'call' | 'email' | 'meeting' | 'task' | 'follow_up';
}
```

### `todos.update`
Update an existing todo.

**Input:**
```typescript
{
  id: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assigneeId?: string;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high';
}
```

### `todos.getByOrganization`
Get todos for the current organization.

**Input:**
```typescript
{
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assigneeId?: string;
  donorId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
}
```

### `todos.getGroupedByType`
Get todos grouped by type.

**Response:**
```typescript
{
  groups: Array<{
    type: string;
    count: number;
    todos: Array<Todo>;
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

### `staffGmail.getStaffGmailAuthUrl`
Get Gmail authentication URL for a specific staff member.

**Input:**
```typescript
{
  staffId: string;
}
```

**Response:**
```typescript
{
  authUrl: string;
}
```

### `staffGmail.handleStaffGmailOAuthCallback`
Handle OAuth callback for staff Gmail authentication.

**Input:**
```typescript
{
  staffId: string;
  code: string;
}
```

### `staffGmail.getStaffGmailConnectionStatus`
Get Gmail connection status for a specific staff member.

**Input:**
```typescript
{
  staffId: string;
}
```

**Response:**
```typescript
{
  connected: boolean;
  email?: string;
  lastSync?: Date;
}
```

### `staffGmail.disconnectStaffGmail`
Disconnect Gmail account for a specific staff member.

**Input:**
```typescript
{
  staffId: string;
}
```

### `staffMicrosoft.getStaffMicrosoftAuthUrl`
Get Microsoft authentication URL for a specific staff member.

**Input:**
```typescript
{
  staffId: string;
}
```

**Response:**
```typescript
{
  authUrl: string;
}
```

### `staffMicrosoft.handleStaffMicrosoftOAuthCallback`
Handle OAuth callback for staff Microsoft authentication.

**Input:**
```typescript
{
  staffId: string;
  code: string;
}
```

### `staffMicrosoft.getStaffMicrosoftConnectionStatus`
Get Microsoft connection status for a specific staff member.

**Input:**
```typescript
{
  staffId: string;
}
```

**Response:**
```typescript
{
  connected: boolean;
  email?: string;
  lastSync?: Date;
}
```

### `staffMicrosoft.disconnectStaffMicrosoft`
Disconnect Microsoft account for a specific staff member.

**Input:**
```typescript
{
  staffId: string;
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

## WhatsApp

### `whatsapp.addPhoneNumber`
Add a phone number to a staff member's WhatsApp permissions.

**Input:**
```typescript
{
  staffId: string;
  phoneNumber: string;
}
```

### `whatsapp.removePhoneNumber`
Remove a phone number from a staff member's WhatsApp permissions.

**Input:**
```typescript
{
  staffId: string;
  phoneNumber: string;
}
```

### `whatsapp.getStaffPhoneNumbers`
Get all phone numbers associated with a staff member.

**Input:**
```typescript
{
  staffId: string;
}
```

**Response:**
```typescript
{
  phoneNumbers: string[];
}
```

### `whatsapp.getActivityLog`
Get WhatsApp activity log for a staff member.

**Input:**
```typescript
{
  staffId: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}
```

**Response:**
```typescript
{
  activities: Array<{
    id: string;
    phoneNumber: string;
    query: string;
    response: string;
    timestamp: Date;
  }>;
}
```

### `whatsapp.checkPhonePermission`
Check if a phone number is allowed for WhatsApp integration.

**Input:**
```typescript
{
  phoneNumber: string;
}
```

**Response:**
```typescript
{
  allowed: boolean;
  staffId?: string;
  staffName?: string;
}
```

### `whatsapp.processTestMessage`
Process a test WhatsApp message (for testing UI).

**Input:**
```typescript
{
  message: string;
  phoneNumber: string;
}
```

**Response:**
```typescript
{
  response: string;
  queryType: string;
  data?: any;
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