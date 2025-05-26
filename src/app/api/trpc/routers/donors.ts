import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getDonorById,
  getDonorByEmail,
  getDonorsByIds,
  createDonor,
  updateDonor,
  deleteDonor,
  listDonors,
} from "@/app/lib/data/donors";
import { getStaffById } from "@/app/lib/data/staff";

/**
 * Input validation schemas for donor operations
 */
const donorIdSchema = z.object({
  id: z.number(),
});

const donorIdsSchema = z.object({
  ids: z.array(z.number()),
});

const createDonorSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  isAnonymous: z.boolean().default(false),
  isOrganization: z.boolean().default(false),
  organizationName: z.string().optional(),
});

const updateDonorSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  isOrganization: z.boolean().optional(),
  organizationName: z.string().optional(),
});

const listDonorsSchema = z.object({
  searchTerm: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  isOrganization: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["firstName", "lastName", "email", "createdAt"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

const updateAssignedStaffSchema = z.object({
  donorId: z.number(),
  staffId: z.number().nullable(), // staffId can be null to unassign
});

/**
 * Base donor schema for consistent type validation across operations
 */
const baseDonorSchema = z.object({
  id: z.number(),
  organizationId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  state: z.string().nullish(),
  notes: z.string().nullish(),
  assignedToStaffId: z.number().nullish(),
  currentStageName: z.string().nullish(),
  classificationReasoning: z.string().nullish(),
  predictedActions: z.array(z.string()).optional(),
  createdAt: z.date().transform((d) => d.toISOString()),
  updatedAt: z.date().transform((d) => d.toISOString()),
  stageName: z.string().optional(),
  stageExplanation: z.string().optional(),
  possibleActions: z.array(z.string()).optional(),
});

/**
 * Output schema for list operations including pagination metadata
 */
const listDonorsOutputSchema = z.object({
  donors: z.array(baseDonorSchema),
  totalCount: z.number(),
});

/**
 * Donors router for managing donor data and relationships
 * Provides CRUD operations and staff assignment functionality
 */
export const donorsRouter = router({
  /**
   * Retrieves a donor by their ID
   * @param input.id - The donor ID to retrieve
   * @returns The donor data if found
   * @throws NOT_FOUND if donor doesn't exist or doesn't belong to the organization
   */
  getById: protectedProcedure.input(donorIdSchema).query(async ({ input, ctx }) => {
    const donor = await getDonorById(input.id, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }
    return donor;
  }),

  /**
   * Retrieves a donor by their email address
   * @param input.email - The donor email to search for
   * @returns The donor data if found
   * @throws NOT_FOUND if donor doesn't exist or doesn't belong to the organization
   */
  getByEmail: protectedProcedure.input(z.object({ email: z.string().email() })).query(async ({ input, ctx }) => {
    const donor = await getDonorByEmail(input.email, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }
    return donor;
  }),

  /**
   * Retrieves multiple donors by their IDs
   * @param input.ids - Array of donor IDs to retrieve
   * @returns Array of donor data found
   */
  getByIds: protectedProcedure.input(donorIdsSchema).query(async ({ input, ctx }) => {
    return await getDonorsByIds(input.ids, ctx.auth.user.organizationId);
  }),

  /**
   * Creates a new donor in the organization
   * @param input - The donor data to create
   * @returns The created donor data
   * @throws CONFLICT if a donor with the same email already exists
   */
  create: protectedProcedure.input(createDonorSchema).mutation(async ({ input, ctx }) => {
    try {
      return await createDonor({
        ...input,
        organizationId: ctx.auth.user.organizationId,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  /**
   * Updates an existing donor's information
   * @param input.id - The donor ID to update
   * @param input - The updated donor data (partial)
   * @returns The updated donor data
   * @throws NOT_FOUND if donor doesn't exist or doesn't belong to the organization
   */
  update: protectedProcedure.input(updateDonorSchema).mutation(async ({ input, ctx }) => {
    const { id, ...updateData } = input;
    const updated = await updateDonor(id, updateData, ctx.auth.user.organizationId);
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }
    return updated;
  }),

  /**
   * Deletes a donor from the organization
   * @param input.id - The donor ID to delete
   * @throws NOT_FOUND if donor doesn't exist
   * @throws PRECONDITION_FAILED if donor is linked to other records (donations, communications, etc.)
   */
  delete: protectedProcedure.input(donorIdSchema).mutation(async ({ input, ctx }) => {
    try {
      await deleteDonor(input.id, ctx.auth.user.organizationId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("linked to other records")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete donor as they are linked to other records",
        });
      }
      throw error;
    }
  }),

  /**
   * Updates the staff member assigned to a donor
   * @param input.donorId - The donor ID to update
   * @param input.staffId - The staff ID to assign (null to unassign)
   * @returns The updated donor data
   * @throws NOT_FOUND if donor or staff member doesn't exist in the organization
   * @throws INTERNAL_SERVER_ERROR if the update operation fails
   */
  updateAssignedStaff: protectedProcedure.input(updateAssignedStaffSchema).mutation(async ({ input, ctx }) => {
    const { donorId, staffId } = input;
    const { organizationId } = ctx.auth.user;

    // Verify donor belongs to the organization
    const donor = await getDonorById(donorId, organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found in your organization",
      });
    }

    // If staffId is provided, verify staff member belongs to the organization
    if (staffId !== null) {
      const staff = await getStaffById(staffId, organizationId);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Staff member not found in your organization",
        });
      }
    }

    // Update the donor's assignedToStaffId
    const updatedDonor = await updateDonor(donorId, { assignedToStaffId: staffId }, organizationId);
    if (!updatedDonor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update donor's assigned staff",
      });
    }
    return updatedDonor;
  }),

  /**
   * Lists donors with filtering, searching, and pagination
   * @param input.searchTerm - Optional search term to filter by name or email
   * @param input.isAnonymous - Optional filter for anonymous donors
   * @param input.isOrganization - Optional filter for organization donors
   * @param input.limit - Maximum number of donors to return (1-100, default varies)
   * @param input.offset - Number of donors to skip for pagination
   * @param input.orderBy - Field to sort by (firstName, lastName, email, createdAt)
   * @param input.orderDirection - Sort direction (asc or desc)
   * @returns Object containing donors array and total count for pagination
   */
  list: protectedProcedure
    .input(listDonorsSchema)
    .output(listDonorsOutputSchema)
    .query(async ({ input, ctx }) => {
      return await listDonors(
        {
          ...input,
        },
        ctx.auth.user.organizationId
      );
    }),
});
