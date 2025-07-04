"use client";

import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import { toast } from "sonner";
import type { ListDeletionMode } from "@/app/lib/data/donor-lists";
import { 
  STANDARD_QUERY_OPTIONS,
  createConditionalQueryOptions,
  wrapMutationAsync,
  wrapMutationAsyncBoolean,
  createErrorHandler,
  createCacheInvalidators,
  createCrossResourceInvalidators
} from "./utils";

// Type inference for better type safety
type DonorListOutput = inferProcedureOutput<AppRouter["lists"]["getById"]>;
type DonorListWithMemberCountOutput = inferProcedureOutput<AppRouter["lists"]["getByIdWithMemberCount"]>;
type DonorListWithMembersOutput = inferProcedureOutput<AppRouter["lists"]["getByIdWithMembers"]>;
type ListDonorListsInput = inferProcedureInput<AppRouter["lists"]["list"]>;
type CreateDonorListInput = inferProcedureInput<AppRouter["lists"]["create"]>;
type UpdateDonorListInput = inferProcedureInput<AppRouter["lists"]["update"]>;
type UploadFilesInput = inferProcedureInput<AppRouter["lists"]["uploadAndProcessFiles"]>;

/**
 * Hook for managing donor lists through the tRPC API
 * Provides methods for creating, reading, updating, and deleting donor lists
 */
export function useLists() {
  const utils = trpc.useUtils();
  const cacheInvalidators = createCacheInvalidators(utils);
  const crossResourceInvalidators = createCrossResourceInvalidators(utils);

  // Query hooks with consistent options
  const listDonorLists = (params: ListDonorListsInput = {}) => {
    return trpc.lists.list.useQuery(params, STANDARD_QUERY_OPTIONS);
  };

  // Get donor list query hook
  const getDonorListQuery = (id: number) =>
    trpc.lists.getById.useQuery(
      { id },
      createConditionalQueryOptions(!!id)
    );

  // Get donor list with member count query hook
  const getDonorListWithMemberCountQuery = (id: number) =>
    trpc.lists.getByIdWithMemberCount.useQuery(
      { id },
      createConditionalQueryOptions(!!id)
    );

  // Get donor list with members query hook
  const getDonorListWithMembersQuery = (id: number) =>
    trpc.lists.getByIdWithMembers.useQuery(
      { id },
      createConditionalQueryOptions(!!id)
    );

  // Get donor IDs from lists query hook
  const getDonorIdsFromListsQuery = (listIds: number[]) =>
    trpc.lists.getDonorIdsFromLists.useQuery(
      { listIds },
      createConditionalQueryOptions(listIds.length > 0)
    );

  // Get lists for donor query hook
  const getListsForDonorQuery = (donorId: number) =>
    trpc.lists.getListsForDonor.useQuery(
      { donorId },
      createConditionalQueryOptions(!!donorId)
    );

  // Mutation hooks
  const createMutation = trpc.lists.create.useMutation({
    onSuccess: (data) => {
      utils.lists.list.invalidate();
      utils.lists.list.refetch();
      toast.success(`Created list "${data.name}" successfully!`);
    },
    onError: (error) => {
      toast.error(`Failed to create list: ${error.message}`);
    },
  });

  const updateMutation = trpc.lists.update.useMutation({
    onSuccess: (data) => {
      // Update the cache directly instead of invalidating and refetching
      utils.lists.getById.setData({ id: data.id }, data);
      utils.lists.getByIdWithMemberCount.setData({ id: data.id }, (old) => (old ? { ...old, ...data } : undefined));
      utils.lists.getByIdWithMembers.setData({ id: data.id }, (old) => (old ? { ...old, ...data } : undefined));

      // Invalidate list view to refresh it
      utils.lists.list.invalidate();

      toast.success(`Updated list "${data.name}" successfully!`);
    },
    onError: (error) => {
      toast.error(`Failed to update list: ${error.message}`);
    },
  });

  const deleteMutation = trpc.lists.delete.useMutation({
    onSuccess: (result, variables) => {
      utils.lists.list.invalidate();
      utils.lists.list.refetch();

      let message = "List deleted successfully!";
      if (result.donorsDeleted > 0) {
        message = `List deleted along with ${result.donorsDeleted} donor${result.donorsDeleted !== 1 ? "s" : ""}!`;
      }

      toast.success(message);
    },
    onError: (error) => {
      toast.error(`Failed to delete list: ${error.message}`);
    },
  });

  const addDonorsMutation = trpc.lists.addDonors.useMutation({
    onSuccess: (data, variables) => {
      // Invalidate list-related queries
      crossResourceInvalidators.invalidateListRelated(variables.listId);
      
      // Invalidate getListsForDonor for all affected donors
      variables.donorIds.forEach((donorId) => {
        cacheInvalidators.invalidateAndRefetch("lists", ["getListsForDonor"]);
      });

      const addedCount = data.length;
      const skippedCount = variables.donorIds.length - addedCount;

      if (addedCount > 0) {
        toast.success(`Added ${addedCount} donor${addedCount !== 1 ? "s" : ""} to list!`);
      }
      if (skippedCount > 0) {
        toast.info(`${skippedCount} donor${skippedCount !== 1 ? "s were" : " was"} already in the list.`);
      }
    },
    onError: createErrorHandler("add donors to list"),
  });

  const removeDonorsMutation = trpc.lists.removeDonors.useMutation({
    onSuccess: (removedCount, variables) => {
      // Invalidate list-related queries
      crossResourceInvalidators.invalidateListRelated(variables.listId);
      
      // Invalidate getListsForDonor for all affected donors
      variables.donorIds.forEach((donorId) => {
        cacheInvalidators.invalidateAndRefetch("lists", ["getListsForDonor"]);
      });

      if (removedCount > 0) {
        toast.success(`Removed ${removedCount} donor${removedCount !== 1 ? "s" : ""} from list!`);
      } else {
        toast.info("No donors were removed from the list.");
      }
    },
    onError: createErrorHandler("remove donors from list"),
  });

  const uploadFilesMutation = trpc.lists.uploadAndProcessFiles.useMutation({
    onSuccess: (result, variables) => {
      // Invalidate list-related queries
      crossResourceInvalidators.invalidateListRelated(variables.listId);
      
      // Also invalidate donors since we imported new ones
      crossResourceInvalidators.invalidateDonorRelated();

      // Show comprehensive import summary
      const { summary } = result;
      const successMessage = `Import Complete: ${summary.imported} of ${summary.totalInCSV} records imported`;

      if (summary.skipped === 0) {
        toast.success(successMessage);
      } else {
        toast.success(successMessage);

        // Show skip details if any records were skipped
        const skipDetails = summary.skipBreakdown
          .map((item) => `${item.count} ${item.reason.toLowerCase()}`)
          .join(", ");
        toast.info(`Skipped ${summary.skipped} records: ${skipDetails}`);
      }

      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
      }
    },
    onError: createErrorHandler("upload and process files"),
  });

  const createByCriteriaMutation = trpc.lists.createByCriteria.useMutation({
    onSuccess: (result) => {
      // Invalidate all list-related queries
      crossResourceInvalidators.invalidateListRelated();

      if (result) {
        toast.success(
          `Successfully created list "${result.name}" with ${result.memberCount} donor${
            result.memberCount !== 1 ? "s" : ""
          }`
        );
      }
    },
    onError: createErrorHandler("create list by criteria"),
  });

  const bulkUpdateMembersStaffMutation = trpc.lists.bulkUpdateMembersStaff.useMutation({
    onSuccess: (result, variables) => {
      // Invalidate list-related queries
      crossResourceInvalidators.invalidateListRelated(variables.listId);
      
      // Also invalidate donor queries since staff assignments have changed
      crossResourceInvalidators.invalidateDonorRelated();

      toast.success(
        `Successfully updated staff assignment for ${result.updated} donor${result.updated !== 1 ? "s" : ""}`
      );
    },
    onError: createErrorHandler("bulk update staff assignment"),
  });

  // Helper functions for easier use
  const createList = async (data: CreateDonorListInput) => {
    return createMutation.mutateAsync(data);
  };

  const updateList = async (data: UpdateDonorListInput) => {
    return updateMutation.mutateAsync(data);
  };

  const deleteList = async (id: number, deleteMode: ListDeletionMode = "listOnly") => {
    return deleteMutation.mutateAsync({ id, deleteMode });
  };

  const addDonorsToList = async (listId: number, donorIds: number[]) => {
    return addDonorsMutation.mutateAsync({ listId, donorIds });
  };

  const removeDonorsFromList = async (listId: number, donorIds: number[]) => {
    return removeDonorsMutation.mutateAsync({ listId, donorIds });
  };

  const uploadFilesToList = async (data: {
    listId: number;
    accountsFile: { name: string; content: string };
    pledgesFile?: { name: string; content: string };
  }) => {
    return uploadFilesMutation.mutateAsync(data);
  };

  const createListByCriteria = async (data: {
    name: string;
    description?: string;
    isActive?: boolean;
    criteria: {
      createdDateFrom?: Date;
      createdDateTo?: Date;
      lastDonationDateFrom?: Date;
      lastDonationDateTo?: Date;
      highestDonationMin?: number;
      highestDonationMax?: number;
      totalDonationMin?: number;
      totalDonationMax?: number;
      assignedToStaffId?: number | null;
      includeNoDonations?: boolean;
    };
  }) => {
    return createByCriteriaMutation.mutateAsync(data);
  };

  const bulkUpdateMembersStaff = async (listId: number, staffId: number | null) => {
    return bulkUpdateMembersStaffMutation.mutateAsync({ listId, staffId });
  };

  const previewByCriteria = trpc.lists.previewByCriteria.useQuery;

  return {
    // Query hooks
    listDonorLists,
    getDonorListQuery,
    getDonorListWithMemberCountQuery,
    getDonorListWithMembersQuery,
    getDonorIdsFromListsQuery,
    getListsForDonorQuery,

    // Mutation hooks
    createMutation,
    updateMutation,
    deleteMutation,
    addDonorsMutation,
    removeDonorsMutation,
    uploadFilesMutation,
    createByCriteriaMutation,
    bulkUpdateMembersStaffMutation,

    // Helper functions
    createList,
    updateList,
    deleteList,
    addDonorsToList,
    removeDonorsFromList,
    uploadFilesToList,
    createListByCriteria,
    bulkUpdateMembersStaff,
    previewByCriteria,

    // Loading states
    isCreating: createMutation.isPending || createByCriteriaMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isAddingDonors: addDonorsMutation.isPending,
    isRemovingDonors: removeDonorsMutation.isPending,
    isUploadingFiles: uploadFilesMutation.isPending,
    isBulkUpdatingStaff: bulkUpdateMembersStaffMutation.isPending,
  };
}
