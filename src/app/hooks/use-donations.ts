"use client";

import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import type { DonationWithDetails } from "@/app/lib/data/donations";

type DonationOutput = inferProcedureOutput<AppRouter["donations"]["getById"]>;
type ListDonationsInput = inferProcedureInput<AppRouter["donations"]["list"]>;
type CreateDonationInput = inferProcedureInput<AppRouter["donations"]["create"]>;
type UpdateDonationInput = inferProcedureInput<AppRouter["donations"]["update"]>;

interface ListDonationsOptions {
  donorId?: number;
  projectId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  orderBy?: "date" | "amount" | "createdAt";
  orderDirection?: "asc" | "desc";
  includeDonor?: boolean;
  includeProject?: boolean;
}

interface ListDonationsResponse {
  donations: DonationWithDetails[];
  totalCount: number;
}

/**
 * Hook for managing donations through the tRPC API
 * Provides methods for creating, reading, updating, and deleting donations
 */
export function useDonations() {
  const utils = trpc.useUtils();

  // Query hooks
  const getDonationById = trpc.donations.getById.useQuery;
  const list = trpc.donations.list.useQuery;

  // Mutation hooks
  const createMutation = trpc.donations.create.useMutation({
    onSuccess: () => {
      utils.donations.list.invalidate();
    },
  });

  const updateMutation = trpc.donations.update.useMutation({
    onSuccess: () => {
      utils.donations.list.invalidate();
    },
  });

  const deleteMutation = trpc.donations.delete.useMutation({
    onSuccess: () => {
      utils.donations.list.invalidate();
    },
  });

  /**
   * Create a new donation
   * @param input The donation data to create
   * @returns The created donation or null if creation failed
   */
  const createDonation = async (input: CreateDonationInput) => {
    try {
      return await createMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to create donation:", error);
      return null;
    }
  };

  /**
   * Update an existing donation
   * @param input The donation data to update
   * @returns The updated donation or null if update failed
   */
  const updateDonation = async (input: UpdateDonationInput) => {
    try {
      return await updateMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to update donation:", error);
      return null;
    }
  };

  /**
   * Delete a donation by ID
   * @param id The ID of the donation to delete
   * @returns true if deletion was successful, false otherwise
   */
  const deleteDonation = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      return true;
    } catch (error) {
      console.error("Failed to delete donation:", error);
      return false;
    }
  };

  return {
    // Query functions
    getDonationById,
    list,

    // Mutation functions
    createDonation,
    updateDonation,
    deleteDonation,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Mutation results
    createResult: createMutation.data,
    updateResult: updateMutation.data,
  };
}
