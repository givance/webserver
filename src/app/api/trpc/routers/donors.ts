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
  bulkDeleteDonors,
  listDonors,
  listDonorsForCommunication,
} from "@/app/lib/data/donors";
import { countListsForDonor } from "@/app/lib/data/donor-lists";
import { getStaffById } from "@/app/lib/data/staff";
import { db } from "@/app/lib/db";
import { donors, type DonorNote } from "@/app/lib/db/schema";
import { and, inArray, eq, sql } from "drizzle-orm";

/**
 * Input validation schemas for donor operations
 */
const donorIdSchema = z.object({
  id: z.number(),
});

const donorIdsSchema = z.object({
  ids: z.array(z.number()),
});

const deleteDonorSchema = z
  .object({
    id: z.number(),
    deleteMode: z.enum(["fromList", "fromAllLists", "entirely"]).optional(),
    listId: z.number().optional(),
  })
  .refine(
    (data) => {
      // If deleteMode is 'fromList', listId is required
      if (data.deleteMode === "fromList" && !data.listId) {
        return false;
      }
      return true;
    },
    {
      message: "List ID is required when deleting from a specific list",
      path: ["listId"],
    }
  );

const createDonorSchema = z.object({
  externalId: z.string().optional(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  isAnonymous: z.boolean().default(false),
  isOrganization: z.boolean().default(false),
  organizationName: z.string().optional(),
});

const updateDonorSchema = z.object({
  id: z.number(),
  externalId: z.string().optional(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  isAnonymous: z.boolean().optional(),
  isOrganization: z.boolean().optional(),
  organizationName: z.string().optional(),
});

const listDonorsSchema = z.object({
  searchTerm: z.string().optional(),
  state: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  isOrganization: z.boolean().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  assignedToStaffId: z.number().nullable().optional(),
  listId: z.number().optional(),
  notInAnyList: z.boolean().optional(),
  onlyResearched: z.boolean().optional(),
  limit: z.number().min(1).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["firstName", "lastName", "email", "createdAt", "totalDonated"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

const listDonorsForCommunicationSchema = z.object({
  searchTerm: z.string().optional(),
  limit: z.number().min(1).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["firstName", "lastName", "email", "createdAt"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
});

const updateAssignedStaffSchema = z.object({
  donorId: z.number(),
  staffId: z.number().nullable(), // staffId can be null to unassign
});

const bulkUpdateAssignedStaffSchema = z.object({
  donorIds: z.array(z.number()),
  staffId: z.number().nullable(), // staffId can be null to unassign all
});

const validateDonorStaffEmailSchema = z.object({
  donorIds: z.array(z.number()),
});

const addDonorNoteSchema = z.object({
  donorId: z.number(),
  content: z.string().min(1, "Note content is required"),
});

/**
 * Base donor schema for consistent type validation across operations
 */
const baseDonorSchema = z.object({
  id: z.number(),
  organizationId: z.string(),
  externalId: z.string().nullish(), // External CRM ID
  firstName: z.string(),
  lastName: z.string(),
  // New couple structure fields
  hisTitle: z.string().nullish(),
  hisFirstName: z.string().nullish(),
  hisInitial: z.string().nullish(),
  hisLastName: z.string().nullish(),
  herTitle: z.string().nullish(),
  herFirstName: z.string().nullish(),
  herInitial: z.string().nullish(),
  herLastName: z.string().nullish(),
  displayName: z.string().nullish(),
  isCouple: z.boolean().nullish(),
  email: z.string(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  state: z.string().nullish(),
  gender: z.enum(["male", "female"]).nullish(),
  notes: z.union([
    z.string().nullish(),
    z.array(z.object({
      createdAt: z.string(),
      createdBy: z.string(),
      content: z.string(),
    }))
  ]).optional(),
  assignedToStaffId: z.number().nullish(),
  currentStageName: z.string().nullish(),
  classificationReasoning: z.string().nullish(),
  predictedActions: z.array(z.string()).optional(),
  // NEW: Person research fields
  highPotentialDonor: z.boolean().nullish(),
  highPotentialDonorRationale: z.string().nullish(),
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
 * Lightweight donor schema for communication features
 */
const communicationDonorSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullish(),
  displayName: z.string().nullish(),
  hisTitle: z.string().nullish(),
  hisFirstName: z.string().nullish(),
  hisInitial: z.string().nullish(),
  hisLastName: z.string().nullish(),
  herTitle: z.string().nullish(),
  herFirstName: z.string().nullish(),
  herInitial: z.string().nullish(),
  herLastName: z.string().nullish(),
  isCouple: z.boolean().nullish(),
});

/**
 * Output schema for communication donor list operations
 */
const listDonorsForCommunicationOutputSchema = z.object({
  donors: z.array(communicationDonorSchema),
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
   * Deletes a donor from the organization with different deletion modes
   * @param input.id - The donor ID to delete
   * @param input.deleteMode - Optional deletion mode: 'fromList', 'fromAllLists', or 'entirely' (default)
   * @param input.listId - Required when deleteMode is 'fromList'
   * @throws NOT_FOUND if donor doesn't exist
   * @throws BAD_REQUEST if invalid parameters
   * @throws PRECONDITION_FAILED if donor is linked to other records (when deleting entirely)
   */
  delete: protectedProcedure.input(deleteDonorSchema).mutation(async ({ input, ctx }) => {
    try {
      const options =
        input.deleteMode || input.listId
          ? {
              deleteMode: input.deleteMode || "entirely",
              listId: input.listId,
            }
          : undefined;

      await deleteDonor(input.id, ctx.auth.user.organizationId, options);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("List ID is required")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        if (error.message.includes("not a member of the specified list")) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error.message.includes("linked to other records")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot delete donor as they are linked to other records",
          });
        }
      }
      throw error;
    }
  }),

  /**
   * Deletes multiple donors from the organization
   * @param input.ids - Array of donor IDs to delete
   * @returns Object with success/failure counts and any error messages
   * @throws BAD_REQUEST if no IDs provided
   */
  bulkDelete: protectedProcedure.input(donorIdsSchema).mutation(async ({ input, ctx }) => {
    if (input.ids.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No donor IDs provided",
      });
    }

    return await bulkDeleteDonors(input.ids, ctx.auth.user.organizationId);
  }),

  /**
   * Gets all donor IDs for the organization with optional filtering (for bulk operations)
   * @param input - Optional filters to apply (same as list endpoint)
   * @returns Array of donor IDs matching the criteria
   */
  getAllIds: protectedProcedure.input(listDonorsSchema.partial()).query(async ({ input, ctx }) => {
    const result = await listDonors(
      {
        ...input,
        // No limit to get all matching donors
        // No offset for bulk operations
      },
      ctx.auth.user.organizationId
    );

    return result.donors.map((donor) => donor.id);
  }),

  /**
   * Counts the number of lists a donor belongs to
   * @param input.id - The donor ID to check
   * @returns The count of lists the donor belongs to
   * @throws NOT_FOUND if donor doesn't exist
   */
  countLists: protectedProcedure.input(donorIdSchema).query(async ({ input, ctx }) => {
    const donor = await getDonorById(input.id, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }

    const count = await countListsForDonor(input.id, ctx.auth.user.organizationId);
    return { count };
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
   * Updates the staff member assigned to multiple donors in bulk
   * @param input.donorIds - Array of donor IDs to update
   * @param input.staffId - The staff ID to assign (null to unassign all)
   * @returns Count of donors updated successfully
   * @throws NOT_FOUND if staff member doesn't exist in the organization
   * @throws INTERNAL_SERVER_ERROR if the update operation fails
   */
  bulkUpdateAssignedStaff: protectedProcedure.input(bulkUpdateAssignedStaffSchema).mutation(async ({ input, ctx }) => {
    const { donorIds, staffId } = input;
    const { organizationId } = ctx.auth.user;

    if (donorIds.length === 0) {
      return { updated: 0 };
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

    // Verify all donors belong to the organization
    const validDonors = await getDonorsByIds(donorIds, organizationId);
    const validDonorIds = validDonors.map((d) => d.id);

    if (validDonorIds.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No valid donors found in your organization",
      });
    }

    // Bulk update the donors' assignedToStaffId using raw SQL for efficiency
    try {
      const result = await db
        .update(donors)
        .set({ assignedToStaffId: staffId, updatedAt: sql`now()` })
        .where(and(inArray(donors.id, validDonorIds), eq(donors.organizationId, organizationId)));

      return { updated: validDonorIds.length };
    } catch (error) {
      console.error("Failed to bulk update assigned staff:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update donors' assigned staff",
      });
    }
  }),

  /**
   * Lists donors with filtering, searching, and pagination
   * @param input.searchTerm - Optional search term to filter by name or email
   * @param input.state - Optional state filter
   * @param input.isAnonymous - Optional filter for anonymous donors
   * @param input.isOrganization - Optional filter for organization donors
   * @param input.gender - Optional filter for gender
   * @param input.assignedToStaffId - Optional filter for donors assigned to a specific staff member
   * @param input.listId - Optional filter for donors in a specific list
   * @param input.notInAnyList - Optional filter for donors not in any list
   * @param input.onlyResearched - Optional filter for donors who have been researched
   * @param input.limit - Maximum number of donors to return (1-100, default varies)
   * @param input.offset - Number of donors to skip for pagination
   * @param input.orderBy - Field to sort by (firstName, lastName, email, createdAt, totalDonated)
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

  /**
   * Lists donors with minimal data optimized for communication features
   * Returns only essential fields without expensive stage information processing
   * @param input.searchTerm - Optional search term to filter by name or email
   * @param input.limit - Maximum number of donors to return
   * @param input.offset - Number of donors to skip for pagination
   * @param input.orderBy - Field to sort by (firstName, lastName, email, createdAt)
   * @param input.orderDirection - Sort direction (asc or desc)
   * @returns Object containing lightweight donor objects and total count for pagination
   */
  listForCommunication: protectedProcedure
    .input(listDonorsForCommunicationSchema)
    .output(listDonorsForCommunicationOutputSchema)
    .query(async ({ input, ctx }) => {
      return await listDonorsForCommunication(
        {
          ...input,
        },
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Validates that all specified donors have assigned staff with connected Gmail accounts
   * @param input.donorIds - Array of donor IDs to validate
   * @returns Validation result with detailed information about any issues
   */
  validateStaffEmailConnectivity: protectedProcedure
    .input(validateDonorStaffEmailSchema)
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

      // Import staff and staffGmailTokens schemas
      const { staff, staffGmailTokens } = await import("@/app/lib/db/schema");

      const donorsWithStaff = await db
        .select({
          donorId: donors.id,
          donorFirstName: donors.firstName,
          donorLastName: donors.lastName,
          donorEmail: donors.email,
          assignedToStaffId: donors.assignedToStaffId,
          staffFirstName: staff.firstName,
          staffLastName: staff.lastName,
          staffEmail: staff.email,
          hasGmailToken: sql<boolean>`${staffGmailTokens.id} IS NOT NULL`,
        })
        .from(donors)
        .leftJoin(staff, eq(donors.assignedToStaffId, staff.id))
        .leftJoin(staffGmailTokens, eq(staff.id, staffGmailTokens.staffId))
        .where(and(inArray(donors.id, donorIds), eq(donors.organizationId, organizationId)));

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
          errors.push(`${donorsWithStaffButNoEmail.length} donor(s) have staff without connected Gmail accounts`);
        }
        errorMessage = errors.join(" and ");
      }

      return {
        isValid,
        donorsWithoutStaff,
        donorsWithStaffButNoEmail,
        errorMessage,
      };
    }),

  /**
   * Adds a note to a donor
   * @param input.donorId - The donor ID to add the note to
   * @param input.content - The note content
   * @returns The updated donor data
   * @throws NOT_FOUND if donor doesn't exist or doesn't belong to the organization
   */
  addNote: protectedProcedure.input(addDonorNoteSchema).mutation(async ({ input, ctx }) => {
    const { donorId, content } = input;
    
    // First, get the donor to ensure it exists and belongs to the organization
    const donor = await getDonorById(donorId, ctx.auth.user.organizationId);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found",
      });
    }

    // Create the new note
    const newNote: DonorNote = {
      createdAt: new Date().toISOString(),
      createdBy: ctx.auth.user.id,
      content: content.trim(),
    };

    // Get existing notes or default to empty array
    const existingNotes = (donor.notes as DonorNote[]) || [];

    // Update the donor with the new notes array
    const [updatedDonor] = await db
      .update(donors)
      .set({
        notes: [...existingNotes, newNote],
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(donors.id, donorId),
          eq(donors.organizationId, ctx.auth.user.organizationId)
        )
      )
      .returning();

    if (!updatedDonor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to add note",
      });
    }

    return updatedDonor;
  }),
});
