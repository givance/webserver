# TRPC Error Handling Guide

## Overview

This application uses a global TRPC error handler that automatically displays user-friendly error messages as toast notifications. This guide explains how to properly handle errors to avoid duplicate messages.

## The Global Error Handler

Located at `src/app/lib/trpc/error-link.ts`, the global error handler:

1. Intercepts all TRPC errors
2. Extracts human-readable messages
3. Shows appropriate toast notifications based on error codes
4. Handles Zod validation errors

## Best Practices

### ✅ DO: Use Mutations Directly

```typescript
// Good - Let global handler show errors
const createMutation = trpc.staff.create.useMutation({
  onSuccess: () => {
    toast.success("Staff created successfully");
    router.push("/staff");
  },
  // No onError needed - global handler will show error toast
});

const handleSubmit = async (data) => {
  try {
    await createMutation.mutateAsync(data);
  } catch (error) {
    // Don't show error toast here - global handler already did
    console.error("Operation failed:", error);
  }
};
```

### ❌ DON'T: Show Error Toasts Manually

```typescript
// Bad - This causes duplicate error messages
const handleSubmit = async (data) => {
  try {
    const result = await createStaff(data);
    if (!result) {
      toast.error("Failed to create staff"); // Duplicate!
    }
  } catch (error) {
    toast.error(error.message); // Duplicate!
  }
};
```

### ❌ DON'T: Use Wrapper Functions That Swallow Errors

```typescript
// Bad - Hook wrapper that returns null on error
const createStaff = async (input) => {
  try {
    return await mutation.mutateAsync(input);
  } catch (error) {
    return null; // This prevents proper error propagation
  }
};
```

## Avoiding "No Result Returned from Server" Errors

This error typically occurs when:
1. A hook wrapper function catches errors and returns `null`
2. The calling code checks if result is `null` and shows a generic error
3. This creates duplicate error messages since the global handler already showed the real error

### ❌ BAD Pattern (causes duplicate errors):

```typescript
// In hook - catches error and returns null
const createStaff = async (input) => {
  try {
    return await mutation.mutateAsync(input);
  } catch (error) {
    return null; // BAD - swallows the real error
  }
};

// In component - shows generic error for null
const result = await createStaff(data);
if (!result) {
  toast.error("Failed to create - no result returned from server"); // Duplicate!
}
```

### ✅ GOOD Pattern (single error message):

```typescript
// Use mutation directly in component
const createMutation = trpc.staff.create.useMutation({
  onSuccess: () => {
    toast.success("Created successfully");
    router.push("/staff");
  },
});

// Let errors propagate to global handler
try {
  await createMutation.mutateAsync(data);
} catch (error) {
  // Global handler shows the real error message
  console.error("Creation failed:", error);
}
```

## Common Patterns

### Simple Mutation Usage

```typescript
const MyComponent = () => {
  const updateMutation = trpc.projects.update.useMutation();

  const handleUpdate = async (id: number, data: any) => {
    try {
      await updateMutation.mutateAsync({ id, ...data });
      // Success handled
    } catch {
      // Error already shown by global handler
    }
  };
};
```

### Custom Error Handling

If you need custom error handling in addition to the global handler:

```typescript
const deleteMutation = trpc.donors.delete.useMutation({
  onError: (error, variables) => {
    // Global handler still shows the toast
    // Add custom logic here
    if (variables.deleteMode === 'entirely') {
      analytics.track('permanent_deletion_failed');
    }
  },
});
```

### Form Submissions

```typescript
const onSubmit = async (values: FormValues) => {
  try {
    await createMutation.mutateAsync(values);
    // Navigation/success handling
  } catch {
    // Form will stay on screen, error toast already shown
    // User can fix the error and try again
  }
};
```

## Error Messages in Routers

Always throw TRPCError with user-friendly messages:

```typescript
// Good - Clear, actionable message
throw new TRPCError({
  code: "CONFLICT",
  message: `A project with the name "${input.name}" already exists. Please choose a different name.`,
});

// Bad - Technical jargon
throw new TRPCError({
  code: "CONFLICT", 
  message: "Unique constraint violation on projects_name_org_id_idx",
});
```

## Testing Error Handling

Use the test page at `/test-errors` to verify error handling works correctly:

1. Each error should show only one toast
2. Error messages should be human-readable
3. Different error types show appropriate messages

## Migration Guide

To update existing code:

1. Remove manual `toast.error()` calls in catch blocks
2. Remove wrapper functions that return null on error
3. Use mutations directly with try/catch if needed
4. Let errors propagate to the global handler

## Summary

- Global error handler shows all TRPC errors as toasts automatically
- Don't manually show error toasts in your components
- Use clear, user-friendly error messages in your routers
- Test your error scenarios to ensure single toast display