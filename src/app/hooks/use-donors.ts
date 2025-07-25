'use client';

import { trpc } from '@/app/lib/trpc/client';
import type { inferProcedureInput, inferProcedureOutput } from '@trpc/server';
import type { AppRouter } from '@/app/api/trpc/routers/_app';
import { toast } from 'sonner';
import { logger } from '@/app/lib/logger';
import type { TRPCClientErrorLike } from '@trpc/client';

type DonorOutput = inferProcedureOutput<AppRouter['donors']['getByIds']>[0];
type ListDonorsInput = inferProcedureInput<AppRouter['donors']['list']>;
type CreateDonorInput = inferProcedureInput<AppRouter['donors']['create']>;
type UpdateDonorInput = inferProcedureInput<AppRouter['donors']['update']>;
type AddNoteInput = inferProcedureInput<AppRouter['donors']['addNote']>;
type EditNoteInput = inferProcedureInput<AppRouter['donors']['editNote']>;
type DeleteNoteInput = inferProcedureInput<AppRouter['donors']['deleteNote']>;

/**
 * Hook for managing donors through the tRPC API
 * Provides methods for creating, reading, updating, and deleting donors
 */
export function useDonors() {
  const utils = trpc.useUtils();

  // Query hooks
  const listDonors = (params: {
    searchTerm?: string;
    gender?: 'male' | 'female' | null;
    assignedToStaffId?: number | null;
    listId?: number;
    onlyResearched?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: 'firstName' | 'lastName' | 'email' | 'createdAt' | 'totalDonated';
    orderDirection?: 'asc' | 'desc';
  }) => {
    return trpc.donors.list.useQuery(params, {
      // Refetch when window regains focus (e.g., returning from list upload)
      refetchOnWindowFocus: true,
      refetchOnMount: false,
      refetchOnReconnect: false,
    });
  };

  // Optimized query for communication features
  const listDonorsForCommunication = (params: {
    searchTerm?: string;
    limit?: number;
    offset?: number;
    orderBy?: 'firstName' | 'lastName' | 'email' | 'createdAt';
    orderDirection?: 'asc' | 'desc';
  }) => {
    return trpc.donors.listForCommunication.useQuery(params, {
      // Allow refetching when search term changes
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      // Keep queries fresh with a reasonable stale time for search
      staleTime: 5000, // 5 seconds for search queries
      // Enable the query to run when params change
      enabled: true,
    });
  };

  // Get donor query hook - uses getByIds internally for consistency
  const getDonorQuery = (id: number) => {
    const query = trpc.donors.getByIds.useQuery(
      { ids: [id] },
      {
        // Don't refetch automatically
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!id, // Only run the query if we have an ID
      }
    );

    // Transform the response to return a single donor instead of an array
    return {
      ...query,
      data: query.data?.[0],
    };
  };

  // Get multiple donors query hook
  const getDonorsQuery = (ids: number[]) =>
    trpc.donors.getByIds.useQuery(
      { ids },
      {
        // Don't refetch automatically
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: ids.length > 0, // Only run the query if we have IDs
      }
    );

  // Get donor donation stats
  const getDonorStats = (donorId: number) =>
    trpc.donations.getDonorStats.useQuery(
      { donorId },
      {
        // Don't refetch automatically
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!donorId, // Only run the query if we have an ID
      }
    );

  // Get multiple donor donation stats
  const getMultipleDonorStats = (donorIds: number[], enabled = true) =>
    trpc.donations.getMultipleDonorStats.useQuery(
      { donorIds },
      {
        // Don't refetch automatically
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: enabled && donorIds.length > 0, // Only run the query if enabled and we have IDs
      }
    );

  // Get all donor IDs for bulk operations
  const getAllDonorIds = (filters?: {
    searchTerm?: string;
    state?: string;
    gender?: 'male' | 'female' | null;
    assignedToStaffId?: number | null;
    listId?: number;
    notInAnyList?: boolean;
    onlyResearched?: boolean;
  }) =>
    trpc.donors.getAllIds.useQuery(filters || {}, {
      // Don't refetch automatically
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      enabled: false, // Only run when manually triggered
    });

  // Get donor list count
  const getDonorListCount = (donorId: number) =>
    trpc.donors.countLists.useQuery(
      { id: donorId },
      {
        // Don't refetch automatically
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!donorId, // Only run the query if we have an ID
      }
    );

  // Mutation hooks
  const createMutation = trpc.donors.create.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
      toast.success('Donor created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create donor');
    },
  });

  const updateMutation = trpc.donors.update.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
      utils.donors.getByIds.invalidate();
      toast.success('Donor updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update donor');
    },
  });

  const deleteMutation = trpc.donors.delete.useMutation({
    onSuccess: (_, variables) => {
      utils.donors.list.invalidate();
      utils.donors.getByIds.invalidate();
      utils.lists.invalidate(); // Invalidate lists in case we removed from lists

      if (variables.deleteMode === 'fromList') {
        toast.success('Donor removed from list successfully');
      } else if (variables.deleteMode === 'fromAllLists') {
        toast.success('Donor removed from all lists successfully');
      } else {
        toast.success('Donor deleted successfully');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete donor');
    },
  });

  const bulkDeleteMutation = trpc.donors.bulkDelete.useMutation({
    onSuccess: (result) => {
      utils.donors.list.invalidate();
      utils.donors.getByIds.invalidate();

      if (result.success > 0 && result.failed === 0) {
        toast.success(
          `Successfully deleted ${result.success} donor${result.success === 1 ? '' : 's'}`
        );
      } else if (result.success > 0 && result.failed > 0) {
        toast.warning(
          `Deleted ${result.success} donors, but ${result.failed} failed. Check errors for details.`
        );
      } else {
        toast.error(`Failed to delete all ${result.failed} donors`);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete donors');
    },
  });

  // New mutations for analyze and update staff
  const analyzeDonorsMutation = trpc.analysis.analyzeDonors.useMutation({
    onSuccess: (data, variables) => {
      const singleDonorId = variables.donorIds.length === 1 ? variables.donorIds[0] : null;
      if (singleDonorId) {
        toast.success(`Analysis complete for donor ${singleDonorId}!`);
      } else {
        toast.success(
          `Batch donor analysis complete! Successful: ${
            data.results.filter((r) => r.status === 'success').length
          }, Failed: ${data.results.filter((r) => r.status !== 'success').length}`
        );
      }
      utils.donors.list.invalidate();
      utils.donors.getByIds.invalidate();
      logger.info("Invalidating queries with root key ['donors'] to refetch donor data.");
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      const singleDonorId = variables.donorIds.length === 1 ? variables.donorIds[0] : null;
      if (singleDonorId) {
        toast.error(`Failed to analyze donor ${singleDonorId}: ${error.message}`);
      } else {
        toast.error(`Batch analysis failed: ${error.message}`);
      }
      console.error('Error analyzing donors:', error);
    },
  });

  const updateDonorStaffMutation = trpc.donors.updateAssignedStaff.useMutation({
    onSuccess: (data, variables) => {
      toast.success(`Successfully assigned staff to donor ${variables.donorId}.`);
      utils.donors.list.invalidate();
      utils.donors.getByIds.invalidate();
      logger.info(
        "Invalidating queries with root key ['donors'] to refetch donor data after staff assignment."
      );
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to assign staff to donor ${variables.donorId}: ${error.message}`);
      console.error("Error updating donor's assigned staff:", error);
      logger.error(
        `Error updating donor ${variables.donorId} assigned staff to ${
          variables.staffId === null ? 'unassigned' : variables.staffId
        }: ${error.message}`
      );
    },
  });

  const bulkUpdateDonorStaffMutation = trpc.donors.bulkUpdateAssignedStaff.useMutation({
    onSuccess: (data, variables) => {
      toast.success(
        `Successfully assigned staff to ${data.updated} donor${data.updated !== 1 ? 's' : ''}.`
      );
      utils.donors.list.invalidate();
      utils.donors.getByIds.invalidate();
      logger.info(
        "Invalidating queries with root key ['donors'] to refetch donor data after bulk staff assignment."
      );
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to assign staff to donors: ${error.message}`);
      console.error("Error bulk updating donors' assigned staff:", error);
      logger.error(
        `Error bulk updating ${variables.donorIds.length} donors assigned staff to ${
          variables.staffId === null ? 'unassigned' : variables.staffId
        }: ${error.message}`
      );
    },
  });

  // Note mutations
  const addNoteMutation = trpc.donors.addNote.useMutation({
    onSuccess: (data, variables) => {
      toast.success('Note added successfully');
      // Invalidate the specific donor query to refetch with updated notes
      utils.donors.getByIds.invalidate({ ids: [variables.donorId] });
      logger.info(`Note added to donor ${variables.donorId}`);
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to add note: ${error.message}`);
      console.error('Error adding note to donor:', error);
      logger.error(`Error adding note to donor ${variables.donorId}: ${error.message}`);
    },
  });

  const editNoteMutation = trpc.donors.editNote.useMutation({
    onSuccess: (data, variables) => {
      toast.success('Note updated successfully');
      // Invalidate the specific donor query to refetch with updated notes
      utils.donors.getByIds.invalidate({ ids: [variables.donorId] });
      logger.info(`Note edited for donor ${variables.donorId}`);
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to update note: ${error.message}`);
      console.error('Error editing note for donor:', error);
      logger.error(`Error editing note for donor ${variables.donorId}: ${error.message}`);
    },
  });

  const deleteNoteMutation = trpc.donors.deleteNote.useMutation({
    onSuccess: (data, variables) => {
      toast.success('Note deleted successfully');
      // Invalidate the specific donor query to refetch with updated notes
      utils.donors.getByIds.invalidate({ ids: [variables.donorId] });
      logger.info(`Note deleted from donor ${variables.donorId}`);
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to delete note: ${error.message}`);
      console.error('Error deleting note from donor:', error);
      logger.error(`Error deleting note from donor ${variables.donorId}: ${error.message}`);
    },
  });

  /**
   * Create a new donor
   * @param input The donor data to create
   * @returns The created donor or null if creation failed
   */
  const createDonor = async (input: CreateDonorInput) => {
    try {
      return await createMutation.mutateAsync(input);
    } catch (error) {
      console.error('Failed to create donor:', error);
      return null;
    }
  };

  /**
   * Update an existing donor
   * @param input The donor data to update
   * @returns The updated donor or null if update failed
   */
  const updateDonor = async (input: UpdateDonorInput) => {
    try {
      return await updateMutation.mutateAsync(input);
    } catch (error) {
      console.error('Failed to update donor:', error);
      return null;
    }
  };

  /**
   * Delete a donor by ID with different deletion modes
   * @param id The ID of the donor to delete
   * @param options Optional deletion mode and list ID
   * @returns true if deletion was successful, false otherwise
   */
  const deleteDonor = async (
    id: number,
    options?: {
      deleteMode?: 'fromList' | 'fromAllLists' | 'entirely';
      listId?: number;
    }
  ) => {
    try {
      await deleteMutation.mutateAsync({
        id,
        deleteMode: options?.deleteMode,
        listId: options?.listId,
      });
      return true;
    } catch (error) {
      console.error('Failed to delete donor:', error);
      return false;
    }
  };

  /**
   * Delete multiple donors by IDs
   * @param ids Array of donor IDs to delete
   * @returns Bulk delete result with success/failure counts
   */
  const bulkDeleteDonors = async (ids: number[]) => {
    try {
      return await bulkDeleteMutation.mutateAsync({ ids });
    } catch (error) {
      console.error('Failed to bulk delete donors:', error);
      return null;
    }
  };

  /**
   * Analyze one or more donors
   * @param donorIds Array of donor IDs to analyze
   * @returns Promise that resolves when analysis is complete
   */
  const analyzeDonors = async (donorIds: string[]) => {
    try {
      return await analyzeDonorsMutation.mutateAsync({ donorIds });
    } catch (error) {
      console.error('Failed to analyze donors:', error);
      return null;
    }
  };

  /**
   * Update the assigned staff member for a donor
   * @param donorId The ID of the donor
   * @param staffId The ID of the staff member to assign, or null to unassign
   * @returns Promise that resolves when update is complete
   */
  const updateDonorStaff = async (donorId: string, staffId: string | null) => {
    try {
      await updateDonorStaffMutation.mutateAsync({
        donorId: parseInt(donorId, 10),
        staffId: staffId ? parseInt(staffId, 10) : null,
      });
      return true;
    } catch (error) {
      console.error('Failed to update donor staff:', error);
      return false;
    }
  };

  /**
   * Update the assigned staff member for multiple donors in bulk
   * @param donorIds Array of donor IDs to update
   * @param staffId The ID of the staff member to assign, or null to unassign
   * @returns Promise that resolves when update is complete
   */
  const bulkUpdateDonorStaff = async (donorIds: number[], staffId: number | null) => {
    try {
      const result = await bulkUpdateDonorStaffMutation.mutateAsync({
        donorIds,
        staffId,
      });
      return result;
    } catch (error) {
      console.error('Failed to bulk update donor staff:', error);
      return null;
    }
  };

  /**
   * Add a note to a donor
   * @param donorId The ID of the donor
   * @param content The note content
   * @returns The updated donor or null if failed
   */
  const addNote = async (donorId: number, content: string) => {
    try {
      return await addNoteMutation.mutateAsync({ donorId, content });
    } catch (error) {
      console.error('Failed to add note:', error);
      return null;
    }
  };

  /**
   * Edit an existing note for a donor
   * @param donorId The ID of the donor
   * @param noteIndex The index of the note to edit
   * @param content The new note content
   * @returns The updated donor or null if failed
   */
  const editNote = async (donorId: number, noteIndex: number, content: string) => {
    try {
      return await editNoteMutation.mutateAsync({ donorId, noteIndex, content });
    } catch (error) {
      console.error('Failed to edit note:', error);
      return null;
    }
  };

  /**
   * Delete a note from a donor
   * @param donorId The ID of the donor
   * @param noteIndex The index of the note to delete
   * @returns The updated donor or null if failed
   */
  const deleteNote = async (donorId: number, noteIndex: number) => {
    try {
      return await deleteNoteMutation.mutateAsync({ donorId, noteIndex });
    } catch (error) {
      console.error('Failed to delete note:', error);
      return null;
    }
  };

  return {
    // Query functions
    getDonorQuery,
    getDonorsQuery,
    listDonors,
    listDonorsForCommunication,
    getDonorStats,
    getMultipleDonorStats,
    getAllDonorIds,
    getDonorListCount,

    // Mutation functions
    createDonor,
    updateDonor,
    deleteDonor,
    bulkDeleteDonors,
    analyzeDonors,
    updateDonorStaff,
    bulkUpdateDonorStaff,
    addNote,
    editNote,
    deleteNote,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isAnalyzing: analyzeDonorsMutation.isPending,
    isUpdatingStaff: updateDonorStaffMutation.isPending,
    isBulkUpdatingStaff: bulkUpdateDonorStaffMutation.isPending,
    isAddingNote: addNoteMutation.isPending,
    isEditingNote: editNoteMutation.isPending,
    isDeletingNote: deleteNoteMutation.isPending,

    // Mutation results
    createResult: createMutation.data,
    updateResult: updateMutation.data,
    bulkDeleteResult: bulkDeleteMutation.data,
    analyzeResult: analyzeDonorsMutation.data,
  };
}
