'use client';

import { useMemo } from 'react';
import { trpc } from '../lib/trpc/client';
import type { inferProcedureInput, inferProcedureOutput } from '@trpc/server';
import type { AppRouter } from '@/app/api/trpc/routers/_app';
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
import { useOrganization } from '@/app/hooks/use-organization';

type StaffOutput = inferProcedureOutput<AppRouter['staff']['getByIds']>[0];
type ListStaffInput = inferProcedureInput<AppRouter['staff']['list']>;
type CreateStaffInput = inferProcedureInput<AppRouter['staff']['create']>;
type UpdateStaffInput = inferProcedureInput<AppRouter['staff']['update']>;
type CreateEmailExampleInput = inferProcedureInput<AppRouter['staff']['createEmailExample']>;
type UpdateEmailExampleInput = inferProcedureInput<AppRouter['staff']['updateEmailExample']>;
type UpdateSignatureInput = inferProcedureInput<AppRouter['staff']['updateSignature']>;

// Simplified staff member interface for dropdown/selection use cases
export interface StaffMember {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
}

/**
 * Hook for managing staff members through the tRPC API
 * Provides methods for creating, reading, updating, and deleting staff members
 */
export function useStaff() {
  const utils = trpc.useUtils();
  const cacheInvalidators = createCacheInvalidators(utils);
  const crossResourceInvalidators = createCrossResourceInvalidators(utils);
  const { getOrganization } = useOrganization();
  const { data: organizationData } = getOrganization();

  // Query hooks with consistent options
  const listStaff = (params: ListStaffInput = {}) => {
    return trpc.staff.list.useQuery(params, STANDARD_QUERY_OPTIONS);
  };

  const getStaffById = (id: number) => {
    const query = trpc.staff.getByIds.useQuery({ ids: [id] }, createConditionalQueryOptions(!!id));

    // Transform the response to return a single staff member instead of an array
    return {
      ...query,
      data: query.data?.[0],
    };
  };

  const getStaffByIds = (ids: number[]) => {
    return trpc.staff.getByIds.useQuery({ ids }, createConditionalQueryOptions(ids.length > 0));
  };

  const getAssignedDonors = (staffId: number) => {
    return trpc.staff.getAssignedDonors.useQuery(
      { id: staffId },
      createConditionalQueryOptions(!!staffId)
    );
  };

  const getPrimaryStaff = () => {
    return trpc.staff.getPrimary.useQuery(undefined, STANDARD_QUERY_OPTIONS);
  };

  const listEmailExamples = (staffId: number) => {
    return trpc.staff.listEmailExamples.useQuery(
      { id: staffId },
      createConditionalQueryOptions(!!staffId)
    );
  };

  const getEmailExample = (id: number) => {
    return trpc.staff.getEmailExample.useQuery({ id }, createConditionalQueryOptions(!!id));
  };

  // Simplified staff members query for dropdowns
  const staffMembersQuery = trpc.staff.list.useQuery(
    {},
    createConditionalQueryOptions(!!organizationData?.id)
  );

  const staffMembers = useMemo(
    () =>
      staffMembersQuery.data?.staff?.map((s) => ({
        id: s.id.toString(),
        name: `${s.firstName} ${s.lastName}`,
        firstName: s.firstName,
        lastName: s.lastName,
      })) || [],
    [staffMembersQuery.data?.staff]
  );

  const getStaffMembers = () => {
    return {
      staffMembers,
      isLoading: staffMembersQuery.isLoading,
      error: staffMembersQuery.error as Error | null,
    };
  };

  // Mutation hooks with consistent error handling and invalidation
  const createMutation = trpc.staff.create.useMutation({
    onSuccess: (data) => {
      crossResourceInvalidators.invalidateStaffRelated();
      toast.success(`Staff member ${data.firstName} ${data.lastName} created successfully`);
    },
    onError: createErrorHandler('create staff member'),
  });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: (data) => {
      crossResourceInvalidators.invalidateStaffRelated(data.id);
      toast.success(`Staff member ${data.firstName} ${data.lastName} updated successfully`);
    },
    onError: createErrorHandler('update staff member'),
  });

  const deleteMutation = trpc.staff.delete.useMutation({
    onSuccess: () => {
      crossResourceInvalidators.invalidateStaffRelated();
      // Also invalidate donors since staff assignments may have changed
      utils.donors.list.invalidate();
      toast.success('Staff member deleted successfully');
    },
    onError: createErrorHandler('delete staff member'),
  });

  const disconnectStaffGmailMutation = trpc.staffGmail.disconnectStaffGmail.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      toast.success('Gmail account disconnected successfully');
    },
    onError: createErrorHandler('disconnect Gmail account'),
  });

  const disconnectStaffMicrosoftMutation = trpc.staffMicrosoft.disconnectStaffMicrosoft.useMutation(
    {
      onSuccess: () => {
        utils.staff.list.invalidate();
        toast.success('Microsoft account disconnected successfully');
      },
      onError: createErrorHandler('disconnect Microsoft account'),
    }
  );

  const setPrimaryMutation = trpc.staff.setPrimary.useMutation({
    onSuccess: (data) => {
      crossResourceInvalidators.invalidateStaffRelated();
      toast.success(`${data.firstName} ${data.lastName} set as primary staff member`);
    },
    onError: createErrorHandler('set primary staff member'),
  });

  const unsetPrimaryMutation = trpc.staff.unsetPrimary.useMutation({
    onSuccess: (data) => {
      crossResourceInvalidators.invalidateStaffRelated();
      toast.success(`${data.firstName} ${data.lastName} is no longer primary staff member`);
    },
    onError: createErrorHandler('unset primary staff member'),
  });

  const updateSignatureMutation = trpc.staff.updateSignature.useMutation({
    onSuccess: (data) => {
      crossResourceInvalidators.invalidateStaffRelated(data.id);
      toast.success('Signature updated successfully');
    },
    onError: createErrorHandler('update signature'),
  });

  // Email example mutations
  const createEmailExampleMutation = trpc.staff.createEmailExample.useMutation({
    onSuccess: (_, variables) => {
      utils.staff.listEmailExamples.invalidate({ id: variables.staffId });
      toast.success('Email example created successfully');
    },
    onError: createErrorHandler('create email example'),
  });

  const updateEmailExampleMutation = trpc.staff.updateEmailExample.useMutation({
    onSuccess: () => {
      utils.staff.listEmailExamples.invalidate();
      toast.success('Email example updated successfully');
    },
    onError: createErrorHandler('update email example'),
  });

  const deleteEmailExampleMutation = trpc.staff.deleteEmailExample.useMutation({
    onSuccess: () => {
      utils.staff.listEmailExamples.invalidate();
      toast.success('Email example deleted successfully');
    },
    onError: createErrorHandler('delete email example'),
  });

  /**
   * Create a new staff member
   * @param input The staff member data to create
   * @returns The created staff member or null if creation failed
   */
  const createStaff = async (input: CreateStaffInput) => {
    return wrapMutationAsync(createMutation.mutateAsync, input, 'create staff member');
  };

  /**
   * Update an existing staff member
   * @param input The staff member data to update
   * @returns The updated staff member or null if update failed
   */
  const updateStaff = async (input: UpdateStaffInput) => {
    return wrapMutationAsync(updateMutation.mutateAsync, input, 'update staff member');
  };

  /**
   * Delete a staff member by ID
   * @param id The ID of the staff member to delete
   * @returns true if deletion was successful, false otherwise
   */
  const deleteStaff = async (id: number) => {
    return wrapMutationAsyncBoolean(deleteMutation.mutateAsync, { id }, 'delete staff member');
  };

  /**
   * Disconnect Gmail account for a staff member
   * @param staffId The ID of the staff member to disconnect Gmail from
   * @returns true if disconnect was successful, false otherwise
   */
  const disconnectStaffGmail = async (staffId: number) => {
    return wrapMutationAsyncBoolean(
      disconnectStaffGmailMutation.mutateAsync,
      { staffId },
      'disconnect staff Gmail'
    );
  };

  /**
   * Disconnect Microsoft account for a staff member
   * @param staffId The ID of the staff member to disconnect Microsoft from
   * @returns true if disconnect was successful, false otherwise
   */
  const disconnectStaffMicrosoft = async (staffId: number) => {
    return wrapMutationAsyncBoolean(
      disconnectStaffMicrosoftMutation.mutateAsync,
      { staffId },
      'disconnect staff Microsoft'
    );
  };

  /**
   * Set a staff member as primary
   * @param id The ID of the staff member to set as primary
   * @returns The updated staff member or null if update failed
   */
  const setPrimary = async (id: number) => {
    return wrapMutationAsync(setPrimaryMutation.mutateAsync, { id }, 'set primary staff');
  };

  /**
   * Unset a staff member as primary
   * @param id The ID of the staff member to unset as primary
   * @returns The updated staff member or null if update failed
   */
  const unsetPrimary = async (id: number) => {
    return wrapMutationAsync(unsetPrimaryMutation.mutateAsync, { id }, 'unset primary staff');
  };

  /**
   * Update a staff member's email signature
   * @param input The signature update data
   * @returns The updated staff member or null if update failed
   */
  const updateSignature = async (input: UpdateSignatureInput) => {
    return wrapMutationAsync(updateSignatureMutation.mutateAsync, input, 'update signature');
  };

  /**
   * Create a new email example for a staff member
   * @param input The email example data to create
   * @returns The created email example or null if creation failed
   */
  const createEmailExample = async (input: CreateEmailExampleInput) => {
    return wrapMutationAsync(createEmailExampleMutation.mutateAsync, input, 'create email example');
  };

  /**
   * Update an existing email example
   * @param input The email example data to update
   * @returns The updated email example or null if update failed
   */
  const updateEmailExample = async (input: UpdateEmailExampleInput) => {
    return wrapMutationAsync(updateEmailExampleMutation.mutateAsync, input, 'update email example');
  };

  /**
   * Delete an email example by ID
   * @param id The ID of the email example to delete
   * @returns true if deletion was successful, false otherwise
   */
  const deleteEmailExample = async (id: number) => {
    return wrapMutationAsyncBoolean(
      deleteEmailExampleMutation.mutateAsync,
      { id },
      'delete email example'
    );
  };

  return {
    // Query functions
    listStaff,
    getStaffById,
    getStaffByIds,
    getAssignedDonors,
    getPrimaryStaff,
    listEmailExamples,
    getEmailExample,
    getStaffMembers, // Simplified query for dropdowns

    // Mutation functions
    createStaff,
    updateStaff,
    deleteStaff,
    disconnectStaffGmail,
    disconnectStaffMicrosoft,
    setPrimary,
    unsetPrimary,
    updateSignature,
    createEmailExample,
    updateEmailExample,
    deleteEmailExample,

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDisconnecting:
      disconnectStaffGmailMutation.isPending || disconnectStaffMicrosoftMutation.isPending,
    isSettingPrimary: setPrimaryMutation.isPending,
    isUnsettingPrimary: unsetPrimaryMutation.isPending,
    isUpdatingSignature: updateSignatureMutation.isPending,
    isCreatingEmailExample: createEmailExampleMutation.isPending,
    isUpdatingEmailExample: updateEmailExampleMutation.isPending,
    isDeletingEmailExample: deleteEmailExampleMutation.isPending,

    // Mutation results
    createResult: createMutation.data,
    updateResult: updateMutation.data,
    deleteResult: deleteMutation.data,

    // Direct access to mutations if needed
    mutations: {
      createMutation,
      updateMutation,
      deleteMutation,
      disconnectStaffGmailMutation,
      disconnectStaffMicrosoftMutation,
      setPrimaryMutation,
      unsetPrimaryMutation,
      updateSignatureMutation,
      createEmailExampleMutation,
      updateEmailExampleMutation,
      deleteEmailExampleMutation,
    },

    // Utility function to refresh staff list
    refreshStaff: () => {
      utils.staff.list.invalidate();
    },
  };
}
