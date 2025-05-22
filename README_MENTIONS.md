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
1. Projects are fetched using the `useProjects` hook
2. Active projects are transformed into the format expected by react-mentions
3. When a user types @, the project list is filtered and displayed
4. Selected projects are inserted with markup `@[ProjectName](projectId)`

### Files Modified
- `src/app/(app)/communicate/steps/WriteInstructionStep.tsx`: Main component updated
- `src/app/(app)/communicate/styles.css`: Styling for mentions component

## Usage Example

```
Write a thank you email mentioning our @School Renovation project and ask for continued support for @Community Garden.
```

This allows users to easily reference specific projects in their email instructions, making the communication more contextual and personalized.

## Future Enhancements

- Add @ mentions for donors
- Add @ mentions for staff members
- Add # mentions for tags or categories
- Support for custom templates or snippets 