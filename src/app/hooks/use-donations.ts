"use client";

import { trpc } from "../lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";

type DonationOutput = inferProcedureOutput<AppRouter["donations"]["getById"]>;
type ListDonationsInput = inferProcedureInput<AppRouter["donations"]["list"]>;
type CreateDonationInput = inferProcedureInput<AppRouter["donations"]["create"]>;
type UpdateDonationInput = inferProcedureInput<AppRouter["donations"]["update"]>;

/**
 * Hook for managing donations through the tRPC API
 * Provides methods for creating, reading, updating, and deleting donations
 */
export function useDonations() {
  const utils = trpc.useUtils();

  // Query hooks
  const listDonations = trpc.donations.list.useQuery;
  const getDonationById = trpc.donations.getById.useQuery;

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
    listDonations,
    getDonationById,

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
