import { z } from 'zod';
import { router, protectedProcedure, check, ERROR_MESSAGES } from '../trpc';
import {
  getSessionTrackingStats,
  getMultipleSessionTrackingStats,
  getDonorTrackingStatsForSession,
  getEmailTrackingData,
  hasEmailBeenOpened,
  getEmailTrackingByEmailAndDonor,
  getEmailTrackingBySessionAndDonor,
} from '@/app/lib/data/email-tracking';
import { logger } from '@/app/lib/logger';

export const emailTrackingRouter = router({
  /**
   * Get tracking statistics for a specific email generation session
   */
  getSessionStats: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      logger.info(`Fetching tracking stats for session ${input.sessionId}`);

      const stats = await getSessionTrackingStats(input.sessionId);

      if (!stats) {
        return null;
      }

      return stats;
    }),

  /**
   * Get tracking statistics for multiple email generation sessions in batch
   */
  getMultipleSessionStats: protectedProcedure
    .input(
      z.object({
        sessionIds: z.array(z.number()),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      logger.info(
        `Fetching tracking stats for ${input.sessionIds.length} sessions: ${input.sessionIds.join(', ')}`
      );

      const stats = await getMultipleSessionTrackingStats(input.sessionIds);

      return stats;
    }),

  /**
   * Get tracking statistics for all donors in a session
   */
  getDonorStatsForSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      logger.info(`Fetching donor tracking stats for session ${input.sessionId}`);

      const donorStats = await getDonorTrackingStatsForSession(input.sessionId);

      return donorStats;
    }),

  /**
   * Get detailed tracking data for a specific email by email ID and donor ID
   */
  getEmailTracking: protectedProcedure
    .input(
      z.object({
        emailId: z.number(),
        donorId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      logger.info(
        `Fetching email tracking data for email ${input.emailId}, donor ${input.donorId}`
      );

      const trackingData = await getEmailTrackingByEmailAndDonor(input.emailId, input.donorId);

      return trackingData;
    }),

  /**
   * Get detailed tracking data for a specific email
   */
  getEmailTrackingData: protectedProcedure
    .input(
      z.object({
        emailTrackerId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      logger.info(`Fetching email tracking data for tracker ${input.emailTrackerId}`);

      const trackingData = await getEmailTrackingData(input.emailTrackerId);

      if (!trackingData) {
        return null;
      }

      return trackingData;
    }),

  /**
   * Check if a specific email has been opened
   */
  hasEmailBeenOpened: protectedProcedure
    .input(
      z.object({
        emailTrackerId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      logger.info(`Checking if email has been opened for tracker ${input.emailTrackerId}`);

      const hasBeenOpened = await hasEmailBeenOpened(input.emailTrackerId);

      return { hasBeenOpened };
    }),

  /**
   * Get detailed tracking data for a specific email by session ID and donor ID
   */
  getEmailTrackingBySession: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        donorId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx.auth;
      check(!user?.organizationId, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED);

      logger.info(
        `Fetching email tracking data for session ${input.sessionId}, donor ${input.donorId}`
      );

      const trackingData = await getEmailTrackingBySessionAndDonor(input.sessionId, input.donorId);

      return trackingData;
    }),
});
