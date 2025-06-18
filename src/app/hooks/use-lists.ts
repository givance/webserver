"use client";

import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import { toast } from "sonner";

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

  // Query hooks
  const listDonorLists = (params: ListDonorListsInput = {}) => {
    return trpc.lists.list.useQuery(params, {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    });
  };

  // Get donor list query hook
  const getDonorListQuery = (id: number) =>
    trpc.lists.getById.useQuery(
      { id },
      {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!id, // Only run the query if we have an ID
      }
    );

  // Get donor list with member count query hook
  const getDonorListWithMemberCountQuery = (id: number) =>
    trpc.lists.getByIdWithMemberCount.useQuery(
      { id },
      {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!id, // Only run the query if we have an ID
      }
    );

  // Get donor list with members query hook
  const getDonorListWithMembersQuery = (id: number) =>
    trpc.lists.getByIdWithMembers.useQuery(
      { id },
      {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!id, // Only run the query if we have an ID
      }
    );

  // Get donor IDs from lists query hook
  const getDonorIdsFromListsQuery = (listIds: number[]) =>
    trpc.lists.getDonorIdsFromLists.useQuery(
      { listIds },
      {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: listIds.length > 0, // Only run the query if we have list IDs
      }
    );

  // Get lists for donor query hook
  const getListsForDonorQuery = (donorId: number) =>
    trpc.lists.getListsForDonor.useQuery(
      { donorId },
      {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!donorId, // Only run the query if we have a donor ID
      }
    );

  // Mutation hooks
  const createMutation = trpc.lists.create.useMutation({
    onSuccess: (data) => {
      utils.lists.list.invalidate();
      toast.success(`Created list "${data.name}" successfully!`);
    },
    onError: (error) => {
      toast.error(`Failed to create list: ${error.message}`);
    },
  });

  const updateMutation = trpc.lists.update.useMutation({
    onSuccess: (data) => {
      utils.lists.list.invalidate();
      utils.lists.getById.invalidate({ id: data.id });
      utils.lists.getByIdWithMemberCount.invalidate({ id: data.id });
      utils.lists.getByIdWithMembers.invalidate({ id: data.id });
      toast.success(`Updated list "${data.name}" successfully!`);
    },
    onError: (error) => {
      toast.error(`Failed to update list: ${error.message}`);
    },
  });

  const deleteMutation = trpc.lists.delete.useMutation({
    onSuccess: () => {
      utils.lists.list.invalidate();
      toast.success("List deleted successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to delete list: ${error.message}`);
    },
  });

  const addDonorsMutation = trpc.lists.addDonors.useMutation({
    onSuccess: (data, variables) => {
      utils.lists.list.invalidate();
      utils.lists.getByIdWithMemberCount.invalidate({ id: variables.listId });
      utils.lists.getByIdWithMembers.invalidate({ id: variables.listId });
      utils.lists.getDonorIdsFromLists.invalidate();

      // Invalidate getListsForDonor for all affected donors
      variables.donorIds.forEach((donorId) => {
        utils.lists.getListsForDonor.invalidate({ donorId });
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
    onError: (error) => {
      toast.error(`Failed to add donors to list: ${error.message}`);
    },
  });

  const removeDonorsMutation = trpc.lists.removeDonors.useMutation({
    onSuccess: (removedCount, variables) => {
      utils.lists.list.invalidate();
      utils.lists.getByIdWithMemberCount.invalidate({ id: variables.listId });
      utils.lists.getByIdWithMembers.invalidate({ id: variables.listId });
      utils.lists.getDonorIdsFromLists.invalidate();

      // Invalidate getListsForDonor for all affected donors
      variables.donorIds.forEach((donorId) => {
        utils.lists.getListsForDonor.invalidate({ donorId });
      });

      if (removedCount > 0) {
        toast.success(`Removed ${removedCount} donor${removedCount !== 1 ? "s" : ""} from list!`);
      } else {
        toast.info("No donors were removed from the list.");
      }
    },
    onError: (error) => {
      toast.error(`Failed to remove donors from list: ${error.message}`);
    },
  });

  const uploadFilesMutation = trpc.lists.uploadAndProcessFiles.useMutation({
    onSuccess: (result, variables) => {
      utils.lists.list.invalidate();
      utils.lists.getByIdWithMemberCount.invalidate({ id: variables.listId });
      utils.lists.getByIdWithMembers.invalidate({ id: variables.listId });
      utils.lists.getDonorIdsFromLists.invalidate();

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
    onError: (error) => {
      toast.error(`Failed to upload and process files: ${error.message}`);
    },
  });

  const createByCriteriaMutation = trpc.lists.createByCriteria.useMutation({
    onSuccess: (result) => {
      utils.lists.list.invalidate();
      utils.lists.getByIdWithMemberCount.invalidate();
      utils.lists.getByIdWithMembers.invalidate();
      utils.lists.getDonorIdsFromLists.invalidate();

      if (result) {
        toast.success(
          `Successfully created list "${result.name}" with ${result.memberCount} donor${
            result.memberCount !== 1 ? "s" : ""
          }`
        );
      }
    },
    onError: (error) => {
      toast.error(`Failed to create list by criteria: ${error.message}`);
    },
  });

  // Helper functions for easier use
  const createList = async (data: CreateDonorListInput) => {
    return createMutation.mutateAsync(data);
  };

  const updateList = async (data: UpdateDonorListInput) => {
    return updateMutation.mutateAsync(data);
  };

  const deleteList = async (id: number) => {
    return deleteMutation.mutateAsync({ id });
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

    // Helper functions
    createList,
    updateList,
    deleteList,
    addDonorsToList,
    removeDonorsFromList,
    uploadFilesToList,
    createListByCriteria,
    previewByCriteria,

    // Loading states
    isCreating: createMutation.isPending || createByCriteriaMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isAddingDonors: addDonorsMutation.isPending,
    isRemovingDonors: removeDonorsMutation.isPending,
    isUploadingFiles: uploadFilesMutation.isPending,
  };
}
