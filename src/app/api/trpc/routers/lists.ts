import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  createDonorList,
  getDonorListById,
  getDonorListWithMemberCount,
  getDonorListWithMembers,
  listDonorLists,
  updateDonorList,
  deleteDonorList,
  addDonorsToList,
  removeDonorsFromList,
  getDonorIdsFromLists,
  getListsForDonor,
  getDonorsExclusiveToList,
  bulkUpdateListMembersStaff,
  type ListDeletionMode,
} from "../../../lib/data/donor-lists";
import { listDonorsByCriteria } from "../../../lib/data/donors";
import { processCSVFiles } from "../../../lib/utils/csv-import";
import { donorListCriteriaSchemas } from "../../../lib/validation/schemas";

/**
 * Input validation schemas for donor list operations
 */
const listIdSchema = z.object({
  id: z.number(),
});

const deleteListSchema = z.object({
  id: z.number(),
  deleteMode: z.enum(["listOnly", "withExclusiveDonors", "withAllDonors"]).default("listOnly"),
});

const createListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

const updateListSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const listListsSchema = z.object({
  searchTerm: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(["name", "createdAt", "updatedAt", "memberCount"]).optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
  includeMemberCount: z.boolean().optional(),
});

const addDonorsSchema = z.object({
  listId: z.number(),
  donorIds: z.array(z.number().positive()),
});

const removeDonorsSchema = z.object({
  listId: z.number(),
  donorIds: z.array(z.number().positive()),
});

const getDonorIdsFromListsSchema = z.object({
  listIds: z.array(z.number().positive()),
});

const getListsForDonorSchema = z.object({
  donorId: z.number().positive(),
});

const bulkUpdateMembersStaffSchema = z.object({
  listId: z.number().positive(),
  staffId: z.number().positive().nullable(),
});

const uploadFilesSchema = z.object({
  listId: z.number(),
  accountsFile: z.object({
    name: z.string(),
    content: z.string(), // base64 encoded CSV content
  }),
  pledgesFile: z
    .object({
      name: z.string(),
      content: z.string(), // base64 encoded CSV content
    })
    .optional(),
});

/**
 * Donor lists router for managing donor lists and memberships
 * Provides CRUD operations for lists and member management functionality
 */
export const listsRouter = router({
  /**
   * Create a new donor list
   * @param input.name - The name of the list (required, 1-255 characters)
   * @param input.description - Optional description of the list
   * @param input.isActive - Whether the list is active (default: true)
   * @returns The created donor list
   * @throws CONFLICT if a list with the same name already exists in the organization
   */
  create: protectedProcedure.input(createListSchema).mutation(async ({ input, ctx }) => {
    try {
      return await createDonorList({
        ...input,
        organizationId: ctx.auth.user.organizationId,
        createdBy: ctx.auth.user.id,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("unique constraint")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A list with this name already exists in your organization",
        });
      }
      throw error;
    }
  }),

  /**
   * Get a donor list by ID
   * @param input.id - The donor list ID
   * @returns The donor list if found and authorized
   * @throws NOT_FOUND if the list doesn't exist or doesn't belong to the organization
   */
  getById: protectedProcedure.input(listIdSchema).query(async ({ input, ctx }) => {
    const list = await getDonorListById(input.id, ctx.auth.user.organizationId);
    if (!list) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor list not found",
      });
    }
    return list;
  }),

  /**
   * Get a donor list with member count by ID
   * @param input.id - The donor list ID
   * @returns The donor list with member count if found and authorized
   * @throws NOT_FOUND if the list doesn't exist or doesn't belong to the organization
   */
  getByIdWithMemberCount: protectedProcedure.input(listIdSchema).query(async ({ input, ctx }) => {
    const list = await getDonorListWithMemberCount(input.id, ctx.auth.user.organizationId);
    if (!list) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor list not found",
      });
    }
    return list;
  }),

  /**
   * Get a donor list with all members by ID
   * @param input.id - The donor list ID
   * @returns The donor list with members if found and authorized
   * @throws NOT_FOUND if the list doesn't exist or doesn't belong to the organization
   */
  getByIdWithMembers: protectedProcedure.input(listIdSchema).query(async ({ input, ctx }) => {
    const list = await getDonorListWithMembers(input.id, ctx.auth.user.organizationId);
    if (!list) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor list not found",
      });
    }
    return list;
  }),

  /**
   * List donor lists for the organization
   * @param input.searchTerm - Optional search term to filter by name
   * @param input.isActive - Optional filter for active/inactive lists
   * @param input.limit - Maximum number of lists to return (1-100, default: 50)
   * @param input.offset - Number of lists to skip for pagination
   * @param input.orderBy - Field to sort by (name, createdAt, updatedAt, memberCount)
   * @param input.orderDirection - Sort direction (asc or desc)
   * @param input.includeMemberCount - Whether to include member counts (default: true)
   * @returns Object containing lists array and total count for pagination
   */
  list: protectedProcedure.input(listListsSchema).query(async ({ input, ctx }) => {
    return await listDonorLists(ctx.auth.user.organizationId, input);
  }),

  /**
   * Update a donor list
   * @param input.id - The donor list ID
   * @param input.name - Optional new name (1-255 characters)
   * @param input.description - Optional new description
   * @param input.isActive - Optional new active status
   * @returns The updated donor list
   * @throws NOT_FOUND if the list doesn't exist or doesn't belong to the organization
   * @throws CONFLICT if the new name conflicts with an existing list
   */
  update: protectedProcedure.input(updateListSchema).mutation(async ({ input, ctx }) => {
    const { id, ...updateData } = input;
    try {
      const updated = await updateDonorList(id, updateData, ctx.auth.user.organizationId);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Donor list not found",
        });
      }
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message.includes("unique constraint")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A list with this name already exists in your organization",
        });
      }
      throw error;
    }
  }),

  /**
   * Delete a donor list with optional donor deletion
   * @param input.id - The donor list ID
   * @param input.deleteMode - Deletion mode: "listOnly", "withExclusiveDonors", or "withAllDonors"
   * @returns Object with deletion results (listDeleted and donorsDeleted count)
   * @throws NOT_FOUND if the list doesn't exist or doesn't belong to the organization
   */
  delete: protectedProcedure.input(deleteListSchema).mutation(async ({ input, ctx }) => {
    const result = await deleteDonorList(input.id, ctx.auth.user.organizationId, input.deleteMode);
    if (!result.listDeleted) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor list not found",
      });
    }
    return result;
  }),

  /**
   * Add donors to a list
   * @param input.listId - The donor list ID
   * @param input.donorIds - Array of donor IDs to add to the list
   * @returns Array of created list member records
   * @throws NOT_FOUND if the list doesn't exist or any donors don't belong to the organization
   * @throws BAD_REQUEST if any donors are already in the list or other validation errors
   */
  addDonors: protectedProcedure.input(addDonorsSchema).mutation(async ({ input, ctx }) => {
    try {
      return await addDonorsToList(input.listId, input.donorIds, ctx.auth.user.id, ctx.auth.user.organizationId);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  /**
   * Remove donors from a list
   * @param input.listId - The donor list ID
   * @param input.donorIds - Array of donor IDs to remove from the list
   * @returns Number of donors successfully removed
   * @throws NOT_FOUND if the list doesn't exist or doesn't belong to the organization
   */
  removeDonors: protectedProcedure.input(removeDonorsSchema).mutation(async ({ input, ctx }) => {
    try {
      return await removeDonorsFromList(input.listId, input.donorIds, ctx.auth.user.organizationId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error.message,
        });
      }
      throw error;
    }
  }),

  /**
   * Get donor IDs from multiple lists (useful for communication campaigns)
   * @param input.listIds - Array of list IDs to get donors from
   * @returns Array of unique donor IDs from all specified lists
   * @throws NOT_FOUND if any lists don't exist or don't belong to the organization
   */
  getDonorIdsFromLists: protectedProcedure.input(getDonorIdsFromListsSchema).query(async ({ input, ctx }) => {
    try {
      return await getDonorIdsFromLists(input.listIds, ctx.auth.user.organizationId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not belong")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some lists do not belong to your organization",
        });
      }
      throw error;
    }
  }),

  /**
   * Get lists that contain a specific donor
   * @param input.donorId - The donor ID to find lists for
   * @returns Array of lists containing the specified donor
   */
  getListsForDonor: protectedProcedure.input(getListsForDonorSchema).query(async ({ input, ctx }) => {
    try {
      const lists = await getListsForDonor(input.donorId, ctx.auth.user.organizationId);
      return lists;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get lists for donor",
      });
    }
  }),

  /**
   * Get the count of donors that are exclusively in a specific list
   * @param input.id - The donor list ID
   * @returns Count of donors that belong only to this list
   */
  getExclusiveDonorCount: protectedProcedure.input(listIdSchema).query(async ({ input, ctx }) => {
    try {
      const exclusiveDonorIds = await getDonorsExclusiveToList(input.id, ctx.auth.user.organizationId);
      return { count: exclusiveDonorIds.length };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "List not found",
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get exclusive donor count",
      });
    }
  }),

  /**
   * Upload and process CSV files to import donors and pledges into a list
   */
  uploadAndProcessFiles: protectedProcedure.input(uploadFilesSchema).mutation(async ({ input, ctx }) => {
    try {
      // Verify list exists and belongs to organization
      const list = await getDonorListById(input.listId, ctx.auth.user.organizationId);
      if (!list) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "List not found",
        });
      }

      // Decode base64 content
      const accountsContent = Buffer.from(input.accountsFile.content, "base64").toString("utf-8");
      const pledgesContent = input.pledgesFile
        ? Buffer.from(input.pledgesFile.content, "base64").toString("utf-8")
        : null;

      // Log file info for debugging
      console.log(`Received file: ${input.accountsFile.name}`);
      console.log(`Base64 content length: ${input.accountsFile.content.length}`);
      console.log(`Decoded content length: ${accountsContent.length} characters`);
      console.log(`Line count check: ${accountsContent.split('\n').length} lines`);

      // Process the CSV files
      const result = await processCSVFiles({
        accountsCSV: accountsContent,
        pledgesCSV: pledgesContent,
        organizationId: ctx.auth.user.organizationId,
        listId: input.listId,
        userId: ctx.auth.user.id,
      });

      return result;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to process files",
      });
    }
  }),

  /**
   * Preview donors that match the specified criteria
   * @param input.criteria - Filtering criteria for donors
   * @param input.limit - Maximum number of donors to return for preview
   * @param input.offset - Number of donors to skip for pagination
   * @returns Object containing matching donors and total count
   */
  previewByCriteria: protectedProcedure
    .input(donorListCriteriaSchemas.previewByCriteria)
    .query(async ({ input, ctx }) => {
      try {
        const result = await listDonorsByCriteria(
          {
            ...input.criteria,
            limit: input.limit || 10,
            offset: input.offset || 0,
          },
          ctx.auth.user.organizationId
        );

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to preview donors by criteria",
        });
      }
    }),

  /**
   * Create a new donor list based on filtering criteria
   * @param input.name - The name of the list (required, 1-255 characters)
   * @param input.description - Optional description of the list
   * @param input.isActive - Whether the list is active (default: true)
   * @param input.criteria - Filtering criteria for selecting donors
   * @returns The created donor list with member count
   * @throws CONFLICT if a list with the same name already exists in the organization
   */
  createByCriteria: protectedProcedure
    .input(donorListCriteriaSchemas.createByCriteria)
    .mutation(async ({ input, ctx }) => {
      try {
        const { criteria, ...listData } = input;

        // Step 1: Create the list
        const newList = await createDonorList({
          ...listData,
          organizationId: ctx.auth.user.organizationId,
          createdBy: ctx.auth.user.id,
        });

        if (!newList) {
          throw new Error("Failed to create list");
        }

        // Step 2: Get donors that match the criteria
        const donorsResult = await listDonorsByCriteria(criteria, ctx.auth.user.organizationId);

        if (donorsResult.donors.length > 0) {
          // Step 3: Add all matching donors to the list
          const donorIds = donorsResult.donors.map((donor) => donor.id);
          await addDonorsToList(newList.id, donorIds, ctx.auth.user.id, ctx.auth.user.organizationId);
        }

        // Return the list with member count
        const listWithMemberCount = await getDonorListWithMemberCount(newList.id, ctx.auth.user.organizationId);
        return listWithMemberCount;
      } catch (error) {
        if (error instanceof Error && error.message.includes("unique constraint")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A list with this name already exists in your organization",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create list by criteria",
        });
      }
    }),

  /**
   * Bulk update staff assignment for all members of a list
   * @param input.listId - The ID of the list
   * @param input.staffId - The staff ID to assign (null for unassigned)
   * @returns Object with the number of donors updated
   */
  bulkUpdateMembersStaff: protectedProcedure
    .input(bulkUpdateMembersStaffSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await bulkUpdateListMembersStaff(
          input.listId,
          input.staffId,
          ctx.auth.user.organizationId
        );
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to bulk update staff assignment",
        });
      }
    }),
});
