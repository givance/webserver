# Database Schema Documentation

This document provides detailed information about the Givance platform's database schema, including all tables, relationships, and multi-tenant architecture patterns.

## Table of Contents
- [Overview](#overview)
- [Multi-Tenant Architecture](#multi-tenant-architecture)
- [Core Tables](#core-tables)
- [AI & Analytics Tables](#ai--analytics-tables)
- [Communication Tables](#communication-tables)
- [Integration Tables](#integration-tables)
- [Relationships](#relationships)
- [Indexes & Performance](#indexes--performance)
- [Migration Guide](#migration-guide)

## Overview

The Givance platform uses PostgreSQL with Drizzle ORM for type-safe database operations. The schema follows a multi-tenant architecture where all data is scoped by organization.

### Key Design Principles
- **Multi-tenancy**: Row-level isolation by organizationId
- **Soft Deletes**: Most entities support soft deletion
- **Audit Fields**: createdAt/updatedAt timestamps on all tables
- **UUID Primary Keys**: For better distribution and security
- **JSON Fields**: For flexible, schema-less data where appropriate

## Multi-Tenant Architecture

All tables (except users) include an `organizationId` field that references the Clerk-managed organization. This ensures complete data isolation between tenants.

```typescript
// Example query pattern
const donors = await db.query.donors.findMany({
  where: eq(donors.organizationId, currentOrgId)
});
```

## Core Tables

### users
Clerk-managed user accounts with additional platform-specific data.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email_signature TEXT,
  personal_memory TEXT,  -- AI context about the user
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### organizations
Multi-tenant organizations with AI configuration.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  donor_journey_graph JSONB,  -- Stage definitions and transitions
  ai_instructions TEXT,       -- Custom AI behavior instructions
  website_url TEXT,
  website_data JSONB,         -- Crawled website content
  website_last_crawled TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**donor_journey_graph structure:**
```json
{
  "stages": [
    {
      "id": "prospect",
      "name": "Prospect",
      "description": "Potential donor identified",
      "transitions": [
        {
          "to": "first_contact",
          "condition": "Initial outreach made"
        }
      ]
    }
  ]
}
```

### donors
Core donor records supporting individuals and couples.

```sql
CREATE TABLE donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  external_id TEXT,  -- ID from external systems
  donor_type TEXT CHECK (donor_type IN ('individual', 'couple')) DEFAULT 'individual',
  
  -- Primary person
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  
  -- Spouse (for couples)
  spouse_first_name TEXT,
  spouse_last_name TEXT,
  spouse_email TEXT,
  
  -- Address
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_country TEXT DEFAULT 'US',
  
  -- Journey & Classification
  journey_stage TEXT,
  ai_classification TEXT,  -- High-value, regular, etc.
  last_contact_date TIMESTAMP,
  
  -- Metadata
  notes TEXT,
  tags TEXT[],  -- Array of tags
  custom_fields JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  
  -- Indexes
  UNIQUE(organization_id, external_id),
  INDEX idx_donors_org_email (organization_id, email),
  INDEX idx_donors_journey (organization_id, journey_stage)
);
```

### projects
Fundraising campaigns and initiatives.

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  target_amount DECIMAL(12,2),
  start_date DATE,
  end_date DATE,
  status TEXT CHECK (status IN ('draft', 'active', 'completed', 'cancelled')) DEFAULT 'draft',
  settings JSONB,  -- Project-specific configuration
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_projects_org_status (organization_id, status)
);
```

### donations
Financial contribution tracking.

```sql
CREATE TABLE donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  project_id UUID REFERENCES projects(id),
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  date DATE NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'credit_card', 'wire', 'crypto', 'other')),
  reference_number TEXT,  -- Check number, transaction ID, etc.
  notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_frequency TEXT,  -- 'monthly', 'quarterly', etc.
  tax_deductible BOOLEAN DEFAULT TRUE,
  receipt_sent BOOLEAN DEFAULT FALSE,
  receipt_sent_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_donations_donor (organization_id, donor_id),
  INDEX idx_donations_project (organization_id, project_id),
  INDEX idx_donations_date (organization_id, date DESC)
);
```

### staff
Organization team members with role-based permissions.

```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  permissions TEXT[],  -- Array of permission strings
  is_active BOOLEAN DEFAULT TRUE,
  
  -- OAuth tokens for email integration
  gmail_refresh_token TEXT,
  gmail_email TEXT,
  microsoft_refresh_token TEXT, 
  microsoft_email TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(organization_id, user_id),
  INDEX idx_staff_org_active (organization_id, is_active)
);
```

## AI & Analytics Tables

### person_research
AI-powered donor research results.

```sql
CREATE TABLE person_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  status TEXT CHECK (status IN ('pending', 'searching', 'analyzing', 'completed', 'failed')) NOT NULL,
  research_type TEXT CHECK (research_type IN ('basic', 'standard', 'comprehensive')) DEFAULT 'standard',
  
  -- Search phase
  search_queries JSONB,  -- Array of search queries used
  search_results JSONB,  -- Raw search results
  
  -- Analysis results
  summary TEXT,
  age INTEGER,
  estimated_income TEXT,
  employer TEXT,
  job_title TEXT,
  interests TEXT[],
  giving_capacity TEXT CHECK (giving_capacity IN ('low', 'medium', 'high', 'major')),
  
  -- Structured data
  data JSONB,  -- Full research data
  sources JSONB,  -- Array of sources with URLs and relevance
  
  -- Metadata
  ai_model TEXT,
  token_usage INTEGER,
  processing_time_ms INTEGER,
  error_message TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_research_donor (organization_id, donor_id),
  INDEX idx_research_status (organization_id, status)
);
```

### email_generation_sessions
Bulk email campaign generation sessions.

```sql
CREATE TABLE email_generation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('configuring', 'generating', 'completed', 'cancelled')) NOT NULL,
  
  -- Configuration
  instructions TEXT,  -- AI instructions for generation
  donor_selection JSONB,  -- Filters and criteria
  selected_donor_ids UUID[],
  
  -- Chat history with AI
  chat_history JSONB,  -- Array of messages
  
  -- Generation stats
  total_emails INTEGER,
  generated_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  -- Trigger.dev job tracking
  job_id TEXT,
  job_started_at TIMESTAMP,
  job_completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_sessions_org_status (organization_id, status)
);
```

### generated_emails
AI-generated personalized emails.

```sql
CREATE TABLE generated_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  session_id UUID NOT NULL REFERENCES email_generation_sessions(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  
  -- Email content
  subject TEXT NOT NULL,
  body_plain TEXT NOT NULL,
  body_html TEXT NOT NULL,
  
  -- Structured content for editing
  structured_content JSONB,  -- Paragraphs, sections, etc.
  
  -- Status tracking
  status TEXT CHECK (status IN ('draft', 'approved', 'scheduled', 'sent', 'failed')) DEFAULT 'draft',
  sent_at TIMESTAMP,
  scheduled_for TIMESTAMP,
  sent_by_staff_id UUID REFERENCES staff(id),
  
  -- Email provider tracking
  provider TEXT,  -- 'gmail', 'microsoft', 'smtp'
  provider_message_id TEXT,
  provider_thread_id TEXT,
  
  -- AI metadata
  ai_model TEXT,
  token_usage INTEGER,
  generation_time_ms INTEGER,
  donor_context_used JSONB,  -- What info was used
  
  -- Tracking
  tracker_id UUID,
  opens INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  last_opened_at TIMESTAMP,
  last_clicked_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_emails_session (organization_id, session_id),
  INDEX idx_emails_donor (organization_id, donor_id),
  INDEX idx_emails_status (organization_id, status),
  INDEX idx_emails_tracker (tracker_id)
);
```

### email_events
Email interaction tracking.

```sql
CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email_id UUID NOT NULL REFERENCES generated_emails(id),
  event_type TEXT CHECK (event_type IN ('open', 'click', 'bounce', 'unsubscribe')) NOT NULL,
  
  -- Event details
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  
  -- Click-specific data
  link_url TEXT,
  link_position INTEGER,
  
  -- Bounce-specific data
  bounce_type TEXT,
  bounce_message TEXT,
  
  -- Geolocation (if available)
  country TEXT,
  region TEXT,
  city TEXT,
  
  INDEX idx_events_email (email_id, event_type),
  INDEX idx_events_timestamp (organization_id, timestamp DESC)
);
```

### donor_lists
Segmented groups of donors for targeting.

```sql
CREATE TABLE donor_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  
  -- List definition
  type TEXT CHECK (type IN ('static', 'dynamic')) DEFAULT 'static',
  filters JSONB,  -- For dynamic lists
  
  -- Stats (cached for performance)
  donor_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_lists_org (organization_id)
);
```

### donor_list_members
Junction table for static donor lists.

```sql
CREATE TABLE donor_list_members (
  list_id UUID NOT NULL REFERENCES donor_lists(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  added_by UUID REFERENCES users(id),
  
  PRIMARY KEY (list_id, donor_id),
  INDEX idx_list_members_donor (donor_id)
);
```

## Communication Tables

### communications
All donor communications across channels.

```sql
CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  donor_id UUID NOT NULL REFERENCES donors(id),
  thread_id UUID,  -- For grouping related communications
  
  -- Communication details
  channel TEXT CHECK (channel IN ('email', 'phone', 'text', 'whatsapp', 'in_person', 'mail')) NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')) NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  
  -- Participants
  staff_id UUID REFERENCES staff(id),
  from_address TEXT,  -- Email, phone number, etc.
  to_address TEXT,
  
  -- Status
  status TEXT CHECK (status IN ('draft', 'scheduled', 'sent', 'delivered', 'failed')) DEFAULT 'sent',
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  
  -- Metadata
  metadata JSONB,  -- Channel-specific data
  attachments JSONB,  -- Array of attachment info
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_comms_donor (organization_id, donor_id),
  INDEX idx_comms_thread (organization_id, thread_id),
  INDEX idx_comms_date (organization_id, created_at DESC)
);
```

### templates
Reusable email/communication templates.

```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  category TEXT,
  channel TEXT DEFAULT 'email',
  
  -- Template content
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT[],  -- Expected variables like {{donor_name}}
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_templates_org_active (organization_id, is_active),
  INDEX idx_templates_category (organization_id, category)
);
```

### todos
Task management with AI predictions.

```sql
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
  
  -- Associations
  donor_id UUID REFERENCES donors(id),
  project_id UUID REFERENCES projects(id),
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  
  -- AI-generated tasks
  is_ai_generated BOOLEAN DEFAULT FALSE,
  ai_reasoning TEXT,
  ai_confidence DECIMAL(3,2),  -- 0.00 to 1.00
  
  -- Completion tracking
  completed_at TIMESTAMP,
  completed_by UUID REFERENCES users(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_todos_org_status (organization_id, status),
  INDEX idx_todos_donor (organization_id, donor_id),
  INDEX idx_todos_assigned (organization_id, assigned_to),
  INDEX idx_todos_due (organization_id, due_date)
);
```

## Integration Tables

### whatsapp_staff
WhatsApp Business API integration for staff.

```sql
CREATE TABLE whatsapp_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  phone_number TEXT NOT NULL,  -- E.164 format
  display_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  permissions TEXT[],  -- Specific WhatsApp query permissions
  
  -- Usage tracking
  last_query_at TIMESTAMP,
  query_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(organization_id, phone_number),
  INDEX idx_whatsapp_phone (phone_number)
);
```

### whatsapp_queries
Query history for WhatsApp AI assistant.

```sql
CREATE TABLE whatsapp_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  staff_id UUID NOT NULL REFERENCES whatsapp_staff(id),
  
  -- Query details
  query_text TEXT NOT NULL,
  query_type TEXT,  -- 'donor_search', 'stats', etc.
  response_text TEXT NOT NULL,
  
  -- Technical details
  sql_generated TEXT,  -- If applicable
  execution_time_ms INTEGER,
  token_usage INTEGER,
  
  -- Metadata
  message_id TEXT,  -- WhatsApp message ID
  is_voice_message BOOLEAN DEFAULT FALSE,
  transcription TEXT,  -- For voice messages
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_whatsapp_queries_staff (organization_id, staff_id),
  INDEX idx_whatsapp_queries_date (organization_id, created_at DESC)
);
```

### webhook_events
Incoming webhook tracking.

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,  -- Nullable for system webhooks
  
  -- Webhook details
  source TEXT NOT NULL,  -- 'whatsapp', 'stripe', etc.
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  
  -- Processing
  status TEXT CHECK (status IN ('pending', 'processed', 'failed')) DEFAULT 'pending',
  processed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Request details
  headers JSONB,
  signature TEXT,
  ip_address INET,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_webhooks_status (status, created_at),
  INDEX idx_webhooks_source (source, event_type)
);
```

## Relationships

### Key Foreign Key Relationships

1. **Organization Scoping**
   - All tables (except users) reference organizations.id
   - Ensures complete data isolation between tenants

2. **Donor Relationships**
   - donations → donors (one-to-many)
   - communications → donors (one-to-many)
   - person_research → donors (one-to-many)
   - generated_emails → donors (one-to-many)

3. **Project Associations**
   - donations → projects (many-to-one, optional)
   - todos → projects (many-to-one, optional)

4. **Staff/User Relationships**
   - staff → users (many-to-one)
   - communications → staff (many-to-one)
   - generated_emails → staff (for sent_by)

5. **Email Campaign Flow**
   - generated_emails → email_generation_sessions
   - email_events → generated_emails
   - email_generation_sessions tracks bulk generation

6. **List Management**
   - donor_list_members creates many-to-many between donor_lists and donors

## Indexes & Performance

### Critical Indexes

1. **Multi-tenant queries**
   - All tables indexed on (organization_id, [primary_filter])
   - Ensures fast tenant-scoped queries

2. **Search & Lookup**
   - donors: (organization_id, email), (organization_id, external_id)
   - communications: (organization_id, donor_id), (organization_id, thread_id)

3. **Time-based queries**
   - donations: (organization_id, date DESC)
   - communications: (organization_id, created_at DESC)

4. **Status filtering**
   - email_generation_sessions: (organization_id, status)
   - generated_emails: (organization_id, status)

### Performance Considerations

1. **JSONB Fields**
   - Use for flexible, schema-less data
   - Create GIN indexes for frequently queried paths
   - Example: `CREATE INDEX idx_research_data ON person_research USING GIN (data);`

2. **Array Fields**
   - Use GIN indexes for contains queries
   - Example: `CREATE INDEX idx_donor_tags ON donors USING GIN (tags);`

3. **Soft Deletes**
   - Add partial indexes excluding deleted records
   - Example: `CREATE INDEX idx_donors_active ON donors (organization_id) WHERE deleted_at IS NULL;`

## Migration Guide

### Creating Migrations

1. **Generate migration after schema changes:**
```bash
npm run db:generate
```

2. **Review generated SQL in drizzle/migrations/**

3. **Apply migration to database:**
```bash
npm run db:migrate
```

### Migration Best Practices

1. **Backwards Compatibility**
   - Add columns as nullable initially
   - Populate data via background job
   - Make non-nullable in subsequent migration

2. **Index Creation**
   - Create indexes CONCURRENTLY in production
   - Monitor query performance before/after

3. **Data Migrations**
   - Use Trigger.dev for large data migrations
   - Implement progress tracking and rollback

### Example Migration

```sql
-- Add giving capacity to donors
ALTER TABLE donors 
ADD COLUMN giving_capacity TEXT;

-- Backfill in application code or background job

-- In next migration, add constraint
ALTER TABLE donors 
ADD CONSTRAINT donors_giving_capacity_check 
CHECK (giving_capacity IN ('low', 'medium', 'high', 'major'));
```

## Data Integrity Rules

1. **Cascading Deletes**
   - Donor deletion cascades to donations, communications
   - Organization deletion restricted if data exists

2. **Consistency Checks**
   - Spouse fields only populated for donor_type='couple'
   - Email tracking events require valid email_id

3. **Validation**
   - Email addresses validated at application layer
   - Phone numbers stored in E.164 format
   - Amounts stored as DECIMAL for precision

## Security Considerations

1. **PII Protection**
   - Encrypt sensitive fields at rest
   - Audit access to donor financial data
   - Implement field-level permissions

2. **Multi-tenancy**
   - Always filter by organization_id
   - Validate organization membership
   - Prevent cross-tenant data leakage

3. **OAuth Tokens**
   - Encrypt refresh tokens
   - Implement token rotation
   - Monitor for suspicious usage