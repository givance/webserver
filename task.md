# Email Generation Feature Implementation Task List

## Overview
Implement a new feature where users can generate preview emails for a random subset of donors (configurable, starting with 1), iterate on instructions, then generate emails for all selected donors using a trigger job.

## Research Phase ✅
- [x] Understand current WriteInstructionStep.tsx structure
- [x] Understand communication database schema
- [x] Understand trigger jobs structure
- [x] Understand email generation service

## Plan Phase ✅

### 1. Database Schema Changes ✅
- [x] Create email generation sessions table to track bulk email generation
- [x] Create generated emails table to store all generated emails
- [x] Add migration for new tables

### 2. Modify WriteInstructionStep.tsx (Preview Phase) ✅
- [x] Add configuration for preview donor count (default 1, configurable to 5 later)
- [x] Modify donor selection to use random subset for preview
- [x] Update UI to show "Preview Mode" indication
- [x] Store chat history and instruction for later use

### 3. Create New Step: BulkGenerateEmailsStep ✅
- [x] Create new step component for bulk generation
- [x] Implement trigger job invocation
- [x] Show progress indicator during bulk generation
- [x] Handle job completion notification

### 4. Create Trigger Job for Bulk Email Generation ✅
- [x] Create generateBulkEmails trigger job
- [x] Implement email generation for all selected donors
- [x] Store generated emails in database
- [x] Send completion notification

### 5. Create Results Page ✅
- [x] Create page to display all generated emails
- [x] Show chat history and final instruction
- [x] Display all generated emails with donor information
- [x] Connect to real API data (fixed TypeScript issues)
- [x] Add navigation from notification

### 6. Update CommunicateSteps.tsx ✅
- [x] Update step flow to include new bulk generation step
- [x] Handle state management for new workflow

### 7. Add Notification System ✅
- [x] Implement notification when bulk generation completes
- [x] Add click handler to navigate to results page

## Execution Phase ✅

### Current Status
- ✅ Implementation is complete
- ✅ All TypeScript errors resolved
- ✅ Build passes successfully
- ✅ Runtime bugs fixed
- ✅ JSON parsing issues resolved with generateObject
- ✅ Trigger job optimized
- ✅ Ready for production use

## Completed Tasks ✅
- [x] Fix results page to use real API data instead of mock data
- [x] Fix TypeScript errors and build issues
- [x] Fix ESLint errors (unescaped entities)
- [x] Fix runtime bug: getUserMemories called with organizationId instead of userId
- [x] Fix JSON parsing errors in email generation service
- [x] Upgrade to generateObject for reliable JSON responses
- [x] Simplify trigger job to use EmailGenerationService directly

## Bug Fixes & Improvements ✅
- **Fixed getUserMemories Error**: The `getUserMemories` and `getDismissedMemories` functions were being called with `organizationId` instead of `userId`, causing a runtime error when trying to access `result[0].memory` on undefined. Fixed by:
  - Adding null-safe access (`result[0]?.memory`) in the data functions
  - Updating the `EmailGenerationService.generateSmartEmails` method to accept a `userId` parameter
  - Passing the correct `ctx.auth.user.id` instead of `organizationId` to the memory functions

- **Upgraded to generateObject**: Replaced `generateText` with `generateObject` from the AI SDK for more reliable JSON responses:
  - Defined proper Zod schema for email structure validation
  - Eliminated JSON parsing errors by using structured output
  - Removed complex JSON parsing fallback logic (no longer needed)
  - Improved type safety with automatic validation

- **Optimized Trigger Job**: Simplified the bulk email generation trigger job:
  - Removed unnecessary call to `generateSmartDonorEmails` wrapper
  - Direct use of `EmailGenerationService.generateEmails` method
  - Cleaner code with fewer dependencies
  - Better performance by avoiding double processing

## Relevant Files ✅
- `src/app/(app)/communicate/steps/WriteInstructionStep.tsx` - Main preview step ✅
- `src/app/(app)/communicate/components/CommunicateSteps.tsx` - Step orchestration ✅
- `src/app/(app)/communicate/steps/BulkGenerateEmailsStep.tsx` - Bulk generation step ✅
- `src/app/(app)/communicate/results/[sessionId]/page.tsx` - Results page ✅
- `src/trigger/jobs/generateBulkEmails.ts` - Trigger job (optimized) ✅
- `src/app/lib/db/schema.ts` - Database schema ✅
- `src/app/api/trpc/routers/communications.ts` - API routes ✅
- `src/app/lib/data/users.ts` - User data functions (bug fixed) ✅
- `src/app/lib/utils/email-generator/service.ts` - Email generation service (upgraded to generateObject) ✅
- `src/app/lib/utils/json-parser.ts` - Robust JSON parser utility (deprecated, no longer needed) ✅

## Implementation Details ✅
- Preview donor count: Start with 1, make configurable for later change to 5 ✅
- Use existing email generation service for both preview and bulk ✅
- Store chat history and instruction for bulk generation ✅
- Use trigger jobs for background bulk processing ✅
- Implement proper error handling and progress tracking ✅
- Use generateObject with Zod schema for reliable structured output ✅
- Direct EmailGenerationService usage in trigger job ✅

## Feature Summary
The email generation feature is now fully implemented and optimized with the following workflow:

1. **Step 1: Select Donors** - Users select multiple donors for email generation
2. **Step 2: Write Instructions (Preview Mode)** - Users iterate on instructions with AI using only 1 random donor for preview
3. **Step 3: Bulk Generation** - Users trigger bulk generation for all selected donors using a background job
4. **Results Page** - Users can view all generated emails, chat history, and session details

The feature includes:
- ✅ Random donor selection for preview (configurable from 1 to 5)
- ✅ Real-time chat interface for instruction refinement
- ✅ Background job processing for bulk generation
- ✅ Progress tracking and status updates
- ✅ Comprehensive results page with all generated emails
- ✅ Proper error handling and user feedback
- ✅ Database persistence of sessions and generated emails
- ✅ Reliable structured JSON output with generateObject
- ✅ Optimized performance with direct service usage
- ✅ Production-ready with all bugs fixed and improvements implemented 