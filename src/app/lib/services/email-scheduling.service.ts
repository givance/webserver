import { db } from '@/app/lib/db';
import {
  emailGenerationSessions,
  emailScheduleConfig,
  emailSendJobs,
  generatedEmails,
  donors,
  staff,
  staffGmailTokens,
} from '@/app/lib/db/schema';
import { logger } from '@/app/lib/logger';
import { sendSingleEmailTask } from '@/trigger/jobs/sendSingleEmail';
import { runs } from '@trigger.dev/sdk/v3';
import { TRPCError } from '@trpc/server';
import type { InferSelectModel } from 'drizzle-orm';
import { and, eq, gte, isNull, lt, or, sql, inArray } from 'drizzle-orm';

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
          timezone: 'America/New_York',
          allowedDays: [1, 2, 3, 4, 5], // Monday to Friday
          allowedStartTime: '09:00',
          allowedEndTime: '17:00',
          allowedTimezone: 'America/New_York',
        })
        .returning();

      logger.info(`Created default email schedule config for organization ${organizationId}`);
      return newConfig[0];
    } catch (error) {
      logger.error(
        `Failed to get/create schedule config: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get schedule configuration',
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
      allowedDays: number[];
      allowedStartTime: string;
      allowedEndTime: string;
      allowedTimezone: string;
      dailySchedules?: {
        [key: number]: {
          startTime: string;
          endTime: string;
          enabled: boolean;
        };
      };
      rescheduleExisting?: boolean;
    }>
  ) {
    try {
      // Validate daily limit
      if (
        updates.dailyLimit !== undefined &&
        (updates.dailyLimit < 1 || updates.dailyLimit > 500)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Daily limit must be between 1 and 500',
        });
      }

      // Validate gap minutes
      if (updates.minGapMinutes !== undefined && updates.minGapMinutes < 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Minimum gap must be at least 0 minutes',
        });
      }

      if (
        updates.maxGapMinutes &&
        updates.minGapMinutes &&
        updates.maxGapMinutes < updates.minGapMinutes
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Maximum gap must be greater than or equal to minimum gap',
        });
      }

      // Validate allowed days
      if (updates.allowedDays !== undefined) {
        if (!Array.isArray(updates.allowedDays) || updates.allowedDays.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'At least one day must be allowed',
          });
        }
        if (updates.allowedDays.some((day) => day < 0 || day > 6)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Days must be between 0 (Sunday) and 6 (Saturday)',
          });
        }
      }

      // Validate time format and range
      if (
        updates.allowedStartTime &&
        !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(updates.allowedStartTime)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Start time must be in HH:MM format',
        });
      }

      if (
        updates.allowedEndTime &&
        !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(updates.allowedEndTime)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'End time must be in HH:MM format',
        });
      }

      if (updates.allowedStartTime && updates.allowedEndTime) {
        const startMinutes = this.timeToMinutes(updates.allowedStartTime);
        const endMinutes = this.timeToMinutes(updates.allowedEndTime);
        if (startMinutes >= endMinutes) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'End time must be after start time',
          });
        }
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
          code: 'NOT_FOUND',
          message: 'Schedule configuration not found',
        });
      }

      logger.info(`Updated email schedule config for organization ${organizationId}`);

      // If requested, reschedule existing campaigns
      if (updates.rescheduleExisting) {
        logger.info(`Rescheduling existing campaigns for organization ${organizationId}`);
        const rescheduleResult = await this.rescheduleExistingCampaigns(organizationId);
        logger.info(`Rescheduled ${rescheduleResult.rescheduled} email jobs`);
      }

      return updatedConfig[0];
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to update schedule config: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update schedule configuration',
      });
    }
  }

  /**
   * Get the number of emails sent today for an organization
   */
  async getEmailsSentToday(
    organizationId: string,
    timezone: string = 'America/New_York'
  ): Promise<number> {
    try {
      // Get current date components in the organization's timezone
      const now = new Date();
      const tzNow = this.getDateInTimezone(now, timezone);

      // Create start of day in the timezone
      const startOfDay = this.createDateInTimezone(
        tzNow.year,
        tzNow.month,
        tzNow.day,
        0,
        0,
        0,
        timezone
      );

      // Create end of day (start of next day)
      const endOfDay = this.createDateInTimezone(
        tzNow.year,
        tzNow.month,
        tzNow.day + 1,
        0,
        0,
        0,
        timezone
      );

      // Count emails sent today
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(emailSendJobs)
        .where(
          and(
            eq(emailSendJobs.organizationId, organizationId),
            eq(emailSendJobs.status, 'completed'),
            gte(emailSendJobs.actualSendTime, startOfDay),
            lt(emailSendJobs.actualSendTime, endOfDay)
          )
        );

      return result?.count || 0;
    } catch (error) {
      logger.error(
        `Failed to get emails sent today: ${error instanceof Error ? error.message : String(error)}`
      );
      return 0;
    }
  }

  /**
   * Schedule emails for a campaign
   */
  async scheduleEmailCampaign(
    sessionId: number,
    organizationId: string,
    userId: string,
    campaignScheduleConfig?: {
      dailyLimit?: number;
      minGapMinutes?: number;
      maxGapMinutes?: number;
      timezone?: string;
      allowedDays?: number[];
      allowedStartTime?: string;
      allowedEndTime?: string;
      allowedTimezone?: string;
    }
  ): Promise<{
    scheduled: number;
    scheduledForToday: number;
    scheduledForLater: number;
    estimatedCompletionTime: Date;
  }> {
    try {
      // Get schedule config - use campaign-specific config if provided, otherwise use org defaults
      const orgConfig = await this.getOrCreateScheduleConfig(organizationId);
      const config = campaignScheduleConfig
        ? {
            ...orgConfig,
            ...campaignScheduleConfig,
          }
        : orgConfig;

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
          allEmails.reduce(
            (acc, email) => {
              acc[email.status] = (acc[email.status] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          )
        )}, Send status: ${JSON.stringify(
          allEmails.reduce(
            (acc, email) => {
              const status = email.sendStatus || 'null';
              acc[status] = (acc[status] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          )
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
              eq(generatedEmails.sendStatus, 'pending'),
              eq(generatedEmails.sendStatus, 'paused'),
              eq(generatedEmails.sendStatus, 'failed'),
              eq(generatedEmails.sendStatus, 'cancelled')
            )
          )
        );

      logger.info(
        `Found ${emails.length} emails ready to schedule for session ${sessionId} (including ${
          allEmails.filter((e) => e.sendStatus === 'failed').length
        } failed emails and ${allEmails.filter((e) => e.sendStatus === 'cancelled').length} cancelled emails for retry)`
      );

      if (emails.length === 0) {
        // Provide more detailed error message
        let errorDetails = 'No emails are ready to be scheduled. ';

        if (allEmails.length === 0) {
          errorDetails += 'No emails found for this campaign.';
        } else {
          const sentCount = allEmails.filter((e) => e.isSent).length;
          const scheduledCount = allEmails.filter(
            (e) => e.sendStatus === 'scheduled' || e.sendStatus === 'running'
          ).length;
          const failedCount = allEmails.filter((e) => e.sendStatus === 'failed').length;
          const pendingCount = allEmails.filter(
            (e) => !e.sendStatus || e.sendStatus === 'pending'
          ).length;
          const pausedCount = allEmails.filter((e) => e.sendStatus === 'paused').length;
          const cancelledCount = allEmails.filter((e) => e.sendStatus === 'cancelled').length;

          if (sentCount === allEmails.length) {
            errorDetails += 'All emails have already been sent.';
          } else if (scheduledCount > 0) {
            errorDetails += `${scheduledCount} emails are already scheduled or being sent.`;
          } else {
            errorDetails += `Status breakdown: ${sentCount} sent, ${scheduledCount} scheduled/running, ${failedCount} failed, ${pendingCount} pending, ${pausedCount} paused, ${cancelledCount} cancelled. Unable to schedule any emails.`;
          }
        }

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: errorDetails,
        });
      }

      // Validate that all donors have assigned staff with connected email accounts
      const donorIds = emails.map((email) => email.donorId);

      if (donorIds.length > 0) {
        const donorsWithStaff = await db
          .select({
            donorId: donors.id,
            donorFirstName: donors.firstName,
            donorLastName: donors.lastName,
            donorEmail: donors.email,
            assignedToStaffId: donors.assignedToStaffId,
            staffFirstName: staff.firstName,
            staffLastName: staff.lastName,
            staffEmail: staff.email,
            hasGmailToken: sql<boolean>`${staffGmailTokens.id} IS NOT NULL`,
          })
          .from(donors)
          .leftJoin(staff, eq(donors.assignedToStaffId, staff.id))
          .leftJoin(staffGmailTokens, eq(staff.id, staffGmailTokens.staffId))
          .where(and(inArray(donors.id, donorIds), eq(donors.organizationId, organizationId)));

        // Check for validation errors
        const donorsWithoutStaff = donorsWithStaff.filter((donor) => !donor.assignedToStaffId);

        const donorsWithStaffButNoEmail = donorsWithStaff.filter(
          (donor) => donor.assignedToStaffId && !donor.hasGmailToken
        );

        const isValid = donorsWithoutStaff.length === 0 && donorsWithStaffButNoEmail.length === 0;

        if (!isValid) {
          const errors: string[] = [];
          if (donorsWithoutStaff.length > 0) {
            errors.push(`${donorsWithoutStaff.length} donor(s) don't have assigned staff`);
          }
          if (donorsWithStaffButNoEmail.length > 0) {
            errors.push(
              `${donorsWithStaffButNoEmail.length} donor(s) have staff without connected Gmail accounts`
            );
          }
          const errorMessage = errors.join(' and ');

          logger.error(
            `Email scheduling validation failed for session ${sessionId}: ${donorsWithoutStaff.length} donors without staff, ${donorsWithStaffButNoEmail.length} donors with staff but no Gmail`
          );

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot schedule emails. ${errorMessage}`,
          });
        }

        logger.info(
          `Email scheduling validation passed for session ${sessionId}: All ${emails.length} donors have assigned staff with connected Gmail accounts`
        );
      }

      // Check daily limit
      const sentToday = await this.getEmailsSentToday(organizationId, config.timezone);
      const remainingToday = Math.max(0, config.dailyLimit - sentToday);

      logger.info(
        `Scheduling ${emails.length} emails for session ${sessionId}. Sent today: ${sentToday}, remaining: ${remainingToday}`
      );

      // Calculate schedule times with allowed time constraints
      const scheduledJobs: Array<{
        emailId: number;
        scheduledTime: Date;
        delay: number;
      }> = [];

      let currentTime = new Date();
      let emailsScheduledToday = 0;

      // Find the next allowed time to start scheduling
      currentTime = this.findNextAllowedTime(currentTime, config, campaignScheduleConfig);

      logger.info(
        `Starting email scheduling at ${currentTime.toISOString()} (${config.allowedTimezone})`
      );
      const startTz = this.getDateInTimezone(currentTime, config.allowedTimezone);
      logger.info(
        `Local time in ${config.allowedTimezone}: ${startTz.hour}:${String(startTz.minute).padStart(2, '0')} on day ${
          startTz.dayOfWeek
        }`
      );

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];

        // Check if we've hit today's limit (based on daily limit timezone)
        if (emailsScheduledToday >= remainingToday) {
          // Schedule for next allowed day
          currentTime = new Date(currentTime);
          currentTime.setDate(currentTime.getDate() + 1);
          // Find next allowed time (could be multiple days ahead)
          currentTime = this.findNextAllowedTime(currentTime, config, campaignScheduleConfig);
          emailsScheduledToday = 0; // Reset counter for new day
        }

        // Calculate random gap between min and max
        const gapMinutes =
          Math.random() * (config.maxGapMinutes - config.minGapMinutes) + config.minGapMinutes;
        const delayMs = i === 0 ? 0 : gapMinutes * 60 * 1000;

        if (i > 0) {
          currentTime = new Date(currentTime.getTime() + delayMs);
        }

        // Ensure the scheduled time is still within allowed hours
        // If not, move to next allowed time
        if (!this.isTimeAllowed(currentTime, config, campaignScheduleConfig)) {
          currentTime = this.findNextAllowedTime(currentTime, config, campaignScheduleConfig);
          emailsScheduledToday = 0; // Reset counter as we've moved to a new allowed period
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
            status: 'scheduled' as const,
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
              sendStatus: 'scheduled',
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

      // Save campaign-specific schedule config if provided
      if (campaignScheduleConfig) {
        await db
          .update(emailGenerationSessions)
          .set({
            scheduleConfig: campaignScheduleConfig,
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, sessionId));
      }

      return {
        scheduled: scheduledJobs.length,
        scheduledForToday,
        scheduledForLater,
        estimatedCompletionTime: lastScheduledTime,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to schedule email campaign: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to schedule email campaign',
      });
    }
  }

  /**
   * Pause a campaign by cancelling all pending jobs
   */
  async pauseCampaign(
    sessionId: number,
    organizationId: string
  ): Promise<{ cancelledJobs: number }> {
    try {
      // Get all scheduled jobs
      const scheduledJobs = await db
        .select()
        .from(emailSendJobs)
        .where(
          and(
            eq(emailSendJobs.sessionId, sessionId),
            eq(emailSendJobs.organizationId, organizationId),
            eq(emailSendJobs.status, 'scheduled')
          )
        );

      if (scheduledJobs.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No scheduled emails to pause',
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
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(and(eq(emailSendJobs.sessionId, sessionId), eq(emailSendJobs.status, 'scheduled')));

      // Update email statuses
      await db
        .update(generatedEmails)
        .set({
          sendStatus: 'paused',
          updatedAt: new Date(),
        })
        .where(
          and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.sendStatus, 'scheduled'))
        );

      logger.info(`Paused campaign ${sessionId}, cancelled ${scheduledJobs.length} jobs`);

      return { cancelledJobs: scheduledJobs.length };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to pause campaign: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to pause campaign',
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
            eq(generatedEmails.sendStatus, 'paused'),
            eq(generatedEmails.isSent, false)
          )
        );

      if (pausedEmails.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No paused emails to resume',
        });
      }

      // Reset email statuses to pending
      await db
        .update(generatedEmails)
        .set({
          sendStatus: 'pending',
          sendJobId: null,
          scheduledSendTime: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.sendStatus, 'paused'))
        );

      // Get the campaign's schedule config
      const campaign = await db
        .select({ scheduleConfig: emailGenerationSessions.scheduleConfig })
        .from(emailGenerationSessions)
        .where(eq(emailGenerationSessions.id, sessionId))
        .limit(1);

      // Reschedule the campaign with its saved config
      const result = await this.scheduleEmailCampaign(
        sessionId,
        organizationId,
        userId,
        campaign[0]?.scheduleConfig as any
      );

      logger.info(`Resumed campaign ${sessionId}, rescheduled ${result.scheduled} emails`);

      return {
        rescheduled: result.scheduled,
        scheduledForToday: result.scheduledForToday,
        scheduledForLater: result.scheduledForLater,
        estimatedCompletionTime: result.estimatedCompletionTime,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to resume campaign: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to resume campaign',
      });
    }
  }

  /**
   * Cancel all remaining emails in a campaign
   */
  async cancelCampaign(
    sessionId: number,
    organizationId: string
  ): Promise<{ cancelledEmails: number }> {
    try {
      // First pause to cancel jobs
      await this.pauseCampaign(sessionId, organizationId);

      // Update email statuses to cancelled
      const result = await db
        .update(generatedEmails)
        .set({
          sendStatus: 'cancelled',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(generatedEmails.sessionId, sessionId),
            or(
              eq(generatedEmails.sendStatus, 'paused'),
              eq(generatedEmails.sendStatus, 'pending'),
              eq(generatedEmails.sendStatus, 'scheduled')
            ),
            eq(generatedEmails.isSent, false)
          )
        )
        .returning({ id: generatedEmails.id });

      logger.info(`Cancelled ${result.length} emails for campaign ${sessionId}`);

      return { cancelledEmails: result.length };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to cancel campaign: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel campaign',
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
          and(
            eq(emailGenerationSessions.id, sessionId),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
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
              eq(generatedEmails.sendStatus, 'scheduled'),
              eq(generatedEmails.sendStatus, 'sent'),
              eq(generatedEmails.sendStatus, 'failed')
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
        if (status === 'pending') stats.pending = numCount;
        else if (status === 'scheduled') stats.scheduled = numCount;
        else if (status === 'sent') stats.sent = numCount;
        else if (status === 'failed') stats.failed = numCount;
        else if (status === 'cancelled') stats.cancelled = numCount;
        else if (status === 'paused') stats.paused = numCount;
      });

      // Get next scheduled email
      const nextScheduled = scheduledEmails.find(
        (email) =>
          email.status === 'scheduled' && email.scheduledTime && email.scheduledTime > new Date()
      );

      // Get last sent email
      const lastSent = scheduledEmails
        .filter((email) => email.status === 'sent' && email.actualSendTime)
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
          scheduledTime: email.scheduledTime ? new Date(email.scheduledTime).toISOString() : null,
          actualSendTime: email.actualSendTime
            ? new Date(email.actualSendTime).toISOString()
            : null,
          status: email.status,
          jobStatus: email.jobStatus,
        })),
        nextScheduledTime: nextScheduled?.scheduledTime
          ? new Date(nextScheduled.scheduledTime).toISOString()
          : null,
        lastSentTime: lastSent?.actualSendTime
          ? new Date(lastSent.actualSendTime).toISOString()
          : null,
        estimatedCompletionTime: scheduledEmails[scheduledEmails.length - 1]?.scheduledTime
          ? new Date(scheduledEmails[scheduledEmails.length - 1].scheduledTime).toISOString()
          : null,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to get campaign schedule: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get campaign schedule',
      });
    }
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   */
  private timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Get date components in specific timezone
   */
  private getDateInTimezone(
    date: Date,
    timezone: string
  ): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    dayOfWeek: number;
  } {
    // Use toLocaleString with specific options to get components
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };

    const dateStr = date.toLocaleString('en-US', options);
    // Format: MM/DD/YYYY, HH:MM:SS
    const [datePart, timePart] = dateStr.split(', ');
    const [month, day, year] = datePart.split('/').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    // Get day of week separately
    const dayOfWeek = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getDay();

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      dayOfWeek,
    };
  }

  /**
   * Create a Date object that represents a specific local time in a timezone
   */
  private createDateInTimezone(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timezone: string
  ): Date {
    // Create a localized date string
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(
      hour
    ).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

    // Use toLocaleString to format a reference date and extract timezone offset
    const refDate = new Date(dateStr);
    const tzString = refDate.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Now we need to find what UTC time corresponds to our desired local time
    // Start with an approximation
    let utcDate = new Date(dateStr + 'Z'); // Assume it's UTC

    // Adjust based on the difference
    for (let i = 0; i < 5; i++) {
      // Max 5 iterations to converge
      const currentTz = this.getDateInTimezone(utcDate, timezone);

      // Calculate the difference in minutes
      const currentMinutes =
        (currentTz.day - day) * 24 * 60 + currentTz.hour * 60 + currentTz.minute;
      const targetMinutes = hour * 60 + minute;
      const diffMinutes = targetMinutes - currentMinutes;

      if (Math.abs(diffMinutes) < 1) break; // Close enough

      // Adjust the UTC time
      utcDate = new Date(utcDate.getTime() + diffMinutes * 60 * 1000);
    }

    return utcDate;
  }

  /**
   * Check if a given date/time is within the allowed time window
   */
  private isTimeAllowed(date: Date, config: EmailScheduleConfig, campaignConfig?: any): boolean {
    // Get date components in the allowed timezone
    const tzDate = this.getDateInTimezone(date, config.allowedTimezone);

    // Check if day is allowed (0 = Sunday, 1 = Monday, etc.)
    if (!config.allowedDays.includes(tzDate.dayOfWeek)) {
      return false;
    }

    // Check if time is within allowed hours
    const currentTimeMinutes = tzDate.hour * 60 + tzDate.minute;

    // Use campaign-specific daily schedules if available
    if (campaignConfig?.dailySchedules && campaignConfig.dailySchedules[tzDate.dayOfWeek]) {
      const daySchedule = campaignConfig.dailySchedules[tzDate.dayOfWeek];
      if (!daySchedule.enabled) return false;

      const startMinutes = this.timeToMinutes(daySchedule.startTime);
      const endMinutes = this.timeToMinutes(daySchedule.endTime);
      return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
    }

    // Otherwise use default schedule for all days
    const startMinutes = this.timeToMinutes(config.allowedStartTime);
    const endMinutes = this.timeToMinutes(config.allowedEndTime);

    return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
  }

  /**
   * Find the next allowed time after the given date
   */
  private findNextAllowedTime(date: Date, config: EmailScheduleConfig, campaignConfig?: any): Date {
    // If we're already in an allowed time, return immediately
    if (this.isTimeAllowed(date, config, campaignConfig)) {
      return date;
    }

    // Get current date components in the allowed timezone
    const tzDate = this.getDateInTimezone(date, config.allowedTimezone);
    const currentDay = tzDate.dayOfWeek;
    const currentTimeMinutes = tzDate.hour * 60 + tzDate.minute;

    let targetDate: Date;

    // Check if we're using daily schedules
    if (campaignConfig?.dailySchedules) {
      // If today is an allowed day, check the schedule for today
      if (config.allowedDays.includes(currentDay) && campaignConfig.dailySchedules[currentDay]) {
        const daySchedule = campaignConfig.dailySchedules[currentDay];
        if (daySchedule.enabled) {
          const endMinutes = this.timeToMinutes(daySchedule.endTime);
          const [startHours, startMins] = daySchedule.startTime.split(':').map(Number);

          // If we're before start time today, go to start time
          if (currentTimeMinutes < this.timeToMinutes(daySchedule.startTime)) {
            targetDate = this.createDateInTimezone(
              tzDate.year,
              tzDate.month,
              tzDate.day,
              startHours,
              startMins,
              0,
              config.allowedTimezone
            );
            return targetDate;
          }
        }
      }

      // Find next allowed day with a schedule
      let daysToAdd = 0;
      for (let i = 1; i <= 7; i++) {
        const checkDay = (currentDay + i) % 7;
        if (
          config.allowedDays.includes(checkDay) &&
          campaignConfig.dailySchedules[checkDay] &&
          campaignConfig.dailySchedules[checkDay].enabled
        ) {
          daysToAdd = i;
          const daySchedule = campaignConfig.dailySchedules[checkDay];
          const [startHours, startMins] = daySchedule.startTime.split(':').map(Number);

          targetDate = this.createDateInTimezone(
            tzDate.year,
            tzDate.month,
            tzDate.day + daysToAdd,
            startHours,
            startMins,
            0,
            config.allowedTimezone
          );
          return targetDate;
        }
      }
    }

    // Fall back to default schedule logic
    const startMinutes = this.timeToMinutes(config.allowedStartTime);
    const endMinutes = this.timeToMinutes(config.allowedEndTime);
    const [startHours, startMins] = config.allowedStartTime.split(':').map(Number);

    // If today is an allowed day but we're past the end time, move to next allowed day
    if (config.allowedDays.includes(currentDay) && currentTimeMinutes > endMinutes) {
      // Find next allowed day
      let daysToAdd = 0;
      for (let i = 1; i <= 7; i++) {
        const checkDay = (currentDay + i) % 7;
        if (config.allowedDays.includes(checkDay)) {
          daysToAdd = i;
          break;
        }
      }

      // Create date for next allowed day at start time
      targetDate = this.createDateInTimezone(
        tzDate.year,
        tzDate.month,
        tzDate.day + daysToAdd,
        startHours,
        startMins,
        0,
        config.allowedTimezone
      );
    }
    // If today is an allowed day but we're before start time, move to start time today
    else if (config.allowedDays.includes(currentDay) && currentTimeMinutes < startMinutes) {
      targetDate = this.createDateInTimezone(
        tzDate.year,
        tzDate.month,
        tzDate.day,
        startHours,
        startMins,
        0,
        config.allowedTimezone
      );
    }
    // If today is not an allowed day, move to next allowed day
    else {
      let daysToAdd = 0;
      for (let i = 1; i <= 7; i++) {
        const checkDay = (currentDay + i) % 7;
        if (config.allowedDays.includes(checkDay)) {
          daysToAdd = i;
          break;
        }
      }

      // Create date for next allowed day at start time
      targetDate = this.createDateInTimezone(
        tzDate.year,
        tzDate.month,
        tzDate.day + daysToAdd,
        startHours,
        startMins,
        0,
        config.allowedTimezone
      );
    }

    // Ensure the target date is in the future
    if (targetDate <= date) {
      // Something went wrong, add one day and try again
      const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      return this.findNextAllowedTime(tomorrow, config, campaignConfig);
    }

    return targetDate;
  }

  /**
   * Reschedule existing campaigns to respect new allowed time constraints
   */
  async rescheduleExistingCampaigns(organizationId: string) {
    try {
      // Get the updated config
      const config = await this.getOrCreateScheduleConfig(organizationId);

      // Find all scheduled email jobs for this organization that haven't been sent yet
      const scheduledJobs = await db
        .select({
          id: emailSendJobs.id,
          emailId: emailSendJobs.emailId,
          sessionId: emailSendJobs.sessionId,
          scheduledTime: emailSendJobs.scheduledTime,
          triggerId: emailSendJobs.triggerJobId,
        })
        .from(emailSendJobs)
        .where(
          and(
            eq(emailSendJobs.organizationId, organizationId),
            eq(emailSendJobs.status, 'scheduled'),
            isNull(emailSendJobs.actualSendTime)
          )
        )
        .orderBy(emailSendJobs.scheduledTime);

      if (scheduledJobs.length === 0) {
        logger.info(`No scheduled jobs found for organization ${organizationId}`);
        return { rescheduled: 0 };
      }

      logger.info(`Found ${scheduledJobs.length} scheduled jobs to potentially reschedule`);

      // Group jobs by session for better scheduling
      const jobsBySession = new Map<number, typeof scheduledJobs>();
      for (const job of scheduledJobs) {
        if (!jobsBySession.has(job.sessionId)) {
          jobsBySession.set(job.sessionId, []);
        }
        jobsBySession.get(job.sessionId)!.push(job);
      }

      let totalRescheduled = 0;

      // Process each session's jobs
      for (const [sessionId, jobs] of jobsBySession) {
        const needsReschedule = jobs.filter(
          (job) => !this.isTimeAllowed(job.scheduledTime, config)
        );

        if (needsReschedule.length === 0) {
          continue; // All jobs in this session are already in allowed times
        }

        logger.info(`Rescheduling ${needsReschedule.length} jobs for session ${sessionId}`);

        // Calculate new schedule times for jobs that need rescheduling
        let currentTime = new Date();
        currentTime = this.findNextAllowedTime(currentTime, config);

        const updatedJobs: Array<{
          id: number;
          newScheduledTime: Date;
          triggerId?: string | null;
        }> = [];

        for (let i = 0; i < needsReschedule.length; i++) {
          const job = needsReschedule[i];

          // Calculate gap for spacing
          const gapMinutes =
            Math.random() * (config.maxGapMinutes - config.minGapMinutes) + config.minGapMinutes;
          const delayMs = i === 0 ? 0 : gapMinutes * 60 * 1000;

          if (i > 0) {
            currentTime = new Date(currentTime.getTime() + delayMs);
          }

          // Ensure we're still in allowed time after adding delay
          if (!this.isTimeAllowed(currentTime, config)) {
            currentTime = this.findNextAllowedTime(currentTime, config);
          }

          updatedJobs.push({
            id: job.id,
            newScheduledTime: new Date(currentTime),
            triggerId: job.triggerId,
          });
        }

        // Update the database with new scheduled times
        for (const update of updatedJobs) {
          await db
            .update(emailSendJobs)
            .set({
              scheduledTime: update.newScheduledTime,
              updatedAt: new Date(),
            })
            .where(eq(emailSendJobs.id, update.id));

          // Also update the generated email's scheduled time
          await db
            .update(generatedEmails)
            .set({
              scheduledSendTime: update.newScheduledTime,
              updatedAt: new Date(),
            })
            .where(eq(generatedEmails.id, emailSendJobs.emailId));

          // Cancel the old Trigger.dev job and schedule a new one
          if (update.triggerId) {
            try {
              await runs.cancel(update.triggerId);
            } catch (error) {
              logger.warn(
                `Failed to cancel trigger job ${update.triggerId}: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }

          // TODO: Schedule new Trigger.dev job - temporarily disabled until we can pass userId
          // The trigger task requires userId, sessionId, and jobId parameters which are not
          // available in this context. For now, we'll just update the schedule times in the database
          // and the jobs will need to be manually rescheduled or the campaign restarted.
          logger.warn(
            `Trigger job rescheduling temporarily disabled for email ${update.id} - database schedule updated but trigger job not rescheduled`
          );

          /* TEMPORARILY DISABLED - REQUIRES REFACTORING
          const delay = update.newScheduledTime.getTime() - Date.now();
          if (delay > 0) {
            try {
              const triggerHandle = await sendSingleEmailTask.trigger(
                {
                  emailId: needsReschedule.find((j) => j.id === update.id)!.emailId,
                  organizationId,
                  userId: userId, // NOT AVAILABLE
                  sessionId: sessionId, // NOT AVAILABLE
                  jobId: update.id, // This is job ID, not email ID
                },
                {
                  delay: Math.max(1000, delay), // At least 1 second delay
                }
              );

              // Update the trigger ID in the database
              await db
                .update(emailSendJobs)
                .set({
                  triggerJobId: triggerHandle.id,
                })
                .where(eq(emailSendJobs.id, update.id));
            } catch (error) {
              logger.error(
                `Failed to reschedule trigger job for email ${update.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }
          */
        }

        totalRescheduled += updatedJobs.length;
      }

      logger.info(
        `Successfully rescheduled ${totalRescheduled} email jobs for organization ${organizationId}`
      );
      return { rescheduled: totalRescheduled };
    } catch (error) {
      logger.error(
        `Failed to reschedule existing campaigns: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to reschedule existing campaigns',
      });
    }
  }
}
