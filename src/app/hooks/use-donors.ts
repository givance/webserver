"use client";

import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import { toast } from "sonner";
import { logger } from "@/app/lib/logger";
import type { TRPCClientErrorLike } from "@trpc/client";

type DonorOutput = inferProcedureOutput<AppRouter["donors"]["getById"]>;
type ListDonorsInput = inferProcedureInput<AppRouter["donors"]["list"]>;
type CreateDonorInput = inferProcedureInput<AppRouter["donors"]["create"]>;
type UpdateDonorInput = inferProcedureInput<AppRouter["donors"]["update"]>;

/**
 * Hook for managing donors through the tRPC API
 * Provides methods for creating, reading, updating, and deleting donors
 */
export function useDonors() {
  const utils = trpc.useUtils();

  // Query hooks
  const listDonors = (params: {
    searchTerm?: string;
    gender?: "male" | "female" | null;
    onlyResearched?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: "firstName" | "lastName" | "email" | "createdAt" | "totalDonated";
    orderDirection?: "asc" | "desc";
  }) => {
    return trpc.donors.list.useQuery(params, {
      // Don't refetch automatically
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    });
  };

  // Optimized query for communication features
  const listDonorsForCommunication = (params: {
    searchTerm?: string;
    limit?: number;
    offset?: number;
    orderBy?: "firstName" | "lastName" | "email" | "createdAt";
    orderDirection?: "asc" | "desc";
  }) => {
    return trpc.donors.listForCommunication.useQuery(params, {
      // Don't refetch automatically
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    });
  };

  // Get donor query hook
  const getDonorQuery = (id: number) =>
    trpc.donors.getById.useQuery(
      { id },
      {
        // Don't refetch automatically
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        enabled: !!id, // Only run the query if we have an ID
      }
    );

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
  const getAllDonorIds = () =>
    trpc.donors.getAllIds.useQuery(undefined, {
      // Don't refetch automatically
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    });

  // Mutation hooks
  const createMutation = trpc.donors.create.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
      toast.success("Donor created successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create donor");
    },
  });

  const updateMutation = trpc.donors.update.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
      utils.donors.getById.invalidate();
      toast.success("Donor updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update donor");
    },
  });

  const deleteMutation = trpc.donors.delete.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
      utils.donors.getById.invalidate();
      toast.success("Donor deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete donor");
    },
  });

  const bulkDeleteMutation = trpc.donors.bulkDelete.useMutation({
    onSuccess: (result) => {
      utils.donors.list.invalidate();
      utils.donors.getById.invalidate();

      if (result.success > 0 && result.failed === 0) {
        toast.success(`Successfully deleted ${result.success} donor${result.success === 1 ? "" : "s"}`);
      } else if (result.success > 0 && result.failed > 0) {
        toast.warning(`Deleted ${result.success} donors, but ${result.failed} failed. Check errors for details.`);
      } else {
        toast.error(`Failed to delete all ${result.failed} donors`);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete donors");
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
            data.results.filter((r) => r.status === "success").length
          }, Failed: ${data.results.filter((r) => r.status !== "success").length}`
        );
      }
      utils.donors.list.invalidate();
      utils.donors.getById.invalidate();
      logger.info("Invalidating queries with root key ['donors'] to refetch donor data.");
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      const singleDonorId = variables.donorIds.length === 1 ? variables.donorIds[0] : null;
      if (singleDonorId) {
        toast.error(`Failed to analyze donor ${singleDonorId}: ${error.message}`);
      } else {
        toast.error(`Batch analysis failed: ${error.message}`);
      }
      console.error("Error analyzing donors:", error);
    },
  });

  const updateDonorStaffMutation = trpc.donors.updateAssignedStaff.useMutation({
    onSuccess: (data, variables) => {
      toast.success(`Successfully assigned staff to donor ${variables.donorId}.`);
      utils.donors.list.invalidate();
      utils.donors.getById.invalidate();
      logger.info("Invalidating queries with root key ['donors'] to refetch donor data after staff assignment.");
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to assign staff to donor ${variables.donorId}: ${error.message}`);
      console.error("Error updating donor's assigned staff:", error);
      logger.error(
        `Error updating donor ${variables.donorId} assigned staff to ${
          variables.staffId === null ? "unassigned" : variables.staffId
        }: ${error.message}`
      );
    },
  });

  const bulkUpdateDonorStaffMutation = trpc.donors.bulkUpdateAssignedStaff.useMutation({
    onSuccess: (data, variables) => {
      toast.success(`Successfully assigned staff to ${data.updated} donor${data.updated !== 1 ? "s" : ""}.`);
      utils.donors.list.invalidate();
      utils.donors.getById.invalidate();
      logger.info("Invalidating queries with root key ['donors'] to refetch donor data after bulk staff assignment.");
    },
    onError: (error: TRPCClientErrorLike<AppRouter>, variables) => {
      toast.error(`Failed to assign staff to donors: ${error.message}`);
      console.error("Error bulk updating donors' assigned staff:", error);
      logger.error(
        `Error bulk updating ${variables.donorIds.length} donors assigned staff to ${
          variables.staffId === null ? "unassigned" : variables.staffId
        }: ${error.message}`
      );
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
      console.error("Failed to create donor:", error);
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
      console.error("Failed to update donor:", error);
      return null;
    }
  };

  /**
   * Delete a donor by ID
   * @param id The ID of the donor to delete
   * @returns true if deletion was successful, false otherwise
   */
  const deleteDonor = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      return true;
    } catch (error) {
      console.error("Failed to delete donor:", error);
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
      console.error("Failed to bulk delete donors:", error);
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
      console.error("Failed to analyze donors:", error);
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
      console.error("Failed to update donor staff:", error);
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
      console.error("Failed to bulk update donor staff:", error);
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

    // Mutation functions
    createDonor,
    updateDonor,
    deleteDonor,
    bulkDeleteDonors,
    analyzeDonors,
    updateDonorStaff,
    bulkUpdateDonorStaff,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isAnalyzing: analyzeDonorsMutation.isPending,
    isUpdatingStaff: updateDonorStaffMutation.isPending,
    isBulkUpdatingStaff: bulkUpdateDonorStaffMutation.isPending,

    // Mutation results
    createResult: createMutation.data,
    updateResult: updateMutation.data,
    bulkDeleteResult: bulkDeleteMutation.data,
    analyzeResult: analyzeDonorsMutation.data,
  };
}
