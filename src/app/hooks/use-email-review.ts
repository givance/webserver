'use client';

import { trpc } from '@/app/lib/trpc/client';

/**
 * Hook for reviewing generated emails
 */
export function useEmailReview() {
  const utils = trpc.useUtils();

  // Mutation for reviewing emails
  const reviewEmails = trpc.emailReview.reviewEmails.useMutation({
    onSuccess: (data) => {
      console.log('[useEmailReview] Email review completed:', data);

      // Invalidate session cache to ensure frontend gets updated emails
      // This is important because refinement may have updated email content
      console.log('[useEmailReview] Invalidating session cache...');
      utils.communications.campaigns.getSession.invalidate();

      // Also invalidate signature queries since email content may have been refined
      console.log('[useEmailReview] Invalidating signature caches...');
      utils.emailCampaigns.getPlainTextEmailWithSignature.invalidate();
      utils.emailCampaigns.getEmailWithSignature.invalidate();

      console.log('[useEmailReview] Cache invalidation completed');
    },
    onError: (error) => {
      console.error('[useEmailReview] Error reviewing emails:', error);
    },
  });

  return {
    reviewEmails: reviewEmails.mutateAsync,
    isReviewing: reviewEmails.isPending,
  };
}
