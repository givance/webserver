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
import {
  getEmailScheduleConfig,
  createEmailScheduleConfig,
  updateEmailScheduleConfig,
  createEmailSendJob,
  getEmailSendJobs,
  updateEmailSendJobStatus,
  bulkCreateEmailSendJobs,
  deleteEmailSendJobs,
  getEmailsForScheduling,
  updateGeneratedEmailSendStatus,
  getDailyEmailCount,
} from '@/app/lib/data/email-scheduling';
import { logger } from '@/app/lib/logger';
import { sendSingleEmailTask } from '@/trigger/jobs/sendSingleEmail';
import { runs } from '@trigger.dev/sdk/v3';
import { TRPCError } from '@trpc/server';
import type { InferSelectModel } from 'drizzle-orm';
import { and, eq, gte, isNull, lt, or, sql, inArray } from 'drizzle-orm';
import { check, createTRPCError, ERROR_MESSAGES } from '@/app/api/trpc/trpc';
import {
  calculateSchedule,
  scheduleTasks,
  cancelScheduledTasks,
  scheduleAndTriggerTasks,
  type ScheduleConfig,
  type SchedulableTask,
  type ScheduledTask,
  type TriggerTaskConfig,
} from '@/app/lib/utils/scheduling/task-scheduler';

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
      const existingConfig = await getEmailScheduleConfig(organizationId);

      if (existingConfig) {
        return existingConfig;
      }

      // Create default config
      const newConfig = await createEmailScheduleConfig({
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
      });

      logger.info(`Created default email schedule config for organization ${organizationId}`);
      return newConfig;
    } catch (error) {
      logger.error(
        `Failed to get/create schedule config: ${error instanceof Error ? error.message : String(error)}`
      );
      throw createTRPCError({
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
      check(
        updates.dailyLimit !== undefined && (updates.dailyLimit < 1 || updates.dailyLimit > 500),
        'BAD_REQUEST',
        'Daily limit must be between 1 and 500'
      );

      // Validate gap minutes
      check(
        updates.minGapMinutes !== undefined && updates.minGapMinutes < 0,
        'BAD_REQUEST',
        'Minimum gap must be at least 0 minutes'
      );

      check(
        (updates.maxGapMinutes ?? 0) > 0 &&
          (updates.minGapMinutes ?? 0) > 0 &&
          (updates.maxGapMinutes ?? 0) < (updates.minGapMinutes ?? 0),
        'BAD_REQUEST',
        'Maximum gap must be greater than or equal to minimum gap'
      );

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

      const updatedConfig = await updateEmailScheduleConfig(organizationId, updates);

      if (!updatedConfig) {
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

      return updatedConfig;
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
      const config: ScheduleConfig = campaignScheduleConfig || orgConfig;

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
      const sentToday = await this.getEmailsSentToday(
        organizationId,
        config.timezone || 'America/New_York'
      );
      const remainingToday = Math.max(0, (config.dailyLimit || 150) - sentToday);

      logger.info(
        `Scheduling ${emails.length} emails for session ${sessionId}. Sent today: ${sentToday}, remaining: ${remainingToday}`
      );

      // Convert emails to schedulable tasks
      const tasks: SchedulableTask<{ emailId: number; donorId: number }>[] = emails.map(
        (email) => ({
          id: email.id.toString(),
          data: { emailId: email.id, donorId: email.donorId },
        })
      );

      // Calculate schedule first
      const scheduleResult = calculateSchedule(tasks, config, {
        startTime: new Date(),
      });

      // Check if any tasks were scheduled
      if (scheduleResult.scheduledTasks.length === 0) {
        const unscheduledCount = scheduleResult.unscheduledTasks.length;
        const errorMessage =
          unscheduledCount > 0
            ? `Unable to schedule ${unscheduledCount} emails with current schedule settings. Please check your allowed days, time windows, and daily limits.`
            : 'No emails to schedule.';

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: errorMessage,
        });
      }

      // Create send jobs in database
      const jobRecords = await db
        .insert(emailSendJobs)
        .values(
          scheduleResult.scheduledTasks.map((task) => ({
            emailId: task.data.emailId,
            sessionId: sessionId,
            organizationId: organizationId,
            scheduledTime: task.scheduledTime,
            status: 'scheduled' as const,
          }))
        )
        .returning();

      // Update the context with job records for payload builder
      const triggerConfig: TriggerTaskConfig<{ emailId: number; donorId: number }> = {
        taskHandler: sendSingleEmailTask as any,
        payloadBuilder: (
          task: ScheduledTask<{ emailId: number; donorId: number }>,
          _context: any
        ) => ({
          emailId: task.data.emailId,
          jobId: jobRecords.find((jr) => jr.emailId === task.data.emailId)?.id,
          sessionId: sessionId,
          organizationId: organizationId,
          userId: userId,
        }),
        context: { jobRecords },
      };

      // Schedule the tasks with trigger.dev
      const scheduledJobs = await scheduleTasks(scheduleResult.scheduledTasks, triggerConfig);

      // Update job records with trigger IDs
      await Promise.all(
        scheduledJobs.map((scheduledJob) => {
          const jobRecord = jobRecords.find((jr) => jr.emailId === parseInt(scheduledJob.taskId));
          if (jobRecord) {
            return db
              .update(emailSendJobs)
              .set({
                triggerJobId: scheduledJob.triggerId,
                updatedAt: new Date(),
              })
              .where(eq(emailSendJobs.id, jobRecord.id));
          }
        })
      );

      // Update email statuses and scheduled times
      await Promise.all(
        scheduleResult.scheduledTasks.map((task) => {
          const jobRecord = jobRecords.find((jr) => jr.emailId === task.data.emailId);
          return db
            .update(generatedEmails)
            .set({
              sendJobId: jobRecord?.id,
              scheduledSendTime: task.scheduledTime,
              sendStatus: 'scheduled',
              updatedAt: new Date(),
            })
            .where(eq(generatedEmails.id, task.data.emailId));
        })
      );

      // Calculate stats
      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const scheduledForToday = scheduleResult.scheduledTasks.filter(
        (task) => task.scheduledTime <= todayEnd
      ).length;
      const scheduledForLater = scheduleResult.scheduledTasks.length - scheduledForToday;
      const lastScheduledTask =
        scheduleResult.scheduledTasks[scheduleResult.scheduledTasks.length - 1];
      const lastScheduledTime = lastScheduledTask ? lastScheduledTask.scheduledTime : new Date();

      logger.info(
        `Scheduled ${scheduleResult.scheduledTasks.length} emails for session ${sessionId}. Today: ${scheduledForToday}, Later: ${scheduledForLater}`
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
        scheduled: scheduleResult.scheduledTasks.length,
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

      // Cancel trigger.dev jobs using the new function
      const triggerIds = scheduledJobs
        .filter((job) => job.triggerJobId)
        .map((job) => job.triggerJobId!);

      const cancelResult = await cancelScheduledTasks(triggerIds);

      if (cancelResult.failed.length > 0) {
        logger.warn(`Failed to cancel ${cancelResult.failed.length} trigger jobs`);
      }

      // Update job statuses
      await db
        .update(emailSendJobs)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(and(eq(emailSendJobs.sessionId, sessionId), eq(emailSendJobs.status, 'scheduled')));

      // Update email statuses and get count
      const pausedEmailsResult = await db
        .update(generatedEmails)
        .set({
          sendStatus: 'paused',
          updatedAt: new Date(),
        })
        .where(
          and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.sendStatus, 'scheduled'))
        )
        .returning({ id: generatedEmails.id });

      const actualPausedCount = pausedEmailsResult.length;

      logger.info(
        `Paused campaign ${sessionId}, cancelled ${scheduledJobs.length} jobs, paused ${actualPausedCount} emails`
      );

      return { cancelledJobs: actualPausedCount };
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
          ? new Date(scheduledEmails[scheduledEmails.length - 1].scheduledTime!).toISOString()
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
        // Get the campaign's schedule config
        const campaign = await db
          .select({ scheduleConfig: emailGenerationSessions.scheduleConfig })
          .from(emailGenerationSessions)
          .where(eq(emailGenerationSessions.id, sessionId))
          .limit(1);

        const scheduleConfig: ScheduleConfig = campaign[0]?.scheduleConfig
          ? { ...config, ...(campaign[0].scheduleConfig as any) }
          : config;

        // Convert jobs to tasks
        const tasks: SchedulableTask<{
          jobId: number;
          emailId: number;
          triggerId?: string | null;
        }>[] = jobs.map((job) => ({
          id: job.id.toString(),
          data: { jobId: job.id, emailId: job.emailId, triggerId: job.triggerId },
        }));

        // Recalculate schedule
        const scheduleResult = calculateSchedule(tasks, scheduleConfig, {
          startTime: new Date(),
        });

        // Cancel old trigger jobs
        const triggerIds = jobs.filter((job) => job.triggerId).map((job) => job.triggerId!);

        if (triggerIds.length > 0) {
          await cancelScheduledTasks(triggerIds);
        }

        // Update database with new scheduled times and schedule new trigger jobs
        for (const scheduledTask of scheduleResult.scheduledTasks) {
          await db
            .update(emailSendJobs)
            .set({
              scheduledTime: scheduledTask.scheduledTime,
              updatedAt: new Date(),
            })
            .where(eq(emailSendJobs.id, scheduledTask.data.jobId));

          // Also update the generated email's scheduled time
          await db
            .update(generatedEmails)
            .set({
              scheduledSendTime: scheduledTask.scheduledTime,
              updatedAt: new Date(),
            })
            .where(eq(generatedEmails.id, scheduledTask.data.emailId));
        }

        // Schedule new trigger.dev jobs
        if (scheduleResult.scheduledTasks.length > 0) {
          try {
            // Get the user ID for the session (needed for trigger payload)
            const sessionInfo = await db
              .select({ userId: emailGenerationSessions.userId })
              .from(emailGenerationSessions)
              .where(eq(emailGenerationSessions.id, sessionId))
              .limit(1);

            if (sessionInfo[0]) {
              const triggerConfig: TriggerTaskConfig<{
                jobId: number;
                emailId: number;
                triggerId?: string | null;
              }> = {
                taskHandler: sendSingleEmailTask as any,
                payloadBuilder: (
                  task: ScheduledTask<{
                    jobId: number;
                    emailId: number;
                    triggerId?: string | null;
                  }>,
                  _context: any
                ) => ({
                  emailId: task.data.emailId,
                  jobId: task.data.jobId,
                  sessionId: sessionId,
                  organizationId: organizationId,
                  userId: sessionInfo[0].userId,
                }),
                context: {},
              };

              const scheduledJobs = await scheduleTasks(
                scheduleResult.scheduledTasks,
                triggerConfig
              );

              // Update job records with new trigger IDs
              await Promise.all(
                scheduledJobs.map((scheduledJob) => {
                  const scheduledTask = scheduleResult.scheduledTasks.find(
                    (task) => task.id === scheduledJob.taskId
                  );
                  if (scheduledTask) {
                    return db
                      .update(emailSendJobs)
                      .set({
                        triggerJobId: scheduledJob.triggerId,
                        updatedAt: new Date(),
                      })
                      .where(eq(emailSendJobs.id, scheduledTask.data.jobId));
                  }
                })
              );

              logger.info(
                `Scheduled ${scheduledJobs.length} new trigger jobs for session ${sessionId}`
              );
            }
          } catch (triggerError) {
            logger.error(
              `Failed to schedule trigger jobs for session ${sessionId}: ${triggerError}`
            );
            // Continue with other sessions even if one fails
          }
        }

        totalRescheduled += scheduleResult.scheduledTasks.length;

        logger.info(
          `Rescheduled ${scheduleResult.scheduledTasks.length} jobs for session ${sessionId}`
        );
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
