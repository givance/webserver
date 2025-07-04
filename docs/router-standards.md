# tRPC Router Standards

This document defines the standards and best practices for implementing tRPC routers in the Givance platform.

## Table of Contents
1. [Router Structure](#router-structure)
2. [Schema Definitions](#schema-definitions)
3. [Error Handling](#error-handling)
4. [Documentation](#documentation)
5. [Examples](#examples)

## Router Structure

Every tRPC router should follow this standard structure:

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { 
  createTRPCError, 
  handleAsync, 
  validateOrganizationAccess,
  ERROR_MESSAGES 
} from "@/lib/utils/trpc-errors";
import { 
  idSchema, 
  paginationSchema, 
  paginatedResponseSchema 
} from "@/lib/validation/schemas";

// 1. Import schemas (predefined in validation/schemas.ts or define here)
import { resourceSchemas } from "@/lib/validation/schemas";

// 2. Define router-specific schemas at the top
const listResourceSchema = z.object({
  searchTerm: z.string().optional(),
  ...paginationSchema.shape,
});

const resourceResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  // ... other fields
});

// 3. Create the router with properly typed procedures
export const resourceRouter = router({
  /**
   * List resources with pagination
   * 
   * @returns Paginated list of resources
   * @throws {TRPCError} FORBIDDEN if user doesn't have access to organization
   */
  list: protectedProcedure
    .input(listResourceSchema)
    .output(paginatedResponseSchema(resourceResponseSchema))
    .query(async ({ ctx, input }) => {
      // Use handleAsync for automatic error handling
      const result = await handleAsync(
        async () => resourceService.list(ctx.auth.user.organizationId, input),
        {
          errorMessage: ERROR_MESSAGES.OPERATION_FAILED("list resources"),
          logMetadata: { userId: ctx.auth.user.id, input }
        }
      );

      return result;
    }),

  /**
   * Get a single resource by ID
   * 
   * @returns The requested resource
   * @throws {TRPCError} NOT_FOUND if resource doesn't exist
   * @throws {TRPCError} FORBIDDEN if user doesn't have access
   */
  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(resourceResponseSchema)
    .query(async ({ ctx, input }) => {
      const resource = await handleAsync(
        async () => resourceService.get(input.id),
        {
          errorMessage: ERROR_MESSAGES.NOT_FOUND("Resource"),
          errorCode: "NOT_FOUND"
        }
      );

      // Validate organization access
      validateOrganizationAccess(
        resource.organizationId, 
        ctx.auth.user.organizationId,
        "Resource"
      );

      return resource;
    }),
});
```

## Schema Definitions

### 1. Use Predefined Schemas

Always use schemas from `src/app/lib/validation/schemas.ts` when available:

```typescript
import { 
  idSchema,
  emailSchema,
  nameSchema,
  paginationSchema,
  dateRangeSchema 
} from "@/lib/validation/schemas";
```

### 2. Define Router-Specific Schemas at the Top

```typescript
// Define all schemas at the top of the file
const createResourceSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  projectId: idSchema,
});

const updateResourceSchema = createResourceSchema.partial();

const resourceResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  createdAt: z.date(),
  // Always define output schemas explicitly
});
```

### 3. Use Output Validation

Always define output schemas for type safety:

```typescript
.output(resourceResponseSchema) // Single resource
.output(paginatedResponseSchema(resourceResponseSchema)) // List
.output(z.boolean()) // Boolean operations
.output(z.void()) // Mutations with no return
```

## Error Handling

### 1. Use Shared Error Utilities

```typescript
import { 
  createTRPCError,
  handleAsync,
  notFoundError,
  conflictError,
  validateOrganizationAccess,
  ERROR_MESSAGES
} from "@/lib/utils/trpc-errors";
```

### 2. Standard Error Patterns

```typescript
// Wrap async operations
const result = await handleAsync(
  async () => service.operation(),
  {
    errorMessage: ERROR_MESSAGES.OPERATION_FAILED("create resource"),
    errorCode: "INTERNAL_SERVER_ERROR",
    logMetadata: { userId: ctx.auth.user.id }
  }
);

// Validate organization access
validateOrganizationAccess(
  resource.organizationId,
  ctx.auth.user.organizationId,
  "Resource"
);

// Throw specific errors
if (!resource) {
  throw notFoundError("Resource");
}

if (isDuplicate) {
  throw conflictError("Resource");
}
```

### 3. User-Friendly Error Messages

Always provide clear, actionable error messages:

```typescript
throw createTRPCError({
  code: "BAD_REQUEST",
  message: "Cannot delete resource with active dependencies. Please remove all dependencies first.",
  logLevel: "info"
});
```

## Documentation

### 1. Procedure Documentation

Every procedure must have JSDoc comments:

```typescript
/**
 * Create a new resource
 * 
 * @param name - The resource name (required)
 * @param description - Optional description
 * @param projectId - Associated project ID
 * 
 * @returns The created resource with generated ID
 * 
 * @throws {TRPCError} CONFLICT if resource name already exists
 * @throws {TRPCError} NOT_FOUND if project doesn't exist
 * @throws {TRPCError} FORBIDDEN if user doesn't have access
 * 
 * @example
 * const resource = await trpc.resource.create({
 *   name: "New Resource",
 *   projectId: 123
 * });
 */
create: protectedProcedure
  .input(createResourceSchema)
  .output(resourceResponseSchema)
  .mutation(async ({ ctx, input }) => {
    // Implementation
  })
```

### 2. Schema Documentation

Document complex schemas:

```typescript
/**
 * Resource creation input schema
 * 
 * @property name - Unique resource name (1-255 chars)
 * @property description - Optional description
 * @property tags - Array of tag strings for categorization
 */
const createResourceSchema = z.object({
  name: nameSchema.describe("Unique resource name"),
  description: descriptionSchema.optional().describe("Resource description"),
  tags: z.array(z.string()).optional().describe("Tags for categorization")
});
```

## Examples

### Simple CRUD Router

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TemplateService } from "@/lib/services/templates";
import { 
  createTRPCError,
  handleAsync,
  validateOrganizationAccess,
  notFoundError,
  ERROR_MESSAGES
} from "@/lib/utils/trpc-errors";
import { 
  idSchema,
  nameSchema,
  descriptionSchema,
  paginationSchema,
  paginatedResponseSchema
} from "@/lib/validation/schemas";

// Schema definitions
const createTemplateSchema = z.object({
  name: nameSchema,
  content: z.string().min(1),
  description: descriptionSchema.optional(),
  tags: z.array(z.string()).optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const templateResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  content: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const listTemplatesSchema = z.object({
  searchTerm: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ...paginationSchema.shape,
});

// Service instance
const templateService = new TemplateService();

export const templateRouter = router({
  /**
   * List templates with filtering and pagination
   */
  list: protectedProcedure
    .input(listTemplatesSchema)
    .output(paginatedResponseSchema(templateResponseSchema))
    .query(async ({ ctx, input }) => {
      return await handleAsync(
        async () => templateService.list(ctx.auth.user.organizationId, input),
        { errorMessage: ERROR_MESSAGES.OPERATION_FAILED("list templates") }
      );
    }),

  /**
   * Get a single template by ID
   */
  get: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(templateResponseSchema)
    .query(async ({ ctx, input }) => {
      const template = await handleAsync(
        async () => templateService.get(input.id),
        { errorMessage: ERROR_MESSAGES.NOT_FOUND("Template") }
      );

      if (!template) {
        throw notFoundError("Template");
      }

      validateOrganizationAccess(
        template.organizationId,
        ctx.auth.user.organizationId,
        "Template"
      );

      return template;
    }),

  /**
   * Create a new template
   */
  create: protectedProcedure
    .input(createTemplateSchema)
    .output(templateResponseSchema)
    .mutation(async ({ ctx, input }) => {
      return await handleAsync(
        async () => templateService.create({
          ...input,
          organizationId: ctx.auth.user.organizationId,
          createdById: ctx.auth.user.id,
        }),
        { errorMessage: ERROR_MESSAGES.OPERATION_FAILED("create template") }
      );
    }),

  /**
   * Update an existing template
   */
  update: protectedProcedure
    .input(z.object({
      id: idSchema,
      data: updateTemplateSchema,
    }))
    .output(templateResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify access first
      const existing = await handleAsync(
        async () => templateService.get(input.id),
        { errorMessage: ERROR_MESSAGES.NOT_FOUND("Template") }
      );

      if (!existing) {
        throw notFoundError("Template");
      }

      validateOrganizationAccess(
        existing.organizationId,
        ctx.auth.user.organizationId,
        "Template"
      );

      // Perform update
      return await handleAsync(
        async () => templateService.update(input.id, input.data),
        { errorMessage: ERROR_MESSAGES.OPERATION_FAILED("update template") }
      );
    }),

  /**
   * Delete a template
   */
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      // Verify access first
      const existing = await handleAsync(
        async () => templateService.get(input.id),
        { errorMessage: ERROR_MESSAGES.NOT_FOUND("Template") }
      );

      if (!existing) {
        throw notFoundError("Template");
      }

      validateOrganizationAccess(
        existing.organizationId,
        ctx.auth.user.organizationId,
        "Template"
      );

      // Perform deletion
      await handleAsync(
        async () => templateService.delete(input.id),
        { errorMessage: ERROR_MESSAGES.OPERATION_FAILED("delete template") }
      );
    }),
});
```

### Complex Router with Business Logic

For routers with complex business logic, delegate to service classes:

```typescript
export const emailCampaignRouter = router({
  /**
   * Generate AI-powered email campaign
   */
  generateCampaign: protectedProcedure
    .input(generateCampaignSchema)
    .output(campaignResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // All business logic in service
      const campaignService = new EmailCampaignService();
      
      return await handleAsync(
        async () => campaignService.generateCampaign({
          ...input,
          organizationId: ctx.auth.user.organizationId,
          userId: ctx.auth.user.id,
        }),
        {
          errorMessage: "Failed to generate email campaign. Please try again.",
          logMetadata: { 
            userId: ctx.auth.user.id,
            donorCount: input.donorIds.length 
          }
        }
      );
    }),
});
```

## Migration Guide

To migrate existing routers to the new standards:

1. **Extract inline schemas** to the top of the file or `validation/schemas.ts`
2. **Add output validation** to all procedures
3. **Replace custom error handling** with shared utilities
4. **Add comprehensive JSDoc** comments
5. **Remove any `any` types** and ensure full type safety
6. **Extract complex logic** to service classes
7. **Add organization validation** where needed

## Checklist

Before committing a router, ensure:

- [ ] All schemas are predefined, not inline
- [ ] Every procedure has `.output()` validation
- [ ] All procedures have JSDoc comments
- [ ] Error handling uses shared utilities
- [ ] No `any` types are used
- [ ] Organization access is validated
- [ ] Complex logic is in service classes
- [ ] User-friendly error messages are provided