'use client';

import { trpc } from '@/app/lib/trpc/client';
import { toast } from 'sonner';
import { useCallback } from 'react';
import type { inferProcedureInput, inferProcedureOutput } from '@trpc/server';
import type { AppRouter } from '@/app/api/trpc/routers/_app';

export interface UseEmailReviewOptions {
  onReviewSuccess?: (action: 'approve' | 'reject', count: number) => void;
  onReviewError?: (error: Error) => void;
}

// Type exports
type ListPendingEmailsInput = inferProcedureInput<AppRouter['emailReview']['listPendingEmails']>;
type ListPendingEmailsOutput = inferProcedureOutput<AppRouter['emailReview']['listPendingEmails']>;
type GetEmailChatHistoryOutput = inferProcedureOutput<
  AppRouter['emailReview']['getEmailChatHistory']
>;

export type PendingEmailWithDetails = ListPendingEmailsOutput['emails'][0];
export type EmailChatHistory = GetEmailChatHistoryOutput[0];

export function useEmailReview(options?: UseEmailReviewOptions) {
  const utils = trpc.useContext();

  // Mutations
  const bulkReviewMutation = trpc.emailReview.bulkReviewEmails.useMutation({
    onSuccess: (data) => {
      const actionText = data.action === 'approve' ? 'approved' : 'rejected';
      toast.success(
        `Successfully ${actionText} ${data.updatedCount} email${data.updatedCount > 1 ? 's' : ''}`
      );

      // Invalidate relevant queries
      utils.emailReview.listPendingEmails.invalidate();
      utils.emailReview.getPendingReviewStats.invalidate();
      utils.emailCampaigns.listCampaigns.invalidate();

      options?.onReviewSuccess?.(data.action, data.updatedCount);
    },
    onError: (error) => {
      toast.error('Failed to review emails', {
        description: error.message,
      });
      options?.onReviewError?.(new Error(error.message));
    },
  });

  // Helper functions
  const bulkApprove = useCallback(
    async (emailIds: number[], reason?: string) => {
      return bulkReviewMutation.mutateAsync({
        emailIds,
        action: 'approve',
        reason,
      });
    },
    [bulkReviewMutation]
  );

  const bulkReject = useCallback(
    async (emailIds: number[], reason?: string) => {
      return bulkReviewMutation.mutateAsync({
        emailIds,
        action: 'reject',
        reason,
      });
    },
    [bulkReviewMutation]
  );

  return {
    // Mutations
    bulkReviewMutation,
    bulkApprove,
    bulkReject,

    // Loading states
    isReviewing: bulkReviewMutation.isPending,
  };
}

// Hook for paginated pending emails with search
export function usePendingEmailsList(options?: ListPendingEmailsInput) {
  return trpc.emailReview.listPendingEmails.useQuery(options || {});
}

// Hook for email details with chat history
export function useEmailDetailsWithHistory(emailId: number, enabled = true) {
  return trpc.emailReview.getEmailDetails.useQuery(
    {
      emailId,
      includeChatHistory: true,
    },
    {
      enabled: enabled && !!emailId,
    }
  );
}

// Hook for bulk email chat history
export function useBulkEmailChatHistory(emailIds: number[], enabled = true) {
  return trpc.emailReview.getEmailChatHistory.useQuery(
    { emailIds },
    {
      enabled: enabled && emailIds.length > 0,
    }
  );
}

// Hook for pending review statistics
export function useEmailReviewStats() {
  return trpc.emailReview.getPendingReviewStats.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
