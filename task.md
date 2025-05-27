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
- [x] Add `jobName` field to `emailGenerationSessions` table
- [x] Create database migration for the new field

### Phase 2: Communication Flow Updates
- [x] Add job name input step to communication flow
- [x] Update CommunicateSteps component to include job name step
- [x] Modify step flow: Select Donors → Job Name → Write Instructions → Bulk Generation
- [x] Update BulkGenerateEmailsStep to save job name to database

### Phase 3: Job Status Management
- [x] Enhance session status tracking with detailed progress information
- [ ] Add retry functionality for failed jobs (partial and full retries)
- [x] Update TRPC endpoints to support job management operations
- [x] Add job status display with running/completed/failed states

### Phase 4: Communication Jobs Page
- [x] Create new `/communication-jobs` page
- [x] Add navigation menu item for Communication Jobs
- [x] Implement job listing with status, progress, and actions
- [x] Add filtering and sorting capabilities
- [x] Implement job delete functionality

### Phase 5: UI/UX Enhancements
- [x] Update existing results page to show job information
- [x] Add job name display throughout the communication flow
- [x] Implement status badges and progress indicators
- [x] Add bulk actions for job management

### Phase 6: Delete Communication Jobs Feature ✅
- [x] Add delete job schema validation
- [x] Implement delete endpoint in tRPC communications router
- [x] Add delete mutation to communications hook
- [x] Implement delete functionality in frontend with confirmation dialog
- [x] Add proper error handling and success messages
- [x] Update UI to show appropriate warnings for delete actions
