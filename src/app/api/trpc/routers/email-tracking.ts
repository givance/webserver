import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  getSessionTrackingStats,
  getDonorTrackingStatsForSession,
  getEmailTrackingData,
  hasEmailBeenOpened,
} from "@/app/lib/data/email-tracking";
import { logger } from "@/app/lib/logger";

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
      if (!user?.organizationId) {
        throw new Error("User must belong to an organization");
      }

      logger.info(`Fetching tracking stats for session ${input.sessionId}`);

      const stats = await getSessionTrackingStats(input.sessionId);

      if (!stats) {
        return null;
      }

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
      if (!user?.organizationId) {
        throw new Error("User must belong to an organization");
      }

      logger.info(`Fetching donor tracking stats for session ${input.sessionId}`);

      const donorStats = await getDonorTrackingStatsForSession(input.sessionId);

      return donorStats;
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
      if (!user?.organizationId) {
        throw new Error("User must belong to an organization");
      }

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
      if (!user?.organizationId) {
        throw new Error("User must belong to an organization");
      }

      logger.info(`Checking if email has been opened for tracker ${input.emailTrackerId}`);

      const hasBeenOpened = await hasEmailBeenOpened(input.emailTrackerId);

      return { hasBeenOpened };
    }),
});
