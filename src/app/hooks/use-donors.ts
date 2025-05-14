"use client";

import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";

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
  const listDonors = (params: { searchTerm?: string; limit?: number; offset?: number }) => {
    return trpc.donors.list.useQuery(params, {
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

  // Mutation hooks
  const createMutation = trpc.donors.create.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
    },
  });

  const updateMutation = trpc.donors.update.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
    },
  });

  const deleteMutation = trpc.donors.delete.useMutation({
    onSuccess: () => {
      utils.donors.list.invalidate();
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

  return {
    // Query functions
    getDonorQuery,
    listDonors,

    // Mutation functions
    createDonor,
    updateDonor,
    deleteDonor,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Mutation results
    createResult: createMutation.data,
    updateResult: updateMutation.data,
  };
}
