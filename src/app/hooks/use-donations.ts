'use client';

import { trpc } from '@/app/lib/trpc/client';
import type { inferProcedureInput, inferProcedureOutput } from '@trpc/server';
import type { AppRouter } from '@/app/api/trpc/routers/_app';
import type { DonationWithDetails } from '@/app/lib/data/donations';
import { toast } from 'sonner';
import {
  STANDARD_QUERY_OPTIONS,
  createConditionalQueryOptions,
  wrapMutationAsync,
  wrapMutationAsyncBoolean,
  createErrorHandler,
  createCacheInvalidators,
  createCrossResourceInvalidators,
} from './utils';

type DonationOutput = inferProcedureOutput<AppRouter['donations']['getById']>;
type ListDonationsInput = inferProcedureInput<AppRouter['donations']['list']>;
type CreateDonationInput = inferProcedureInput<AppRouter['donations']['create']>;
type UpdateDonationInput = inferProcedureInput<AppRouter['donations']['update']>;

interface ListDonationsOptions {
  donorId?: number;
  projectId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'date' | 'amount' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
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
  const cacheInvalidators = createCacheInvalidators(utils);
  const crossResourceInvalidators = createCrossResourceInvalidators(utils);

  // Query hooks with consistent options
  const listDonations = (params: ListDonationsInput = {}) => {
    return trpc.donations.list.useQuery(params, STANDARD_QUERY_OPTIONS);
  };

  const getDonationById = (id: number) => {
    return trpc.donations.getById.useQuery({ id }, createConditionalQueryOptions(!!id));
  };

  const getDonorStats = (donorId: number) => {
    return trpc.donations.getDonorStats.useQuery(
      { donorId },
      createConditionalQueryOptions(!!donorId)
    );
  };

  // Mutation hooks with consistent error handling and invalidation
  const createMutation = trpc.donations.create.useMutation({
    onSuccess: (data) => {
      cacheInvalidators.invalidateResource('donations');
      if (data.donorId) {
        crossResourceInvalidators.invalidateDonorRelated(data.donorId);
      }
      toast.success('Donation created successfully');
    },
    onError: createErrorHandler('create donation'),
  });

  const updateMutation = trpc.donations.update.useMutation({
    onSuccess: (data) => {
      cacheInvalidators.invalidateResource('donations');
      if (data?.donorId) {
        crossResourceInvalidators.invalidateDonorRelated(data.donorId);
      }
      toast.success('Donation updated successfully');
    },
    onError: createErrorHandler('update donation'),
  });

  const deleteMutation = trpc.donations.delete.useMutation({
    onSuccess: (_, variables) => {
      cacheInvalidators.invalidateResource('donations');
      // We need to also invalidate donor stats since a donation was deleted
      utils.donations.getDonorStats.invalidate();
      toast.success('Donation deleted successfully');
    },
    onError: createErrorHandler('delete donation'),
  });

  /**
   * Create a new donation
   * @param input The donation data to create
   * @returns The created donation or null if creation failed
   */
  const createDonation = async (input: CreateDonationInput) => {
    return wrapMutationAsync(createMutation.mutateAsync, input, 'create donation');
  };

  /**
   * Update an existing donation
   * @param input The donation data to update
   * @returns The updated donation or null if update failed
   */
  const updateDonation = async (input: UpdateDonationInput) => {
    return wrapMutationAsync(updateMutation.mutateAsync, input, 'update donation');
  };

  /**
   * Delete a donation by ID
   * @param id The ID of the donation to delete
   * @returns true if deletion was successful, false otherwise
   */
  const deleteDonation = async (id: number) => {
    return wrapMutationAsyncBoolean(deleteMutation.mutateAsync, { id }, 'delete donation');
  };

  return {
    // Query functions
    listDonations,
    getDonationById,
    getDonorStats,

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
    deleteResult: deleteMutation.data,

    // Direct access to mutations if needed
    mutations: {
      createMutation,
      updateMutation,
      deleteMutation,
    },
  };
}
