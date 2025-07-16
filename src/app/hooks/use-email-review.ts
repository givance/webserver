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
      console.log('Email review completed:', data);
    },
    onError: (error) => {
      console.error('Error reviewing emails:', error);
    },
  });

  return {
    reviewEmails: reviewEmails.mutateAsync,
    isReviewing: reviewEmails.isPending,
  };
}
