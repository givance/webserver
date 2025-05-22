# Project Mentions Feature

## Overview

The WriteInstructionStep component now supports @ mentions for projects. Users can type `@` in the instruction textarea to see a dropdown list of all active projects in their organization.

## How it works

1. **Type @**: When the user types `@` in the instruction textarea, a compact dropdown appears
2. **Select Project**: The dropdown shows all active projects with their names in a condensed format
3. **Insert Reference**: When a project is selected, it gets inserted as `@ProjectName` with an automatic space after
4. **Use in Instructions**: The mentioned projects can be referenced in email generation instructions

## Technical Implementation

### Dependencies Added
- `react-mentions`: Main package for @ mention functionality
- `@types/react-mentions`: TypeScript types

### Key Components
- **MentionsInput**: Replaces the basic Textarea component
- **Mention**: Configures the @ trigger for projects with auto-spacing
- **CSS styling**: Custom compact styles to match the UI design

### Data Flow
1. **Frontend**: Projects are fetched using the `useProjects` hook
2. **Frontend**: Active projects are transformed into the format expected by react-mentions
3. **Frontend**: When a user types @, the project list is filtered and displayed
4. **Frontend**: Selected projects are inserted with markup `@[ProjectName](projectId)`
5. **Backend**: The instruction with mentions is sent to the server
6. **Backend**: Mentions are parsed and replaced with detailed project information
7. **Backend**: Enhanced instruction is sent to the LLM for email generation

### Files Modified
- `src/app/(app)/communicate/steps/WriteInstructionStep.tsx`: Main component updated
- `src/app/(app)/communicate/styles.css`: Styling for mentions component
- `src/app/lib/utils/email-generator/mention-processor.ts`: New utility for processing mentions
- `src/app/api/trpc/routers/communications.ts`: Backend integration for mention processing

## Usage Example

**Frontend Input:**
```
Write a thank you email mentioning our @School Renovation project and ask for continued support for @Community Garden.
```

**Backend Processing:**
The backend automatically transforms the above to something like:
```
Write a thank you email mentioning our the "School Renovation" project (Renovating the local elementary school) with a goal of $50,000 (tags: education, infrastructure) project and ask for continued support for the "Community Garden" project (Creating a community garden for fresh produce) with a goal of $25,000 (tags: environment, health).
```

This allows users to easily reference specific projects in their email instructions, making the communication more contextual and personalized. The AI receives detailed project information instead of just project names.

## Future Enhancements

- Add @ mentions for donors
- Add @ mentions for staff members
- Add # mentions for tags or categories
- Support for custom templates or snippets 