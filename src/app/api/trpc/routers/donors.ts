import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  getDonorByEmail,
  getDonorsByIds,
  createDonor,
  updateDonor,
  deleteDonor,
  bulkDeleteDonors,
  listDonors,
  listDonorsForCommunication,
} from '@/app/lib/data/donors';
import { countListsForDonor } from '@/app/lib/data/donor-lists';
import { getStaffByIds } from '@/app/lib/data/staff';
import { type DonorNote } from '@/app/lib/db/schema';
import { createTRPCError, notFoundError, conflictError, ERROR_MESSAGES } from '../trpc';
import {
  idSchema,
  emailSchema,
  nameSchema,
  phoneSchema,
  addressSchema,
  paginationSchema,
  orderingSchema,
} from '@/app/lib/validation/schemas';
import { db } from '@/app/lib/db';
import { staff, staffGmailTokens, donors } from '@/app/lib/db/schema';
import { and, inArray, eq, sql } from 'drizzle-orm';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Donor note structure for type-safe note handling
 */
const donorNoteSchema = z.object({
  createdAt: z.string(),
  createdBy: z.string(),
  content: z.string(),
});

/**
 * Base donor schema for consistent type validation across operations
 */
const baseDonorSchema = z.object({
  id: idSchema,
  organizationId: z.string(),
  externalId: z.string().nullable(),
  firstName: nameSchema,
  lastName: nameSchema,
  // Couple structure fields
  hisTitle: z.string().nullable(),
  hisFirstName: z.string().nullable(),
  hisInitial: z.string().nullable(),
  hisLastName: z.string().nullable(),
  herTitle: z.string().nullable(),
  herFirstName: z.string().nullable(),
  herInitial: z.string().nullable(),
  herLastName: z.string().nullable(),
  displayName: z.string().nullable(),
  isCouple: z.boolean().nullable(),
  email: emailSchema,
  phone: phoneSchema.nullable(),
  address: addressSchema.nullable(),
  state: z.string().nullable(),
  gender: z.enum(['male', 'female']).nullable(),
  notes: z.union([z.string().nullable(), z.array(donorNoteSchema)]).nullable(),
  assignedToStaffId: idSchema.nullable(),
  currentStageName: z.string().nullable(),
  classificationReasoning: z.string().nullable(),
  predictedActions: z.array(z.string()).optional().nullable(),
  highPotentialDonor: z.boolean().nullable(),
  highPotentialDonorRationale: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  stageName: z.string().optional(),
  stageExplanation: z.string().optional(),
  possibleActions: z.array(z.string()).optional(),
});

/**
 * Serialized donor schema for API responses
 */
const donorResponseSchema = baseDonorSchema.extend({
  createdAt: z.string(), // ISO string
  updatedAt: z.string(), // ISO string
});

/**
 * Lightweight donor schema for communication features
 */
const communicationDonorSchema = z.object({
  id: idSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.nullable(),
  displayName: z.string().nullable(),
  hisTitle: z.string().nullable(),
  hisFirstName: z.string().nullable(),
  hisInitial: z.string().nullable(),
  hisLastName: z.string().nullable(),
  herTitle: z.string().nullable(),
  herFirstName: z.string().nullable(),
  herInitial: z.string().nullable(),
  herLastName: z.string().nullable(),
  isCouple: z.boolean().nullable(),
});

// Input schemas
const donorIdSchema = z.object({
  id: idSchema,
});

const donorIdsSchema = z.object({
  ids: z.array(idSchema).min(1).max(1000),
});

const deleteDonorSchema = z
  .object({
    id: idSchema,
    deleteMode: z.enum(['fromList', 'fromAllLists', 'entirely']).optional(),
    listId: idSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.deleteMode === 'fromList' && !data.listId) {
        return false;
      }
      return true;
    },
    {
      message: 'List ID is required when deleting from a specific list',
      path: ['listId'],
    }
  );

const createDonorSchema = z.object({
  externalId: z.string().optional(),
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
  address: addressSchema.optional(),
  state: z.string().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
});

const updateDonorSchema = z.object({
  id: idSchema,
  externalId: z.string().optional(),
  email: emailSchema.optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.optional(),
  address: addressSchema.optional(),
  state: z.string().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  // Couple fields
  hisTitle: z.string().nullable().optional(),
  hisFirstName: z.string().nullable().optional(),
  hisInitial: z.string().nullable().optional(),
  hisLastName: z.string().nullable().optional(),
  herTitle: z.string().nullable().optional(),
  herFirstName: z.string().nullable().optional(),
  herInitial: z.string().nullable().optional(),
  herLastName: z.string().nullable().optional(),
  // Additional fields
  displayName: z.string().nullable().optional(),
  isCouple: z.boolean().nullable().optional(),
  assignedToStaffId: idSchema.nullable().optional(),
  currentStageName: z.string().nullable().optional(),
  highPotentialDonor: z.boolean().nullable().optional(),
});

const listDonorsSchema = z.object({
  searchTerm: z.string().optional(),
  state: z.string().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  assignedToStaffId: idSchema.nullable().optional(),
  listId: idSchema.optional(),
  notInAnyList: z.boolean().optional(),
  onlyResearched: z.boolean().optional(),
  ...paginationSchema.shape,
  orderBy: z.enum(['firstName', 'lastName', 'email', 'createdAt', 'totalDonated']).optional(),
  orderDirection: orderingSchema.shape.orderDirection,
});

const listDonorsForCommunicationSchema = z.object({
  searchTerm: z.string().optional(),
  ...paginationSchema.shape,
  orderBy: z.enum(['firstName', 'lastName', 'email', 'createdAt']).optional(),
  orderDirection: orderingSchema.shape.orderDirection,
});

const updateAssignedStaffSchema = z.object({
  donorId: idSchema,
  staffId: idSchema.nullable(),
});

const bulkUpdateAssignedStaffSchema = z.object({
  donorIds: z.array(idSchema).min(1).max(1000),
  staffId: idSchema.nullable(),
});

const validateDonorStaffEmailSchema = z.object({
  donorIds: z.array(idSchema).min(0).max(1000),
});

const addDonorNoteSchema = z.object({
  donorId: idSchema,
  content: z.string().min(1, 'Note content is required').max(5000),
});

// Output schemas
const listDonorsOutputSchema = z.object({
  donors: z.array(donorResponseSchema),
  totalCount: z.number().int().min(0),
});

const listDonorsForCommunicationOutputSchema = z.object({
  donors: z.array(communicationDonorSchema),
  totalCount: z.number().int().min(0),
});

const bulkDeleteResponseSchema = z.object({
  success: z.number().int().min(0),
  failed: z.number().int().min(0),
  errors: z.array(z.string()),
});

const countListsResponseSchema = z.object({
  count: z.number().int().min(0),
});

const bulkUpdateStaffResponseSchema = z.object({
  updated: z.number().int().min(0),
});

const validateStaffEmailResponseSchema = z.object({
  isValid: z.boolean(),
  donorsWithoutStaff: z.array(
    z.object({
      donorId: idSchema,
      donorFirstName: z.string(),
      donorLastName: z.string(),
      donorEmail: z.string(),
    })
  ),
  donorsWithStaffButNoEmail: z.array(
    z.object({
      donorId: idSchema,
      donorFirstName: z.string(),
      donorLastName: z.string(),
      donorEmail: z.string(),
      staffFirstName: z.string(),
      staffLastName: z.string(),
      staffEmail: z.string(),
    })
  ),
  errorMessage: z.string().optional(),
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Serialize donor dates to ISO strings
 */
const serializeDonor = (donor: any): z.infer<typeof donorResponseSchema> => ({
  ...donor,
  createdAt: donor.createdAt instanceof Date ? donor.createdAt.toISOString() : donor.createdAt,
  updatedAt: donor.updatedAt instanceof Date ? donor.updatedAt.toISOString() : donor.updatedAt,
});

// ============================================================================
// Router Definition
// ============================================================================

export const donorsRouter = router({
  /**
   * Get a donor by email address
   *
   * @param email - Donor email
   *
   * @returns The donor data
   *
   * @throws {TRPCError} NOT_FOUND if donor doesn't exist
   */
  getByEmail: protectedProcedure
    .input(z.object({ email: emailSchema }))
    .output(donorResponseSchema)
    .query(async ({ input, ctx }) => {
      const donor = await getDonorByEmail(input.email, ctx.auth.user.organizationId);

      if (!donor) {
        throw notFoundError('Donor');
      }

      return serializeDonor(donor);
    }),

  /**
   * Get multiple donors by IDs
   *
   * @param ids - Array of donor IDs
   *
   * @returns Array of donor data
   */
  getByIds: protectedProcedure
    .input(donorIdsSchema)
    .output(z.array(donorResponseSchema))
    .query(async ({ input, ctx }) => {
      const donors = await getDonorsByIds(input.ids, ctx.auth.user.organizationId);

      return donors.map(serializeDonor);
    }),

  /**
   * Create a new donor
   *
   * @param email - Donor email (required)
   * @param firstName - First name (required)
   * @param lastName - Last name (required)
   * @param Additional optional fields...
   *
   * @returns The created donor
   *
   * @throws {TRPCError} CONFLICT if email already exists
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if creation fails
   */
  create: protectedProcedure
    .input(createDonorSchema)
    .output(donorResponseSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const donor = await createDonor({
          ...input,
          organizationId: ctx.auth.user.organizationId,
        } as any); // TODO: Fix type mismatch between input schema and createDonor
        return serializeDonor(donor);
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          throw conflictError(error.message);
        }
        throw createTRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ERROR_MESSAGES.OPERATION_FAILED('create donor'),
          cause: error,
          metadata: { email: input.email },
        });
      }
    }),

  /**
   * Update an existing donor
   *
   * @param id - Donor ID to update
   * @param Additional fields to update...
   *
   * @returns The updated donor
   *
   * @throws {TRPCError} NOT_FOUND if donor doesn't exist
   */
  update: protectedProcedure
    .input(updateDonorSchema)
    .output(donorResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      const updated = await updateDonor(id, updateData as any, ctx.auth.user.organizationId); // TODO: Fix type mismatch

      if (!updated) {
        throw notFoundError('Donor');
      }

      return serializeDonor(updated);
    }),

  /**
   * Delete a donor
   *
   * @param id - Donor ID to delete
   * @param deleteMode - Deletion mode: 'fromList', 'fromAllLists', or 'entirely'
   * @param listId - List ID (required when deleteMode is 'fromList')
   *
   * @throws {TRPCError} NOT_FOUND if donor doesn't exist
   * @throws {TRPCError} BAD_REQUEST if invalid parameters
   * @throws {TRPCError} PRECONDITION_FAILED if donor has linked records
   */
  delete: protectedProcedure
    .input(deleteDonorSchema)
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      try {
        const options =
          input.deleteMode || input.listId
            ? {
                deleteMode: input.deleteMode || 'entirely',
                listId: input.listId,
              }
            : undefined;

        await deleteDonor(input.id, ctx.auth.user.organizationId, options);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('List ID is required')) {
            throw createTRPCError({
              code: 'BAD_REQUEST',
              message: error.message,
              logLevel: 'info',
            });
          }
          if (error.message.includes('not a member of the specified list')) {
            throw notFoundError(error.message);
          }
          if (error.message.includes('linked to other records')) {
            throw createTRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Cannot delete donor as they are linked to other records',
              logLevel: 'info',
            });
          }
        }
        throw error;
      }
    }),

  /**
   * Bulk delete multiple donors
   *
   * @param ids - Array of donor IDs to delete
   *
   * @returns Summary of successful/failed deletions
   *
   * @throws {TRPCError} BAD_REQUEST if no IDs provided
   */
  bulkDelete: protectedProcedure
    .input(donorIdsSchema)
    .output(bulkDeleteResponseSchema)
    .mutation(async ({ input, ctx }) => {
      return await bulkDeleteDonors(input.ids, ctx.auth.user.organizationId);
    }),

  /**
   * Get all donor IDs matching filters
   *
   * @param Various filter parameters...
   *
   * @returns Array of donor IDs
   */
  getAllIds: protectedProcedure
    .input(listDonorsSchema.partial())
    .output(z.array(idSchema))
    .query(async ({ input, ctx }) => {
      const result = await listDonors(input, ctx.auth.user.organizationId);

      return result.donors.map((donor) => donor.id);
    }),

  /**
   * Count lists a donor belongs to
   *
   * @param id - Donor ID
   *
   * @returns Count of lists
   *
   * @throws {TRPCError} NOT_FOUND if donor doesn't exist
   */
  countLists: protectedProcedure
    .input(donorIdSchema)
    .output(countListsResponseSchema)
    .query(async ({ input, ctx }) => {
      // Verify donor exists
      const donorResults = await getDonorsByIds([input.id], ctx.auth.user.organizationId);
      if (donorResults.length === 0) {
        throw notFoundError('Donor');
      }

      const count = await countListsForDonor(input.id, ctx.auth.user.organizationId);

      return { count };
    }),

  /**
   * Update assigned staff for a donor
   *
   * @param donorId - Donor ID
   * @param staffId - Staff ID (null to unassign)
   *
   * @returns Updated donor
   *
   * @throws {TRPCError} NOT_FOUND if donor or staff doesn't exist
   */
  updateAssignedStaff: protectedProcedure
    .input(updateAssignedStaffSchema)
    .output(donorResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { donorId, staffId } = input;
      const { organizationId } = ctx.auth.user;

      // Verify donor
      const donorResults = await getDonorsByIds([donorId], organizationId);
      if (donorResults.length === 0) {
        throw notFoundError('Donor');
      }
      const donor = donorResults[0];

      // Verify staff if provided
      if (staffId !== null) {
        const staffResults = await getStaffByIds([staffId], organizationId);
        if (staffResults.length === 0) {
          throw notFoundError('Staff member');
        }
      }

      const updatedDonor = await updateDonor(
        donorId,
        { assignedToStaffId: staffId },
        organizationId
      );

      if (!updatedDonor) {
        throw createTRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: "Failed to update donor's assigned staff",
        });
      }

      return serializeDonor(updatedDonor);
    }),

  /**
   * Bulk update assigned staff for multiple donors
   *
   * @param donorIds - Array of donor IDs
   * @param staffId - Staff ID (null to unassign)
   *
   * @returns Count of updated donors
   *
   * @throws {TRPCError} NOT_FOUND if staff doesn't exist
   */
  bulkUpdateAssignedStaff: protectedProcedure
    .input(bulkUpdateAssignedStaffSchema)
    .output(bulkUpdateStaffResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { donorIds, staffId } = input;
      const { organizationId } = ctx.auth.user;

      if (donorIds.length === 0) {
        return { updated: 0 };
      }

      // Verify staff if provided
      if (staffId !== null) {
        const staffResults = await getStaffByIds([staffId], organizationId);
        if (staffResults.length === 0) {
          throw notFoundError('Staff member');
        }
      }

      // Verify donors belong to organization
      const validDonors = await getDonorsByIds(donorIds, organizationId);
      const validDonorIds = validDonors.map((d) => d.id);

      if (validDonorIds.length === 0) {
        throw notFoundError('No valid donors found in your organization');
      }

      // Bulk update
      await ctx.services.donors.bulkUpdateAssignedStaff(validDonorIds, staffId, organizationId);

      return { updated: validDonorIds.length };
    }),

  /**
   * List donors with filtering and pagination
   *
   * @param searchTerm - Search by name or email
   * @param Various filter and pagination parameters...
   *
   * @returns Paginated list of donors
   */
  list: protectedProcedure
    .input(listDonorsSchema)
    .output(listDonorsOutputSchema)
    .query(async ({ input, ctx }) => {
      const result = await listDonors(input, ctx.auth.user.organizationId);

      return {
        donors: result.donors.map(serializeDonor),
        totalCount: result.totalCount,
      };
    }),

  /**
   * List donors optimized for communication features
   *
   * @param searchTerm - Search by name or email
   * @param Pagination parameters...
   *
   * @returns Lightweight donor list for communications
   */
  listForCommunication: protectedProcedure
    .input(listDonorsForCommunicationSchema)
    .output(listDonorsForCommunicationOutputSchema)
    .query(async ({ input, ctx }) => {
      return await listDonorsForCommunication(input, ctx.auth.user.organizationId);
    }),

  /**
   * Validate staff email connectivity for donors
   *
   * @param donorIds - Array of donor IDs to validate
   *
   * @returns Validation results with detailed issues
   */
  validateStaffEmailConnectivity: protectedProcedure
    .input(validateDonorStaffEmailSchema)
    .output(validateStaffEmailResponseSchema)
    .query(async ({ input, ctx }) => {
      const { donorIds } = input;
      const { organizationId } = ctx.auth.user;

      if (donorIds.length === 0) {
        return {
          isValid: true,
          donorsWithoutStaff: [],
          donorsWithStaffButNoEmail: [],
        };
      }

      // Import schemas and db for this specific validation query
      const donorSchema = donors;

      const donorsWithStaff = await db
        .select({
          donorId: donorSchema.id,
          donorFirstName: donorSchema.firstName,
          donorLastName: donorSchema.lastName,
          donorEmail: donorSchema.email,
          assignedToStaffId: donorSchema.assignedToStaffId,
          staffFirstName: staff.firstName,
          staffLastName: staff.lastName,
          staffEmail: staff.email,
          hasGmailToken: sql<boolean>`${staffGmailTokens.id} IS NOT NULL`,
        })
        .from(donorSchema)
        .leftJoin(staff, eq(donorSchema.assignedToStaffId, staff.id))
        .leftJoin(staffGmailTokens, eq(staff.id, staffGmailTokens.staffId))
        .where(
          and(inArray(donorSchema.id, donorIds), eq(donorSchema.organizationId, organizationId))
        );

      // Check for validation errors
      const donorsWithoutStaff = donorsWithStaff
        .filter((donor) => !donor.assignedToStaffId)
        .map((donor) => ({
          donorId: donor.donorId,
          donorFirstName: donor.donorFirstName,
          donorLastName: donor.donorLastName,
          donorEmail: donor.donorEmail,
        }));

      const donorsWithStaffButNoEmail = donorsWithStaff
        .filter((donor) => donor.assignedToStaffId && !donor.hasGmailToken)
        .map((donor) => ({
          donorId: donor.donorId,
          donorFirstName: donor.donorFirstName,
          donorLastName: donor.donorLastName,
          donorEmail: donor.donorEmail,
          staffFirstName: donor.staffFirstName!,
          staffLastName: donor.staffLastName!,
          staffEmail: donor.staffEmail!,
        }));

      const isValid = donorsWithoutStaff.length === 0 && donorsWithStaffButNoEmail.length === 0;

      let errorMessage: string | undefined;
      if (!isValid) {
        const errors: string[] = [];
        if (donorsWithoutStaff.length > 0) {
          errors.push(`${donorsWithoutStaff.length} donor(s) don't have assigned staff`);
        }
        if (donorsWithStaffButNoEmail.length > 0) {
          errors.push(
            `${donorsWithStaffButNoEmail.length} donor(s) have staff without connected Gmail accounts`
          );
        }
        errorMessage = errors.join(' and ');
      }

      return {
        isValid,
        donorsWithoutStaff,
        donorsWithStaffButNoEmail,
        errorMessage,
      };
    }),

  /**
   * Add a note to a donor
   *
   * @param donorId - Donor ID
   * @param content - Note content
   *
   * @returns Updated donor
   *
   * @throws {TRPCError} NOT_FOUND if donor doesn't exist
   */
  addNote: protectedProcedure
    .input(addDonorNoteSchema)
    .output(donorResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { donorId, content } = input;

      // Verify donor exists
      const donorResults = await getDonorsByIds([donorId], ctx.auth.user.organizationId);
      if (donorResults.length === 0) {
        throw notFoundError('Donor');
      }
      const donor = donorResults[0];

      // Create new note
      const newNote: DonorNote = {
        createdAt: new Date().toISOString(),
        createdBy: ctx.auth.user.id,
        content: content.trim(),
      };

      // Update donor with new note
      const updatedDonor = await ctx.services.donors.addNoteToDonor(
        donorId,
        newNote,
        ctx.auth.user.organizationId
      );

      if (!updatedDonor) {
        throw createTRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add note',
        });
      }

      return serializeDonor(updatedDonor);
    }),
});
