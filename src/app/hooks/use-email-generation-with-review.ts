'use client';

import { useEffect, useState } from 'react';
import { useCommunications } from './use-communications';
import { useEmailReview } from './use-email-review';

interface UseEmailGenerationWithReviewProps {
  sessionId?: string;
  onReviewComplete?: (result: any) => void;
}

export function useEmailGenerationWithReview({
  sessionId,
  onReviewComplete,
}: UseEmailGenerationWithReviewProps) {
  const { getSession } = useCommunications();
  const { reviewEmails } = useEmailReview();
  const [shouldReview, setShouldReview] = useState(false);
  const [reviewTrigger, setReviewTrigger] = useState(0);

  // Watch for session data and review emails when triggered
  const { data: sessionData } = getSession(
    { sessionId: sessionId! },
    {
      enabled: !!sessionId && shouldReview,
      refetchInterval: false,
    }
  );

  useEffect(() => {
    if (shouldReview && sessionData?.emails) {
      const emailIds = sessionData.emails
        .map((email: any) => email.id)
        .filter((id: any) => id !== undefined);

      if (emailIds.length > 0) {
        console.log('Calling email reviewer for', emailIds.length, 'emails');
        reviewEmails({ emailIds })
          .then((result) => {
            console.log('Email review completed:', result);
            onReviewComplete?.(result);
          })
          .catch((error) => {
            console.error('Error reviewing emails:', error);
          })
          .finally(() => {
            setShouldReview(false);
          });
      } else {
        setShouldReview(false);
      }
    }
  }, [shouldReview, sessionData, reviewEmails, onReviewComplete]);

  const triggerReview = () => {
    console.log('Triggering email review');
    setShouldReview(true);
    setReviewTrigger((prev) => prev + 1);
  };

  return {
    triggerReview,
  };
}
