# Communication Jobs Implementation Task

## Overview
Implement a communication job concept that allows users to name their communication campaigns, track their status, and manage them through a dedicated interface.

## Research Summary
- ✅ Existing `emailGenerationSessions` table in database schema
- ✅ Current communication flow: Select Donors → Write Instructions → Bulk Generation
- ✅ Existing communications page at `/communications` for threads
- ✅ Navigation structure in MainLayout.tsx with sidebar menu

## Implementation Plan

### Phase 1: Database Schema Updates
- [x] Review existing `emailGenerationSessions` table
- [ ] Add `jobName` field to `emailGenerationSessions` table
- [ ] Create database migration for the new field

### Phase 2: Communication Flow Updates
- [ ] Add job name input step to communication flow
- [ ] Update CommunicateSteps component to include job name step
- [ ] Modify step flow: Select Donors → Job Name → Write Instructions → Bulk Generation
- [ ] Update BulkGenerateEmailsStep to save job name to database

### Phase 3: Job Status Management
- [ ] Enhance session status tracking with detailed progress information
- [ ] Add retry functionality for failed jobs (partial and full retries)
- [ ] Update TRPC endpoints to support job management operations
- [ ] Add job status display with running/completed/failed states

### Phase 4: Communication Jobs Page
- [ ] Create new `/communication-jobs` page
- [ ] Add navigation menu item for Communication Jobs
- [ ] Implement job listing with status, progress, and actions
- [ ] Add filtering and sorting capabilities
- [ ] Implement job retry functionality for failed jobs

### Phase 5: UI/UX Enhancements
- [ ] Update existing results page to show job information
- [ ] Add job name display throughout the communication flow
- [ ] Implement status badges and progress indicators
- [ ] Add bulk actions for job management

## Relevant Files
- `src/app/lib/db/schema.ts` - Database schema with emailGenerationSessions
- `src/app/(app)/communicate/components/CommunicateSteps.tsx` - Main communication flow
- `src/app/(app)/communicate/steps/BulkGenerateEmailsStep.tsx` - Bulk generation step
- `src/app/api/trpc/routers/communications.ts` - TRPC communication endpoints
- `src/components/layout/MainLayout.tsx` - Navigation structure
- `src/app/(app)/communications/page.tsx` - Existing communications page

## Implementation Details

### Job Name Step
- Add new step between "Select Donors" and "Write Instructions"
- Simple form with job name input and validation
- Store job name in component state and pass to bulk generation

### Database Changes
- Add `jobName` varchar(255) NOT NULL field to emailGenerationSessions
- Update createSession TRPC endpoint to accept jobName parameter
- Ensure job name is saved when session is created

### Job Status Tracking
- Enhance existing status polling to show detailed progress
- Add retry mechanisms for failed jobs
- Support partial retries (only failed donors)

### Communication Jobs Page
- List all jobs for the organization
- Show job name, status, progress, created date
- Actions: View Results, Retry (if failed), Delete
- Filtering by status, date range
- Pagination for large job lists

## Next Steps
1. Start with database schema updates
2. Implement job name step in communication flow
3. Update bulk generation to save job name
4. Create communication jobs listing page
5. Add navigation and final UI polish
