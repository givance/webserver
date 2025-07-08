import { z } from 'zod';
import { router, protectedProcedure } from '@/app/api/trpc/trpc';
import type { UpdateTodoInput } from '@/app/lib/services/todo-service';
import { createTRPCError, validateOrganizationAccess, ERROR_MESSAGES, check } from '../trpc';
import { idSchema, todoSchemas, batchResultSchema } from '@/app/lib/validation/schemas';

// Helper to convert Todo dates to ISO strings
const serializeTodo = (todo: any) => ({
  ...todo,
  dueDate: todo.dueDate?.toISOString() || null,
  scheduledDate: todo.scheduledDate?.toISOString() || null,
  completedDate: todo.completedDate?.toISOString() || null,
  createdAt: todo.createdAt.toISOString(),
  updatedAt: todo.updatedAt.toISOString(),
});

// Helper to preprocess date strings into Date objects
const preprocessDate = (arg: unknown) => {
  if (typeof arg === 'string' || arg instanceof Date) return new Date(arg);
  if (arg === null || arg === undefined) return arg;
  return undefined;
};

// Schema definitions
const todoResponseSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  priority: z.string().nullable(),
  status: z.string(),
  dueDate: z.string().nullable(), // Database returns ISO string
  scheduledDate: z.string().nullable(), // Database returns ISO string
  completedDate: z.string().nullable(), // Database returns ISO string
  donorId: idSchema.nullable(),
  staffId: idSchema.nullable(),
  organizationId: z.string(),
  createdAt: z.string(), // Database returns ISO string
  updatedAt: z.string(), // Database returns ISO string
});

const createTodoInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string(),
  type: z.string().min(1),
  priority: z.string().optional(),
  dueDate: z.preprocess(preprocessDate, z.date().optional()),
  scheduledDate: z.preprocess(preprocessDate, z.date().optional()),
  donorId: idSchema.optional(),
  staffId: idSchema.optional(),
});

const updateTodoInputSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z.string().min(1).optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.preprocess(preprocessDate, z.date().optional()),
  scheduledDate: z.preprocess(preprocessDate, z.date().optional()),
  completedDate: z.preprocess(preprocessDate, z.date().optional().nullable()),
  staffId: idSchema.optional(),
});

const bulkUpdateInputSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
  data: updateTodoInputSchema.omit({ id: true }),
});

const listTodosInputSchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  donorId: idSchema.optional(),
  staffId: idSchema.optional(),
});

// Special schema for grouped todos that may include donor info
const todoWithDonorSchema = todoResponseSchema.extend({
  donorName: z.string().nullable(), // Match the TodoWithDonor interface
  donor: z
    .object({
      id: idSchema,
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
    })
    .optional(),
});

const groupedTodosResponseSchema = z.record(z.string(), z.array(todoWithDonorSchema));

export const todoRouter = router({
  /**
   * Create a new todo
   *
   * @param title - Todo title (required)
   * @param description - Detailed description
   * @param type - Todo type/category
   * @param priority - Priority level (low/medium/high)
   * @param dueDate - Due date for the todo
   * @param scheduledDate - Scheduled date for the todo
   * @param donorId - Associated donor ID
   * @param staffId - Assigned staff member ID
   *
   * @returns The created todo
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if creation fails
   */
  create: protectedProcedure
    .input(createTodoInputSchema)
    .output(todoResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx.auth;

      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      const result = await ctx.services.todos.createTodo({
        ...input,
        organizationId: user.organizationId,
      });

      return serializeTodo(result);
    }),

  /**
   * Update an existing todo
   *
   * @param id - Todo ID to update
   * @param data - Fields to update
   *
   * @returns The updated todo
   *
   * @throws {TRPCError} NOT_FOUND if todo doesn't exist
   * @throws {TRPCError} FORBIDDEN if user doesn't have access
   */
  update: protectedProcedure
    .input(updateTodoInputSchema)
    .output(todoResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const result = await ctx.services.todos.updateTodo(id, updateData);

      return serializeTodo(result);
    }),

  /**
   * Bulk update multiple todos
   *
   * @param ids - Array of todo IDs to update
   * @param data - Fields to update for all todos
   *
   * @returns Count of successfully updated todos
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   * @throws {TRPCError} BAD_REQUEST if no IDs provided
   */
  updateMany: protectedProcedure
    .input(bulkUpdateInputSchema)
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { ids, data } = input;
      const { user } = ctx.auth;

      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      const serviceUpdateData: UpdateTodoInput = { ...data };
      const updatePromises = ids.map((id) => ctx.services.todos.updateTodo(id, serviceUpdateData));
      const results = await Promise.all(updatePromises);

      return { count: results.filter((r) => r).length };
    }),

  /**
   * Delete a todo
   *
   * @param id - Todo ID to delete
   *
   * @throws {TRPCError} NOT_FOUND if todo doesn't exist
   * @throws {TRPCError} FORBIDDEN if user doesn't have access
   */
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      await ctx.services.todos.deleteTodo(input.id);
    }),

  /**
   * Get todos for the current organization
   *
   * @param type - Filter by todo type
   * @param status - Filter by status
   * @param donorId - Filter by donor
   * @param staffId - Filter by assigned staff
   *
   * @returns List of todos matching the filters
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   */
  getByOrganization: protectedProcedure
    .input(listTodosInputSchema)
    .output(z.array(todoResponseSchema))
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;

      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      const todos = await ctx.services.todos.getTodosByOrganization(user.organizationId, input);

      return todos.map(serializeTodo);
    }),

  /**
   * Get todos grouped by type
   *
   * @param statusesToExclude - Array of statuses to exclude from results
   *
   * @returns Object with todo types as keys and arrays of todos as values
   *
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   */
  getGroupedByType: protectedProcedure
    .input(
      z.object({
        statusesToExclude: z.array(z.string()).optional(),
      })
    )
    .output(groupedTodosResponseSchema)
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;

      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      const grouped = await ctx.services.todos.getTodosGroupedByType(
        user.organizationId,
        input.statusesToExclude
      );

      // Convert all todos in the grouped result
      const serializedGrouped: Record<string, any[]> = {};
      for (const [key, todos] of Object.entries(grouped)) {
        serializedGrouped[key] = todos.map(serializeTodo);
      }
      return serializedGrouped;
    }),

  /**
   * Get todos for a specific donor
   *
   * @param donorId - Donor ID to fetch todos for
   *
   * @returns List of todos for the donor
   *
   * @throws {TRPCError} NOT_FOUND if donor doesn't exist
   */
  getByDonor: protectedProcedure
    .input(z.object({ donorId: idSchema }))
    .output(z.array(todoResponseSchema))
    .query(async ({ ctx, input }) => {
      const todos = await ctx.services.todos.getTodosByDonor(input.donorId);

      return todos.map(serializeTodo);
    }),

  /**
   * Get todos for a specific staff member
   *
   * @param staffId - Staff ID to fetch todos for
   *
   * @returns List of todos assigned to the staff member
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   */
  getByStaff: protectedProcedure
    .input(z.object({ staffId: idSchema }))
    .output(z.array(todoResponseSchema))
    .query(async ({ ctx, input }) => {
      const todos = await ctx.services.todos.getTodosByStaff(input.staffId);

      return todos.map(serializeTodo);
    }),
});
