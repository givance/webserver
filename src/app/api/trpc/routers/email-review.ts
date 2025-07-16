import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';

const reviewEmailsSchema = z.object({
  emailIds: z.array(z.number()).min(1).max(100),
});

export const emailReviewRouter = router({
  reviewEmails: protectedProcedure.input(reviewEmailsSchema).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.services.emailReview.reviewEmails(
        input.emailIds,
        ctx.auth.user.organizationId
      );
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
