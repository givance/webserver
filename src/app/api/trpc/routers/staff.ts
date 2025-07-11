import { listDonors } from '@/app/lib/data/donors';
import {
  countEmailExamplesByStaffId,
  createEmailExample,
  createStaff,
  deleteEmailExample,
  deleteStaff,
  getEmailExampleById,
  getEmailExamplesByStaffId,
  getPrimaryStaff,
  getStaffByEmail,
  getStaffById,
  getStaffByIds,
  getStaffWithGmailById,
  listStaff,
  setPrimaryStaff,
  unsetPrimaryStaff,
  updateEmailExample,
  updateStaff,
  updateStaffSignature,
} from '@/app/lib/data/staff';
import { createTRPCError, ERROR_MESSAGES, notFoundError, check, validateNotNullish } from '../trpc';
import {
  emailSchema,
  idSchema,
  nameSchema,
  orderingSchema,
  paginationSchema,
} from '@/app/lib/validation/schemas';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

// Schema definitions
const staffResponseSchema = z.object({
  id: idSchema,
  organizationId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  isRealPerson: z.boolean(),
  isPrimary: z.boolean(),
  signature: z.string().nullable(),
  writingInstructions: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  gmailToken: z
    .object({
      id: idSchema,
      email: z.string(),
    })
    .nullable()
    .optional(),
});

const staffIdsSchema = z.object({
  ids: z.array(idSchema).min(1).max(1000),
});

const listStaffInputSchema = z.object({
  searchTerm: z.string().optional(),
  isRealPerson: z.boolean().optional(),
  ...paginationSchema.shape,
  ...orderingSchema.shape,
  orderBy: z.enum(['firstName', 'lastName', 'email', 'createdAt']).optional(),
});

const listStaffResponseSchema = z.object({
  staff: z.array(staffResponseSchema),
  totalCount: z.number(),
});

const createStaffInputSchema = z.object({
  email: z.string(),
  firstName: nameSchema,
  lastName: nameSchema,
  title: z.string().optional(),
  department: z.string().optional(),
  isRealPerson: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
  writingInstructions: z.string().optional(),
});

const updateStaffInputSchema = z.object({
  id: idSchema,
  email: z.string().optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  isRealPerson: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  writingInstructions: z.string().optional(),
});

// Email example schemas
const emailExampleCategory = z.enum([
  'donor_outreach',
  'thank_you',
  'follow_up',
  'general',
  'fundraising',
  'event_invitation',
  'update',
]);

const emailExampleResponseSchema = z.object({
  id: idSchema,
  staffId: idSchema,
  organizationId: z.string(),
  subject: z.string(),
  content: z.string(),
  category: emailExampleCategory.nullable(),
  metadata: z.any().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const createEmailExampleInputSchema = z.object({
  staffId: idSchema,
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  category: emailExampleCategory.optional(),
  metadata: z.any().optional(),
});

const updateEmailExampleInputSchema = z.object({
  id: idSchema,
  subject: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  category: emailExampleCategory.nullable().optional(),
  metadata: z.any().optional(),
});

const emailExamplesResponseSchema = z.object({
  examples: z.array(emailExampleResponseSchema),
  count: z.number(),
});

export const staffRouter = router({
  /**
   * Get multiple staff members by their IDs
   *
   * @param ids - Array of staff member IDs
   *
   * @returns Array of staff members
   *
   * @throws {TRPCError} NOT_FOUND if any staff member doesn't exist
   */
  getByIds: protectedProcedure
    .input(staffIdsSchema)
    .output(z.array(staffResponseSchema))
    .query(async ({ input, ctx }) => {
      const staffMembers = await getStaffByIds(input.ids, ctx.auth.user.organizationId);

      return staffMembers;
    }),

  /**
   * Get a staff member by email address
   *
   * @param email - Staff member's email address
   *
   * @returns The staff member with matching email
   *
   * @throws {TRPCError} NOT_FOUND if no staff member found with email
   */
  getByEmail: protectedProcedure
    .input(z.object({ email: emailSchema }))
    .output(staffResponseSchema)
    .query(async ({ input, ctx }) => {
      const staff = await getStaffByEmail(input.email, ctx.auth.user.organizationId);

      validateNotNullish(staff, 'NOT_FOUND', `No staff member found with email: ${input.email}`);

      return staff;
    }),

  /**
   * Create a new staff member
   *
   * @param email - Staff member's email (must be unique)
   * @param firstName - First name
   * @param lastName - Last name
   * @param title - Job title
   * @param department - Department name
   * @param isRealPerson - Whether this is a real person
   * @param isPrimary - Whether this is the primary sender
   * @param writingInstructions - AI writing instructions for this staff member
   *
   * @returns The created staff member
   *
   * @throws {TRPCError} CONFLICT if email already exists
   * @throws {TRPCError} UNAUTHORIZED if no organization
   */
  create: protectedProcedure
    .input(createStaffInputSchema)
    .output(staffResponseSchema)
    .mutation(async ({ input, ctx }) => {
      validateNotNullish(
        ctx.auth.user?.organizationId,
        'UNAUTHORIZED',
        ERROR_MESSAGES.UNAUTHORIZED
      );

      try {
        return await createStaff({
          ...input,
          organizationId: ctx.auth.user.organizationId,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          throw createTRPCError({
            code: 'CONFLICT',
            message: `A staff member with email ${input.email} already exists in your organization`,
            logLevel: 'info',
            metadata: { email: input.email },
          });
        }

        throw createTRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ERROR_MESSAGES.OPERATION_FAILED('create staff member'),
          cause: error,
          metadata: { userId: ctx.auth.user.id },
        });
      }
    }),

  /**
   * Update an existing staff member
   *
   * @param id - Staff member ID to update
   * @param Various optional fields to update
   *
   * @returns The updated staff member
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   * @throws {TRPCError} CONFLICT if email already exists
   */
  update: protectedProcedure
    .input(updateStaffInputSchema)
    .output(staffResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      const updated = await updateStaff(id, updateData, ctx.auth.user.organizationId);

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      return updated;
    }),

  /**
   * Delete a staff member
   *
   * @param id - Staff member ID to delete
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   * @throws {TRPCError} CONFLICT if staff member has assigned records
   */
  delete: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      try {
        await deleteStaff(input.id, ctx.auth.user.organizationId);
      } catch (error) {
        if (error instanceof Error && error.message.includes('linked to other records')) {
          throw createTRPCError({
            code: 'CONFLICT',
            message:
              'This staff member cannot be deleted because they have assigned donors or other associated records. Please reassign their responsibilities first.',
            logLevel: 'info',
            metadata: { staffId: input.id },
          });
        }

        throw createTRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ERROR_MESSAGES.OPERATION_FAILED('delete staff member'),
          cause: error,
          metadata: { staffId: input.id },
        });
      }
    }),

  /**
   * List staff members with filtering and pagination
   *
   * @param searchTerm - Search by name or email
   * @param isRealPerson - Filter by real person status
   * @param limit - Maximum number of results
   * @param offset - Number of results to skip
   * @param orderBy - Field to order by
   * @param orderDirection - Sort direction
   *
   * @returns Object containing staff array and total count
   */
  list: protectedProcedure
    .input(listStaffInputSchema)
    .output(listStaffResponseSchema)
    .query(async ({ input, ctx }) => {
      return await listStaff(input, ctx.auth.user.organizationId);
    }),

  /**
   * Get all donors assigned to a staff member
   *
   * @param id - Staff member ID
   *
   * @returns List of assigned donors
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   */
  getAssignedDonors: protectedProcedure
    .input(z.object({ id: idSchema }))
    .query(async ({ input, ctx }) => {
      // First verify staff member exists
      const staff = await getStaffById(input.id, ctx.auth.user.organizationId);

      validateNotNullish(staff, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      // Get all donors assigned to this staff member
      return await listDonors(
        {
          assignedToStaffId: input.id,
          orderBy: 'firstName',
          orderDirection: 'asc',
        },
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Update a staff member's email signature
   *
   * @param id - Staff member ID
   * @param signature - New signature (null to remove)
   *
   * @returns The updated staff member
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   */
  updateSignature: protectedProcedure
    .input(
      z.object({
        id: idSchema,
        signature: z.string().optional(),
      })
    )
    .output(staffResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, signature } = input;

      const updated = await updateStaffSignature(
        id,
        signature || null,
        ctx.auth.user.organizationId
      );

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      return updated;
    }),

  /**
   * Set a staff member as the primary sender
   *
   * @param id - Staff member ID
   *
   * @returns The updated staff member
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   * @throws {TRPCError} CONFLICT if staff member has no Gmail connected
   */
  setPrimary: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(staffResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if staff member exists and has Gmail connected
      const staffWithGmail = await getStaffWithGmailById(input.id, ctx.auth.user.organizationId);

      validateNotNullish(staffWithGmail, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      validateNotNullish(
        staffWithGmail.gmailToken,
        'CONFLICT',
        'This staff member must connect their Gmail account before being set as primary sender.'
      );

      const updated = await setPrimaryStaff(input.id, ctx.auth.user.organizationId);

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      return updated;
    }),

  /**
   * Remove primary status from a staff member
   *
   * @param id - Staff member ID
   *
   * @returns The updated staff member
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   */
  unsetPrimary: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(staffResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const updated = await unsetPrimaryStaff(input.id, ctx.auth.user.organizationId);

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      return updated;
    }),

  /**
   * Get the primary staff member for the organization
   *
   * @returns The primary staff member or null
   */
  getPrimary: protectedProcedure.output(staffResponseSchema.nullable()).query(async ({ ctx }) => {
    const result = await getPrimaryStaff(ctx.auth.user.organizationId);
    return result || null; // Ensure we return null instead of undefined
  }),

  /**
   * Create an email example for a staff member
   *
   * @param staffId - Staff member ID
   * @param subject - Email subject
   * @param content - Email content
   * @param category - Email category
   * @param metadata - Additional metadata
   *
   * @returns The created email example
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   */
  createEmailExample: protectedProcedure
    .input(createEmailExampleInputSchema)
    .output(emailExampleResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify staff member exists
      const staff = await getStaffById(input.staffId, ctx.auth.user.organizationId);

      validateNotNullish(staff, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      const { staffId, subject, content, category, metadata } = input;

      return await createEmailExample({
        staffId,
        organizationId: ctx.auth.user.organizationId,
        subject,
        content,
        category: category || 'general',
        metadata: metadata || null,
      });
    }),

  /**
   * List email examples for a staff member
   *
   * @param id - Staff member ID
   *
   * @returns Object containing examples array and count
   *
   * @throws {TRPCError} NOT_FOUND if staff member doesn't exist
   */
  listEmailExamples: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(emailExamplesResponseSchema)
    .query(async ({ input, ctx }) => {
      // Verify staff member exists
      const staff = await getStaffById(input.id, ctx.auth.user.organizationId);

      validateNotNullish(staff, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Staff member'));

      const [examples, count] = await Promise.all([
        getEmailExamplesByStaffId(input.id, ctx.auth.user.organizationId),
        countEmailExamplesByStaffId(input.id, ctx.auth.user.organizationId),
      ]);

      return { examples, count };
    }),

  /**
   * Get a single email example
   *
   * @param id - Email example ID
   *
   * @returns The email example
   *
   * @throws {TRPCError} NOT_FOUND if example doesn't exist
   */
  getEmailExample: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(emailExampleResponseSchema)
    .query(async ({ input, ctx }) => {
      const example = await getEmailExampleById(input.id, ctx.auth.user.organizationId);

      validateNotNullish(example, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Email example'));

      return example;
    }),

  /**
   * Update an email example
   *
   * @param id - Email example ID
   * @param subject - New subject
   * @param content - New content
   * @param category - New category
   * @param metadata - New metadata
   *
   * @returns The updated email example
   *
   * @throws {TRPCError} NOT_FOUND if example doesn't exist
   */
  updateEmailExample: protectedProcedure
    .input(updateEmailExampleInputSchema)
    .output(emailExampleResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      // Verify example exists
      const existing = await getEmailExampleById(id, ctx.auth.user.organizationId);

      validateNotNullish(existing, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Email example'));

      const updated = await updateEmailExample(id, updateData, ctx.auth.user.organizationId);

      validateNotNullish(updated, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Email example'));

      return updated;
    }),

  /**
   * Delete an email example
   *
   * @param id - Email example ID to delete
   *
   * @throws {TRPCError} NOT_FOUND if example doesn't exist
   */
  deleteEmailExample: protectedProcedure
    .input(z.object({ id: idSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      // Verify example exists
      const existing = await getEmailExampleById(input.id, ctx.auth.user.organizationId);

      validateNotNullish(existing, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND('Email example'));

      await deleteEmailExample(input.id, ctx.auth.user.organizationId);
    }),
});
