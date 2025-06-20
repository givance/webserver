import { db } from "@/app/lib/db";
import { emailGenerationSessions, emailScheduleConfig, emailSendJobs, generatedEmails } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { sendSingleEmailTask } from "@/trigger/jobs/sendSingleEmail";
import { runs } from "@trigger.dev/sdk/v3";
import { TRPCError } from "@trpc/server";
import type { InferSelectModel } from "drizzle-orm";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

type EmailScheduleConfig = InferSelectModel<typeof emailScheduleConfig>;
type EmailSendJob = InferSelectModel<typeof emailSendJobs>;

/**
 * Service for managing email scheduling and sending
 */
export class EmailSchedulingService {
  /**
   * Get or create email schedule configuration for an organization
   */
  async getOrCreateScheduleConfig(organizationId: string): Promise<EmailScheduleConfig> {
    try {
      // Try to get existing config
      const existingConfig = await db
        .select()
        .from(emailScheduleConfig)
        .where(eq(emailScheduleConfig.organizationId, organizationId))
        .limit(1);

      if (existingConfig[0]) {
        return existingConfig[0];
      }

      // Create default config
      const newConfig = await db
        .insert(emailScheduleConfig)
        .values({
          organizationId,
          dailyLimit: 150,
          maxDailyLimit: 500,
          minGapMinutes: 1,
          maxGapMinutes: 3,
          timezone: "America/New_York",
        })
        .returning();

      logger.info(`Created default email schedule config for organization ${organizationId}`);
      return newConfig[0];
    } catch (error) {
      logger.error(`Failed to get/create schedule config: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get schedule configuration",
      });
    }
  }

  /**
   * Update email schedule configuration
   */
  async updateScheduleConfig(
    organizationId: string,
    updates: Partial<{
      dailyLimit: number;
      minGapMinutes: number;
      maxGapMinutes: number;
      timezone: string;
    }>
  ) {
    try {
      // Validate daily limit
      if (updates.dailyLimit !== undefined && (updates.dailyLimit < 1 || updates.dailyLimit > 500)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Daily limit must be between 1 and 500",
        });
      }

      // Validate gap minutes
      if (updates.minGapMinutes !== undefined && updates.minGapMinutes < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Minimum gap must be at least 0 minutes",
        });
      }

      if (updates.maxGapMinutes && updates.minGapMinutes && updates.maxGapMinutes < updates.minGapMinutes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum gap must be greater than or equal to minimum gap",
        });
      }

      const updatedConfig = await db
        .update(emailScheduleConfig)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(emailScheduleConfig.organizationId, organizationId))
        .returning();

      if (!updatedConfig || updatedConfig.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule configuration not found",
        });
      }

      logger.info(`Updated email schedule config for organization ${organizationId}`);
      return updatedConfig[0];
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to update schedule config: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update schedule configuration",
      });
    }
  }

  /**
   * Get the number of emails sent today for an organization
   */
  async getEmailsSentToday(organizationId: string, timezone: string = "America/New_York"): Promise<number> {
    try {
      // Get start of day in the organization's timezone
      const now = new Date();
      const startOfDay = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Count emails sent today
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(emailSendJobs)
        .where(
          and(
            eq(emailSendJobs.organizationId, organizationId),
            eq(emailSendJobs.status, "completed"),
            gte(emailSendJobs.actualSendTime, startOfDay),
            lt(emailSendJobs.actualSendTime, endOfDay)
          )
        );

      return result?.count || 0;
    } catch (error) {
      logger.error(`Failed to get emails sent today: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  /**
   * Schedule emails for a campaign
   */
  async scheduleEmailCampaign(
    sessionId: number,
    organizationId: string,
    userId: string
  ): Promise<{
    scheduled: number;
    scheduledForToday: number;
    scheduledForLater: number;
    estimatedCompletionTime: Date;
  }> {
    try {
      // Get schedule config
      const config = await this.getOrCreateScheduleConfig(organizationId);

      // First, check if there are any emails at all for this session
      const allEmails = await db
        .select({
          id: generatedEmails.id,
          status: generatedEmails.status,
          isSent: generatedEmails.isSent,
          sendStatus: generatedEmails.sendStatus,
        })
        .from(generatedEmails)
        .where(eq(generatedEmails.sessionId, sessionId));

      logger.info(
        `Found ${allEmails.length} total emails for session ${sessionId}. Status breakdown: ${JSON.stringify(
          allEmails.reduce((acc, email) => {
            acc[email.status] = (acc[email.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        )}, Send status: ${JSON.stringify(
          allEmails.reduce((acc, email) => {
            const status = email.sendStatus || "null";
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        )}`
      );

      // Get emails to send - include all generated emails except already sent or currently scheduled/running
      const emails = await db
        .select({
          id: generatedEmails.id,
          donorId: generatedEmails.donorId,
          sessionId: generatedEmails.sessionId,
          sendStatus: generatedEmails.sendStatus,
        })
        .from(generatedEmails)
        .where(
          and(
            eq(generatedEmails.sessionId, sessionId),
            eq(generatedEmails.isSent, false),
            or(
              isNull(generatedEmails.sendStatus),
              eq(generatedEmails.sendStatus, "pending"),
              eq(generatedEmails.sendStatus, "paused"),
              eq(generatedEmails.sendStatus, "failed")
            )
          )
        );

      logger.info(
        `Found ${emails.length} emails ready to schedule for session ${sessionId} (including ${
          allEmails.filter((e) => e.sendStatus === "failed").length
        } failed emails for retry)`
      );

      if (emails.length === 0) {
        // Provide more detailed error message
        let errorDetails = "No emails are ready to be scheduled. ";

        if (allEmails.length === 0) {
          errorDetails += "No emails found for this campaign.";
        } else {
          const sentCount = allEmails.filter((e) => e.isSent).length;
          const scheduledCount = allEmails.filter(
            (e) => e.sendStatus === "scheduled" || e.sendStatus === "running"
          ).length;
          const failedCount = allEmails.filter((e) => e.sendStatus === "failed").length;
          const pendingCount = allEmails.filter((e) => !e.sendStatus || e.sendStatus === "pending").length;
          const pausedCount = allEmails.filter((e) => e.sendStatus === "paused").length;

          if (sentCount === allEmails.length) {
            errorDetails += "All emails have already been sent.";
          } else if (scheduledCount > 0) {
            errorDetails += `${scheduledCount} emails are already scheduled or being sent.`;
          } else {
            errorDetails += `Status breakdown: ${sentCount} sent, ${scheduledCount} scheduled/running, ${failedCount} failed, ${pendingCount} pending, ${pausedCount} paused. Unable to schedule any emails.`;
          }
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorDetails,
        });
      }

      // Check daily limit
      const sentToday = await this.getEmailsSentToday(organizationId, config.timezone);
      const remainingToday = Math.max(0, config.dailyLimit - sentToday);

      logger.info(
        `Scheduling ${emails.length} emails for session ${sessionId}. Sent today: ${sentToday}, remaining: ${remainingToday}`
      );

      // Calculate schedule times
      const scheduledJobs: Array<{
        emailId: number;
        scheduledTime: Date;
        delay: number;
      }> = [];

      let currentTime = new Date();
      let emailsScheduledToday = 0;

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];

        // Check if we've hit today's limit
        if (emailsScheduledToday >= remainingToday) {
          // Schedule for tomorrow
          currentTime = new Date(currentTime);
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(9, 0, 0, 0); // Start at 9 AM next day
          emailsScheduledToday = 0; // Reset counter for new day
        }

        // Calculate random gap between min and max
        const gapMinutes = Math.random() * (config.maxGapMinutes - config.minGapMinutes) + config.minGapMinutes;
        const delayMs = i === 0 ? 0 : gapMinutes * 60 * 1000;

        if (i > 0) {
          currentTime = new Date(currentTime.getTime() + delayMs);
        }

        scheduledJobs.push({
          emailId: email.id,
          scheduledTime: new Date(currentTime),
          delay: currentTime.getTime() - Date.now(),
        });

        emailsScheduledToday++;
      }

      // Create send jobs in database
      const jobRecords = await db
        .insert(emailSendJobs)
        .values(
          scheduledJobs.map((job) => ({
            emailId: job.emailId,
            sessionId: sessionId,
            organizationId: organizationId,
            scheduledTime: job.scheduledTime,
            status: "scheduled" as const,
          }))
        )
        .returning();

      // Update email statuses and scheduled times
      await Promise.all(
        scheduledJobs.map((job, index) =>
          db
            .update(generatedEmails)
            .set({
              sendJobId: jobRecords[index].id,
              scheduledSendTime: job.scheduledTime,
              sendStatus: "scheduled",
              updatedAt: new Date(),
            })
            .where(eq(generatedEmails.id, job.emailId))
        )
      );

      // Create trigger.dev jobs
      const triggerJobs = await Promise.all(
        jobRecords.map(async (jobRecord, index) => {
          const job = scheduledJobs[index];
          const triggerJob = await sendSingleEmailTask.trigger(
            {
              emailId: job.emailId,
              jobId: jobRecord.id,
              sessionId: sessionId,
              organizationId: organizationId,
              userId: userId,
            },
            {
              delay: new Date(job.scheduledTime),
            }
          );

          // Update job with trigger ID
          await db
            .update(emailSendJobs)
            .set({
              triggerJobId: triggerJob.id,
              updatedAt: new Date(),
            })
            .where(eq(emailSendJobs.id, jobRecord.id));

          return triggerJob;
        })
      );

      // Calculate stats
      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const scheduledForToday = scheduledJobs.filter((job) => job.scheduledTime <= todayEnd).length;
      const scheduledForLater = scheduledJobs.length - scheduledForToday;
      const lastScheduledTime = scheduledJobs[scheduledJobs.length - 1].scheduledTime;

      logger.info(
        `Scheduled ${scheduledJobs.length} emails for session ${sessionId}. Today: ${scheduledForToday}, Later: ${scheduledForLater}`
      );

      return {
        scheduled: scheduledJobs.length,
        scheduledForToday,
        scheduledForLater,
        estimatedCompletionTime: lastScheduledTime,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to schedule email campaign: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to schedule email campaign",
      });
    }
  }

  /**
   * Pause a campaign by cancelling all pending jobs
   */
  async pauseCampaign(sessionId: number, organizationId: string): Promise<{ cancelledJobs: number }> {
    try {
      // Get all scheduled jobs
      const scheduledJobs = await db
        .select()
        .from(emailSendJobs)
        .where(
          and(
            eq(emailSendJobs.sessionId, sessionId),
            eq(emailSendJobs.organizationId, organizationId),
            eq(emailSendJobs.status, "scheduled")
          )
        );

      if (scheduledJobs.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No scheduled emails to pause",
        });
      }

      // Cancel trigger.dev jobs
      const cancelPromises = scheduledJobs
        .filter((job) => job.triggerJobId)
        .map((job) =>
          runs.cancel(job.triggerJobId!).catch((error) => {
            logger.warn(`Failed to cancel trigger job ${job.triggerJobId}: ${error}`);
          })
        );

      await Promise.all(cancelPromises);

      // Update job statuses
      await db
        .update(emailSendJobs)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(and(eq(emailSendJobs.sessionId, sessionId), eq(emailSendJobs.status, "scheduled")));

      // Update email statuses
      await db
        .update(generatedEmails)
        .set({
          sendStatus: "paused",
          updatedAt: new Date(),
        })
        .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.sendStatus, "scheduled")));

      logger.info(`Paused campaign ${sessionId}, cancelled ${scheduledJobs.length} jobs`);

      return { cancelledJobs: scheduledJobs.length };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to pause campaign: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to pause campaign",
      });
    }
  }

  /**
   * Resume a paused campaign by rescheduling remaining emails
   */
  async resumeCampaign(
    sessionId: number,
    organizationId: string,
    userId: string
  ): Promise<{
    rescheduled: number;
    scheduledForToday: number;
    scheduledForLater: number;
    estimatedCompletionTime: Date;
  }> {
    try {
      // Get paused emails
      const pausedEmails = await db
        .select({
          id: generatedEmails.id,
        })
        .from(generatedEmails)
        .where(
          and(
            eq(generatedEmails.sessionId, sessionId),
            eq(generatedEmails.sendStatus, "paused"),
            eq(generatedEmails.isSent, false)
          )
        );

      if (pausedEmails.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No paused emails to resume",
        });
      }

      // Reset email statuses to pending
      await db
        .update(generatedEmails)
        .set({
          sendStatus: "pending",
          sendJobId: null,
          scheduledSendTime: null,
          updatedAt: new Date(),
        })
        .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.sendStatus, "paused")));

      // Reschedule the campaign
      const result = await this.scheduleEmailCampaign(sessionId, organizationId, userId);

      logger.info(`Resumed campaign ${sessionId}, rescheduled ${result.scheduled} emails`);

      return {
        rescheduled: result.scheduled,
        scheduledForToday: result.scheduledForToday,
        scheduledForLater: result.scheduledForLater,
        estimatedCompletionTime: result.estimatedCompletionTime,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to resume campaign: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to resume campaign",
      });
    }
  }

  /**
   * Cancel all remaining emails in a campaign
   */
  async cancelCampaign(sessionId: number, organizationId: string): Promise<{ cancelledEmails: number }> {
    try {
      // First pause to cancel jobs
      await this.pauseCampaign(sessionId, organizationId);

      // Update email statuses to cancelled
      const result = await db
        .update(generatedEmails)
        .set({
          sendStatus: "cancelled",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(generatedEmails.sessionId, sessionId),
            or(
              eq(generatedEmails.sendStatus, "paused"),
              eq(generatedEmails.sendStatus, "pending"),
              eq(generatedEmails.sendStatus, "scheduled")
            ),
            eq(generatedEmails.isSent, false)
          )
        )
        .returning({ id: generatedEmails.id });

      logger.info(`Cancelled ${result.length} emails for campaign ${sessionId}`);

      return { cancelledEmails: result.length };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to cancel campaign: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to cancel campaign",
      });
    }
  }

  /**
   * Get campaign schedule and status
   */
  async getCampaignSchedule(sessionId: number, organizationId: string) {
    try {
      // Get session
      const [session] = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(eq(emailGenerationSessions.id, sessionId), eq(emailGenerationSessions.organizationId, organizationId))
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      // Get email statuses
      const emailStatuses = await db
        .select({
          status: generatedEmails.sendStatus,
          count: sql<number>`count(*)`,
        })
        .from(generatedEmails)
        .where(eq(generatedEmails.sessionId, sessionId))
        .groupBy(generatedEmails.sendStatus);

      // Get scheduled emails with details
      const scheduledEmails = await db
        .select({
          emailId: generatedEmails.id,
          donorId: generatedEmails.donorId,
          scheduledTime: generatedEmails.scheduledSendTime,
          status: generatedEmails.sendStatus,
          jobStatus: emailSendJobs.status,
          actualSendTime: emailSendJobs.actualSendTime,
        })
        .from(generatedEmails)
        .leftJoin(emailSendJobs, eq(generatedEmails.sendJobId, emailSendJobs.id))
        .where(
          and(
            eq(generatedEmails.sessionId, sessionId),
            or(
              eq(generatedEmails.sendStatus, "scheduled"),
              eq(generatedEmails.sendStatus, "sent"),
              eq(generatedEmails.sendStatus, "failed")
            )
          )
        )
        .orderBy(generatedEmails.scheduledSendTime);

      // Calculate stats
      const stats = {
        total: 0,
        pending: 0,
        scheduled: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        paused: 0,
      };

      emailStatuses.forEach(({ status, count }) => {
        const numCount = Number(count); // Ensure count is a number
        stats.total += numCount;
        if (status === "pending") stats.pending = numCount;
        else if (status === "scheduled") stats.scheduled = numCount;
        else if (status === "sent") stats.sent = numCount;
        else if (status === "failed") stats.failed = numCount;
        else if (status === "cancelled") stats.cancelled = numCount;
        else if (status === "paused") stats.paused = numCount;
      });

      // Get next scheduled email
      const nextScheduled = scheduledEmails.find(
        (email) => email.status === "scheduled" && email.scheduledTime && email.scheduledTime > new Date()
      );

      // Get last sent email
      const lastSent = scheduledEmails
        .filter((email) => email.status === "sent" && email.actualSendTime)
        .sort((a, b) => (b.actualSendTime?.getTime() || 0) - (a.actualSendTime?.getTime() || 0))[0];

      return {
        session: {
          id: session.id,
          name: session.jobName,
          status: session.status,
        },
        stats,
        totalScheduled: scheduledEmails.length,
        scheduled: stats.scheduled,
        running: 0, // Add if you track running status separately
        paused: stats.paused,
        completed: stats.sent,
        scheduledEmails: scheduledEmails.map((email) => ({
          emailId: email.emailId,
          donorId: email.donorId,
          scheduledTime: email.scheduledTime,
          actualSendTime: email.actualSendTime,
          status: email.status,
          jobStatus: email.jobStatus,
        })),
        nextScheduledTime: nextScheduled?.scheduledTime,
        lastSentTime: lastSent?.actualSendTime,
        estimatedCompletionTime: scheduledEmails[scheduledEmails.length - 1]?.scheduledTime,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to get campaign schedule: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get campaign schedule",
      });
    }
  }
}
