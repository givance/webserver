"use client";

import { trpc } from "../lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";

type StaffOutput = inferProcedureOutput<AppRouter["staff"]["getById"]>;
type ListStaffInput = inferProcedureInput<AppRouter["staff"]["list"]>;
type CreateStaffInput = inferProcedureInput<AppRouter["staff"]["create"]>;
type UpdateStaffInput = inferProcedureInput<AppRouter["staff"]["update"]>;

/**
 * Hook for managing staff members through the tRPC API
 * Provides methods for creating, reading, updating, and deleting staff members
 */
export function useStaff() {
  const utils = trpc.useUtils();

  // Query hooks
  const listStaff = trpc.staff.list.useQuery;
  const getStaffById = trpc.staff.getById.useQuery;
  const getAssignedDonors = trpc.staff.getAssignedDonors.useQuery;
  const getPrimaryStaff = trpc.staff.getPrimary.useQuery;

  // Mutation hooks
  const createMutation = trpc.staff.create.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
    },
  });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
    },
  });

  const deleteMutation = trpc.staff.delete.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
    },
  });

  const disconnectStaffGmailMutation = trpc.staffGmail.disconnectStaffGmail.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
    },
  });

  const setPrimaryMutation = trpc.staff.setPrimary.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      utils.staff.getPrimary.invalidate();
    },
  });

  const unsetPrimaryMutation = trpc.staff.unsetPrimary.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      utils.staff.getPrimary.invalidate();
    },
  });

  /**
   * Create a new staff member
   * @param input The staff member data to create
   * @returns The created staff member or null if creation failed
   */
  const createStaff = async (input: CreateStaffInput) => {
    try {
      return await createMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to create staff member:", error);
      return null;
    }
  };

  /**
   * Update an existing staff member
   * @param input The staff member data to update
   * @returns The updated staff member or null if update failed
   */
  const updateStaff = async (input: UpdateStaffInput) => {
    try {
      return await updateMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to update staff member:", error);
      return null;
    }
  };

  /**
   * Delete a staff member by ID
   * @param id The ID of the staff member to delete
   * @returns true if deletion was successful, false otherwise
   */
  const deleteStaff = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      return true;
    } catch (error) {
      console.error("Failed to delete staff member:", error);
      return false;
    }
  };

  /**
   * Disconnect Gmail account for a staff member
   * @param staffId The ID of the staff member to disconnect Gmail from
   * @returns true if disconnect was successful, false otherwise
   */
  const disconnectStaffGmail = async (staffId: number) => {
    try {
      await disconnectStaffGmailMutation.mutateAsync({ staffId });
      return true;
    } catch (error) {
      console.error("Failed to disconnect staff Gmail:", error);
      return false;
    }
  };

  /**
   * Set a staff member as primary
   * @param id The ID of the staff member to set as primary
   * @returns The updated staff member or null if update failed
   */
  const setPrimary = async (id: number) => {
    try {
      return await setPrimaryMutation.mutateAsync({ id });
    } catch (error) {
      console.error("Failed to set primary staff:", error);
      return null;
    }
  };

  /**
   * Unset a staff member as primary
   * @param id The ID of the staff member to unset as primary
   * @returns The updated staff member or null if update failed
   */
  const unsetPrimary = async (id: number) => {
    try {
      return await unsetPrimaryMutation.mutateAsync({ id });
    } catch (error) {
      console.error("Failed to unset primary staff:", error);
      return null;
    }
  };

  return {
    // Query functions
    listStaff,
    getStaffById,
    getAssignedDonors,
    getPrimaryStaff,

    // Mutation functions
    createStaff,
    updateStaff,
    deleteStaff,
    disconnectStaffGmail,
    setPrimary,
    unsetPrimary,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDisconnecting: disconnectStaffGmailMutation.isPending,
    isSettingPrimary: setPrimaryMutation.isPending,
    isUnsettingPrimary: unsetPrimaryMutation.isPending,

    // Mutation results
    createResult: createMutation.data,
    updateResult: updateMutation.data,
  };
}
