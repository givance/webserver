import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { logger } from '@/app/lib/logger';

const reviewEmailsSchema = z.object({
  emailIds: z.array(z.number()).min(1).max(100),
});

export const emailReviewRouter = router({
  reviewEmails: protectedProcedure.input(reviewEmailsSchema).mutation(async ({ ctx, input }) => {
    try {
      logger.info('[EmailReviewRouter] Reviewing emails', {
        emailIds: input.emailIds,
        organizationId: ctx.auth.user.organizationId,
      });

      const result = await ctx.services.emailReview.reviewEmails(
        input.emailIds,
        ctx.auth.user.organizationId
      );

      // Log the review results
      logger.info('[EmailReviewRouter] Review results', {
        reviewCount: result.reviews.length,
        totalTokensUsed: result.totalTokensUsed,
        reviews: result.reviews.map((r) => ({
          emailId: r.emailId,
          result: r.result,
          feedback: r.feedback,
        })),
      });

      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Organization not found') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error.message,
        });
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to review emails',
      });
    }
  }),
});
