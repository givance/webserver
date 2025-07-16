import { trpc } from '@/app/lib/trpc/client';

export function useReviewEmails() {
  return trpc.emailReview.reviewEmails.useMutation();
}
