import { PREVIEW_DONOR_COUNT } from '@/app/(app)/campaign/steps/write-instruction-step/constants';
import {
  deleteEmailGenerationSession,
  getEmailGenerationSessionById,
  getGeneratedEmailsBySessionId,
  getScheduledEmailJobs,
  getSessionStatus as getSessionStatusData,
  checkSessionExists,
  getEmailBySessionAndDonor,
  updateGeneratedEmail,
  createGeneratedEmail,
  countEmailsBySessionAndStatus,
  getDonorIdsWithEmails,
  getDraftSessionByName,
  getDonorIdsWithExistingEmails,
  updateEmailStatusBulk,
  updateEmailGenerationSession,
  createEmailGenerationSession,
  listEmailGenerationSessions,
  getEmailStatsBySessionIds,
  deleteGeneratedEmails,
  getSessionsByCriteria,
  saveGeneratedEmail as saveGeneratedEmailData,
  updateEmailStatus,
  getEmailWithOrganizationCheck,
  getFullSessionById,
  checkEmailExists,
  countSessionsByOrganization,
  getEmailWithSessionAuth,
  updateGeneratedEmailContent,
  getEmailsBySessionWithDonor,
  markEmailsAsSent,
  updateEmailSendStatus,
  updateSessionsBatch,
} from '@/app/lib/data/email-campaigns';
import { EmailGenerationSessionStatus } from '@/app/lib/db/schema';
import { logger } from '@/app/lib/logger';
import {
  appendSignatureToEmail,
  removeSignatureFromContent,
} from '@/app/lib/utils/email-with-signature';
import { generateBulkEmailsTask } from '@/trigger/jobs/generateBulkEmails';
import { runs } from '@trigger.dev/sdk/v3';
import { TRPCError } from '@trpc/server';
import { EmailSchedulingService } from './email-scheduling.service';
import { UnifiedSmartEmailGenerationService } from './unified-smart-email-generation.service';
import { wrapDatabaseOperation } from '@/app/lib/utils/error-handler';

/**
 * Input types for campaign management
 */
export interface CreateSessionInput {
  campaignName: string;
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  selectedDonorIds: number[];
  previewDonorIds: number[];
  templateId?: number;
  // Signature configuration
  signatureType?: 'none' | 'custom' | 'staff';
  customSignature?: string;
  selectedStaffId?: number;
}

export interface ListCampaignsInput {
  limit?: number;
  offset?: number;
  status?: keyof typeof EmailGenerationSessionStatus;
}

export interface UpdateEmailInput {
  emailId: number;
  subject: string;
  structuredContent: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts: Record<string, string>;
}

export interface UpdateCampaignInput {
  campaignId: number;
  campaignName?: string;
  chatHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  selectedDonorIds?: number[];
  previewDonorIds?: number[];
  templateId?: number;
  scheduleConfig?: {
    dailyLimit?: number;
    minGapMinutes?: number;
    maxGapMinutes?: number;
    timezone?: string;
    allowedDays?: number[];
    allowedStartTime?: string;
    allowedEndTime?: string;
    allowedTimezone?: string;
    dailySchedules?: {
      [key: number]: {
        startTime: string;
        endTime: string;
        enabled: boolean;
      };
    };
  };
}

export interface RegenerateAllEmailsInput {
  sessionId: number;
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface SmartEmailGenerationInput {
  sessionId: number;
  mode: 'generate_more' | 'regenerate_all' | 'generate_with_new_message';
  // For generate_more: specify which new donors to generate for
  newDonorIds?: number[];
  // For generate_with_new_message: the new message to add to chat history
  newMessage?: string;
}

export interface SmartEmailGenerationResponse {
  success: boolean;
  sessionId: number;
  // Always return the updated chat history to keep frontend in sync
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  // Stats about what was done
  generatedEmailsCount?: number;
  deletedEmailsCount?: number;
  failedEmailsCount?: number;
  message: string;
}

export interface SaveDraftInput {
  sessionId?: number;
  campaignName: string;
  selectedDonorIds: number[];
  templateId?: number;
  chatHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  previewDonorIds?: number[];
  // Signature configuration
  signatureType?: 'none' | 'custom' | 'staff';
  customSignature?: string;
  selectedStaffId?: number;
}

export interface SaveGeneratedEmailInput {
  sessionId: number;
  donorId: number;
  subject: string;
  // Legacy format fields (optional for new emails)
  structuredContent?: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts?: Record<string, string>;
  // New format fields
  emailContent?: string;
  reasoning?: string;
  response?: string;
  isPreview?: boolean;
}

/**
 * Service for handling email campaign operations
 */
export class EmailCampaignsService {
  /**
   * Launch an existing draft campaign (transition from DRAFT to GENERATING/READY_TO_SEND)
   * @param input - Launch parameters
   * @param organizationId - The organization ID
   * @param userId - The user ID
   * @returns The launched session
   */
  async launchCampaign(input: UpdateCampaignInput, organizationId: string, userId: string) {
    try {
      // Validate required fields
      if (!input.selectedDonorIds || input.selectedDonorIds.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Selected donor IDs are required to launch a campaign',
        });
      }

      // First check if there's an existing campaign with the same ID
      const existingCampaign = await wrapDatabaseOperation(async () => {
        return await getEmailGenerationSessionById(input.campaignId, organizationId);
      });

      if (!existingCampaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      let sessionId: number = existingCampaign.id;

      // First, count existing emails (both PENDING_APPROVAL and APPROVED) for selected donors
      const existingEmailsForSelectedDonors = await wrapDatabaseOperation(async () => {
        const donorIds = await getDonorIdsWithExistingEmails(existingCampaign.id);
        return donorIds.map((donorId) => ({ donorId }));
      });

      // Count how many of the selected donors already have emails
      const existingDonorIds = existingEmailsForSelectedDonors.map((e) => e.donorId);
      const currentCompletedCount = input.selectedDonorIds.filter((id) =>
        existingDonorIds.includes(id)
      ).length;

      // Determine the appropriate status based on whether emails need to be generated
      const allEmailsExist = currentCompletedCount === input.selectedDonorIds.length;
      const newStatus = allEmailsExist
        ? EmailGenerationSessionStatus.READY_TO_SEND
        : EmailGenerationSessionStatus.GENERATING;

      // Update existing campaign with appropriate status
      logger.info(
        `[launchCampaign] Updating existing campaign ${existingCampaign[0].id} to ${newStatus} status`,
        {
          campaignId: existingCampaign[0].id,
          oldStatus: existingCampaign[0].status,
          newStatus,
          totalDonors: input.selectedDonorIds.length,
          currentCompletedCount,
          allEmailsExist,
          organizationId,
          userId,
        }
      );

      const updatedSession = await wrapDatabaseOperation(async () => {
        return await updateEmailGenerationSession(existingCampaign.id, organizationId, {
          status: newStatus,
          chatHistory: input.chatHistory ?? existingCampaign.chatHistory,
          selectedDonorIds: input.selectedDonorIds,
          previewDonorIds: input.previewDonorIds ?? [],
          totalDonors: input.selectedDonorIds.length,
          completedDonors: currentCompletedCount, // Set the initial completed count
        });
      });

      if (!updatedSession) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update session',
        });
      }

      sessionId = updatedSession.id;

      // Update any PENDING_APPROVAL emails to APPROVED
      await wrapDatabaseOperation(async () => {
        await updateEmailStatusBulk(sessionId, 'PENDING_APPROVAL', 'APPROVED', {
          isPreview: false,
          isSent: false,
          sendStatus: 'pending',
        });
      });

      logger.info(
        `Updated existing campaign session ${sessionId} to ${newStatus} with ${currentCompletedCount} completed donors for user ${userId}`
      );

      // Get the list of donors that already have approved emails
      const alreadyGeneratedDonorIds = await wrapDatabaseOperation(async () => {
        return await getDonorIdsWithEmails(sessionId, 'APPROVED');
      });
      const donorsToGenerate = input.selectedDonorIds.filter(
        (id) => !alreadyGeneratedDonorIds.includes(id)
      );

      // Only trigger background job if there are donors without emails
      if (donorsToGenerate.length > 0) {
        try {
          logger.info(
            `Attempting to trigger background job for session ${sessionId} with ${donorsToGenerate.length} donors`
          );

          await generateBulkEmailsTask.trigger({
            sessionId,
            organizationId,
            userId,
            selectedDonorIds: donorsToGenerate,
            previewDonorIds: input.previewDonorIds ?? [],
            chatHistory:
              input.chatHistory ??
              (existingCampaign.chatHistory as Array<{
                role: 'user' | 'assistant';
                content: string;
              }>) ??
              [],
            templateId: input.templateId ?? existingCampaign.templateId ?? undefined,
          });

          logger.info(
            `Successfully triggered email generation for ${donorsToGenerate.length} donors (${alreadyGeneratedDonorIds.length} already have emails) in session ${sessionId}`
          );
        } catch (triggerError) {
          logger.error(
            `Failed to trigger background job for session ${sessionId}: ${
              triggerError instanceof Error ? triggerError.message : String(triggerError)
            }`
          );

          // Update session with error message if trigger fails (keep status as GENERATING)
          await wrapDatabaseOperation(async () => {
            await updateEmailGenerationSession(sessionId, organizationId, {
              errorMessage: `Failed to start background job: ${
                triggerError instanceof Error ? triggerError.message : String(triggerError)
              }`,
            });
          });

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Failed to start email generation job. Please check your Trigger.dev configuration.',
          });
        }
      } else {
        logger.info(
          `[launchCampaign] All donors already have emails, session ${sessionId} already marked as ${EmailGenerationSessionStatus.READY_TO_SEND} (ready to send)`,
          {
            sessionId,
            totalDonors: input.selectedDonorIds.length,
            completedDonors: input.selectedDonorIds.length,
            organizationId,
            userId,
          }
        );

        // If all donors already have emails, ensure session status is READY_TO_SEND
        if (newStatus !== EmailGenerationSessionStatus.READY_TO_SEND) {
          await wrapDatabaseOperation(async () => {
            await updateEmailGenerationSession(sessionId, organizationId, {
              status: EmailGenerationSessionStatus.READY_TO_SEND,
              completedDonors: input.selectedDonorIds.length,
            });
          });
        }
      }

      // Call checkAndUpdateCampaignCompletion to ensure proper status after session update
      logger.info(
        `[launchCampaign] Calling checkAndUpdateCampaignCompletion for session ${sessionId} to ensure proper status`
      );
      await this.checkAndUpdateCampaignCompletion(sessionId, organizationId);

      return { sessionId };
    } catch (error) {
      logger.error(
        `Failed to launch email generation campaign: ${error instanceof Error ? error.message : String(error)}`
      );

      // If it's already a TRPCError, re-throw it
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to launch email generation campaign',
      });
    }
  }

  /**
   * Creates a new draft email generation session (does not trigger generation)
   * @param input - Session creation parameters
   * @param organizationId - The organization ID
   * @param userId - The user ID
   * @returns The created draft session
   */
  async createSession(input: CreateSessionInput, organizationId: string, userId: string) {
    try {
      // Check if there's already a draft with the same name
      const existingDraft = await wrapDatabaseOperation(async () => {
        return await getDraftSessionByName(organizationId, input.campaignName);
      });

      if (existingDraft) {
        // Update existing draft
        const updatedSession = await wrapDatabaseOperation(async () => {
          return await updateEmailGenerationSession(existingDraft.id, organizationId, {
            chatHistory: input.chatHistory,
            selectedDonorIds: input.selectedDonorIds,
            previewDonorIds: input.previewDonorIds,
            totalDonors: input.selectedDonorIds.length,
            completedDonors: 0,
          });
        });

        if (!updatedSession) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update draft session',
          });
        }

        logger.info(`Updated existing draft session ${updatedSession.id} for user ${userId}`);
        return { sessionId: updatedSession.id };
      } else {
        // Create new draft session
        const session = await wrapDatabaseOperation(async () => {
          return await createEmailGenerationSession({
            organizationId,
            userId,
            templateId: input.templateId,
            jobName: input.campaignName,
            chatHistory: input.chatHistory,
            selectedDonorIds: input.selectedDonorIds,
            previewDonorIds: input.previewDonorIds,
            totalDonors: input.selectedDonorIds.length,
            completedDonors: 0,
            status: EmailGenerationSessionStatus.DRAFT, // Always create as DRAFT
          });
        });

        logger.info(`Created new draft session ${session.id} for user ${userId}`);
        return { sessionId: session.id };
      }
    } catch (error) {
      logger.error('Error in createSession:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create session',
      });
    }
  }

  /**
   * Gets an email generation session with generated emails
   * @param sessionId - The session ID
   * @param organizationId - The organization ID for authorization
   * @param customSignature - Optional custom signature to use instead of assigned staff signatures
   * @returns The session with emails
   */
  async getSession(sessionId: number, organizationId: string, customSignature?: string) {
    try {
      const session = await getEmailGenerationSessionById(sessionId, organizationId);

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      // Get generated emails for this session
      const emails = await getGeneratedEmailsBySessionId(sessionId);

      // Append signatures to each email for display
      const emailsWithSignatures = await Promise.all(
        emails.map(async (email) => {
          const structuredContent = email.structuredContent as Array<{
            piece: string;
            references: string[];
            addNewlineAfter: boolean;
          }>;

          const contentWithSignature = await appendSignatureToEmail(structuredContent, {
            donorId: email.donorId,
            organizationId: organizationId,
            userId: session.userId,
            customSignature: customSignature, // Pass the custom signature from UI
          });

          return {
            ...email,
            structuredContent: contentWithSignature,
          };
        })
      );

      return {
        session,
        emails: emailsWithSignatures,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to get email generation session: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get email generation session',
      });
    }
  }

  /**
   * Gets the status of an email generation session
   * @param sessionId - The session ID
   * @param organizationId - The organization ID for authorization
   * @returns The session status
   */
  async getSessionStatus(sessionId: number, organizationId: string) {
    const session = await wrapDatabaseOperation(async () => {
      return await getSessionStatusData(sessionId, organizationId);
    });

    if (!session) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
    }

    // Failsafe: If status is GENERATING or READY_TO_SEND but all donors are completed, update to COMPLETED
    if (
      (session.status === EmailGenerationSessionStatus.GENERATING ||
        session.status === EmailGenerationSessionStatus.READY_TO_SEND) &&
      session.completedDonors >= session.totalDonors &&
      session.totalDonors > 0
    ) {
      logger.info(
        `Session ${sessionId} shows as ${session.status} but all donors are completed. Updating to ${EmailGenerationSessionStatus.COMPLETED}.`
      );

      await wrapDatabaseOperation(async () => {
        await updateEmailGenerationSession(sessionId, organizationId, {
          status: EmailGenerationSessionStatus.COMPLETED,
          completedAt: new Date(),
        });
      });

      return {
        ...session,
        status: EmailGenerationSessionStatus.COMPLETED,
      };
    }

    return session;
  }

  /**
   * Lists campaigns with filtering and pagination
   * @param input - Filtering and pagination options
   * @param organizationId - The organization ID for authorization
   * @returns Campaigns list with counts
   */
  async listCampaigns(input: ListCampaignsInput, organizationId: string) {
    const { limit = 10, offset = 0, status } = input;

    const whereClauses = [eq(emailGenerationSessions.organizationId, organizationId)];
    if (status) {
      whereClauses.push(eq(emailGenerationSessions.status, status));
    }

    // Get campaigns without email counts first
    const campaignsResult = await wrapDatabaseOperation(async () => {
      return await listEmailGenerationSessions(organizationId, { limit, offset, status });
    });

    const campaigns = campaignsResult.sessions.map((session) => ({
      id: session.id,
      campaignName: session.jobName,
      status: session.status,
      totalDonors: session.totalDonors,
      completedDonors: session.completedDonors,
      errorMessage: session.errorMessage,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt,
    }));

    // Check and fix stuck campaigns in batch
    const campaignsToCheck = campaigns
      .filter(
        (campaign) =>
          campaign.status === EmailGenerationSessionStatus.GENERATING ||
          campaign.status === EmailGenerationSessionStatus.READY_TO_SEND
      )
      .map((campaign) => campaign.id);

    let batchResults = new Map();
    if (campaignsToCheck.length > 0) {
      try {
        batchResults = await this.checkAndUpdateMultipleCampaignCompletion(
          campaignsToCheck,
          organizationId
        );
      } catch (error) {
        logger.warn(
          `Failed to check completion for campaigns ${campaignsToCheck.join(', ')}: ${error}`
        );
      }
    }

    // Get email counts for all campaigns in batch
    const allSessionIds = campaigns.map((c) => c.id);
    const emailCounts = await wrapDatabaseOperation(async () => {
      const stats = await getEmailStatsBySessionIds(allSessionIds);
      return stats.map((stat) => ({
        sessionId: stat.sessionId,
        totalEmails: stat.totalEmails,
        sentEmails: stat.sentEmails,
      }));
    });

    // Create lookup map for email counts
    const emailCountsMap = new Map();
    emailCounts.forEach((count) => {
      emailCountsMap.set(count.sessionId, count);
    });

    // Get updated campaign statuses in batch
    const updatedCampaigns = await wrapDatabaseOperation(async () => {
      const sessions = await getSessionsByCriteria(organizationId, { sessionIds: allSessionIds });
      return sessions.map((session) => ({
        id: session.id,
        status: session.status,
        completedDonors: session.completedDonors,
      }));
    });

    const updatedCampaignsMap = new Map();
    updatedCampaigns.forEach((campaign) => {
      updatedCampaignsMap.set(campaign.id, campaign);
    });

    // Combine all data
    const campaignsWithCounts = campaigns.map((campaign) => {
      const emailCount = emailCountsMap.get(campaign.id) || { totalEmails: 0, sentEmails: 0 };
      const updatedData = updatedCampaignsMap.get(campaign.id);

      return {
        ...campaign,
        status: updatedData?.status ?? campaign.status,
        completedDonors: updatedData?.completedDonors ?? campaign.completedDonors,
        sentEmails: emailCount.sentEmails,
        totalEmails: emailCount.totalEmails,
      };
    });

    const totalCount = await wrapDatabaseOperation(async () => {
      return await countSessionsByOrganization(organizationId, status);
    });

    return { campaigns: campaignsWithCounts, totalCount };
  }

  /**
   * Deletes a campaign and its associated emails
   * @param campaignId - The campaign ID
   * @param organizationId - The organization ID for authorization
   * @returns The deleted campaign ID
   */
  async deleteCampaign(campaignId: number, organizationId: string) {
    // First, verify the job belongs to the organization
    const campaign = await getEmailGenerationSessionById(campaignId, organizationId);

    if (!campaign) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
    }

    // Get all scheduled jobs that need to be cancelled
    const scheduledJobs = await getScheduledEmailJobs(campaignId, organizationId);

    // Cancel all pending Trigger.dev jobs
    if (scheduledJobs.length > 0) {
      const cancelPromises = scheduledJobs
        .filter((job) => job.triggerJobId)
        .map((job) =>
          runs.cancel(job.triggerJobId!).catch((error) => {
            logger.warn(`Failed to cancel trigger job ${job.triggerJobId}: ${error}`);
          })
        );

      await Promise.all(cancelPromises);
      logger.info(`Cancelled ${scheduledJobs.length} scheduled jobs for campaign ${campaignId}`);
    }

    // Delete the campaign and its emails using data layer
    await deleteEmailGenerationSession(campaignId, organizationId);

    logger.info(
      `Campaign ${campaignId} and associated emails deleted for organization ${organizationId}`
    );
    return { campaignId };
  }

  /**
   * Updates email approval status
   * @param emailId - The email ID
   * @param status - The new status (PENDING_APPROVAL or APPROVED)
   * @param organizationId - The organization ID for authorization
   * @returns The updated email
   */
  async updateEmailStatus(
    emailId: number,
    status: 'PENDING_APPROVAL' | 'APPROVED',
    organizationId: string
  ) {
    try {
      // First verify the email exists and belongs to the user's organization
      const existingEmail = await wrapDatabaseOperation(async () => {
        return await getEmailWithSessionAuth(emailId, organizationId);
      });

      if (!existingEmail) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Email not found',
        });
      }

      if (existingEmail.isSent) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot change status of an email that has already been sent',
        });
      }

      // Update the email status
      const updatedEmail = await wrapDatabaseOperation(async () => {
        return await updateEmailStatus(emailId, status);
      });

      if (!updatedEmail) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update email status',
        });
      }

      logger.info(
        `Updated email ${emailId} status from ${existingEmail.currentStatus} to ${status} for organization ${organizationId}`
      );

      return {
        success: true,
        email: updatedEmail,
        message: `Email ${status === 'APPROVED' ? 'approved' : 'marked as pending'}`,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to update email status: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update email status',
      });
    }
  }

  /**
   * Gets email sending status
   * @param emailId - The email ID
   * @param organizationId - The organization ID for authorization
   * @returns The email status
   */
  async getEmailStatus(emailId: number, organizationId: string) {
    try {
      logger.info(
        `Getting email status for emailId: ${emailId}, organizationId: ${organizationId}`
      );

      // Validate emailId
      if (!emailId || emailId <= 0) {
        logger.warn(`Invalid emailId provided: ${emailId}`);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid email ID provided',
        });
      }

      const email = await wrapDatabaseOperation(async () => {
        return await getEmailWithOrganizationCheck(emailId, organizationId);
      });

      if (!email) {
        logger.warn(`Email not found for emailId: ${emailId}, organizationId: ${organizationId}`);
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Email not found',
        });
      }

      logger.info(
        `Successfully retrieved email status for emailId: ${emailId}, isSent: ${email.isSent}`
      );
      return email;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to get email status for emailId: ${emailId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get email status',
      });
    }
  }

  /**
   * Updates email content and subject
   * @param input - Update parameters
   * @param organizationId - The organization ID for authorization
   * @returns The updated email
   */
  async updateEmail(input: UpdateEmailInput, organizationId: string) {
    try {
      // First verify the email exists and belongs to the user's organization
      const existingEmail = await wrapDatabaseOperation(async () => {
        return await getEmailWithSessionAuth(input.emailId, organizationId);
      });

      if (!existingEmail) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Email not found',
        });
      }

      if (existingEmail.isSent) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot edit an email that has already been sent',
        });
      }

      // Remove signature from content before saving
      const contentWithoutSignature = removeSignatureFromContent(input.structuredContent);

      // Update the email and reset status to PENDING_APPROVAL since content was edited
      const updatedEmail = await wrapDatabaseOperation(async () => {
        return await updateGeneratedEmailContent(input.emailId, {
          subject: input.subject,
          structuredContent: contentWithoutSignature, // Save without signature
          referenceContexts: input.referenceContexts,
          status: 'PENDING_APPROVAL', // Reset status when email is edited
        });
      });

      if (!updatedEmail) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update email',
        });
      }

      logger.info(
        `Updated email ${input.emailId} for organization ${organizationId}: subject="${input.subject}" and reset status to PENDING_APPROVAL`
      );

      return {
        success: true,
        email: updatedEmail,
        message: 'Email updated successfully and marked for review',
        sessionId: existingEmail.sessionId,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to update email: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update email',
      });
    }
  }

  /**
   * Updates campaign data (for editing campaigns)
   * @param input - Update parameters
   * @param organizationId - The organization ID for authorization
   * @returns The updated campaign
   */
  async updateCampaign(input: UpdateCampaignInput, organizationId: string) {
    try {
      // First verify the campaign exists and belongs to the user's organization
      const existingCampaign = await wrapDatabaseOperation(async () => {
        return await getEmailGenerationSessionById(input.campaignId, organizationId);
      });

      if (!existingCampaign) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      // Check if only schedule config is being updated
      const isOnlyScheduleUpdate =
        input.scheduleConfig !== undefined &&
        !input.campaignName &&
        !input.chatHistory &&
        !input.selectedDonorIds &&
        !input.previewDonorIds &&
        input.templateId === undefined;

      // Don't allow editing other fields if campaign is processing
      if (
        (existingCampaign.status === EmailGenerationSessionStatus.GENERATING ||
          existingCampaign.status === EmailGenerationSessionStatus.READY_TO_SEND) &&
        !isOnlyScheduleUpdate
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Cannot edit campaign content while it is currently processing. You can only update schedule settings.',
        });
      }

      // Build update object with only provided fields
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (input.campaignName) {
        updateData.jobName = input.campaignName;
      }

      if (input.chatHistory) {
        updateData.chatHistory = input.chatHistory;
      }
      if (input.selectedDonorIds) {
        updateData.selectedDonorIds = input.selectedDonorIds;
        updateData.totalDonors = input.selectedDonorIds.length;
      }
      if (input.previewDonorIds !== undefined) {
        updateData.previewDonorIds = input.previewDonorIds;
      }
      if (input.templateId !== undefined) {
        updateData.templateId = input.templateId;
      }
      if (input.scheduleConfig !== undefined) {
        updateData.scheduleConfig = input.scheduleConfig;
      }

      // Update the campaign
      const updatedCampaign = await wrapDatabaseOperation(async () => {
        return await updateEmailGenerationSession(input.campaignId, organizationId, updateData);
      });

      if (!updatedCampaign) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update campaign',
        });
      }

      // If schedule config was updated and campaign has scheduled emails, reschedule them
      if (input.scheduleConfig !== undefined && isOnlyScheduleUpdate) {
        try {
          // Use the new EmailSchedulingService method to reschedule the campaign
          const schedulingService = new EmailSchedulingService();

          // Get current user ID from the session
          const session = await wrapDatabaseOperation(async () => {
            return await getEmailGenerationSessionById(input.campaignId, organizationId);
          });

          if (!session) {
            throw new Error('Session not found for rescheduling');
          }

          // First pause the campaign to cancel existing jobs
          try {
            await schedulingService.pauseCampaign(input.campaignId, organizationId);
            logger.info(`Paused campaign ${input.campaignId} for rescheduling`);
          } catch (pauseError) {
            // If pause fails because there are no scheduled emails, that's fine
            logger.info(`No scheduled emails to pause for campaign ${input.campaignId}`);
          }

          // Check if there are any unsent emails
          const unsentCount = await wrapDatabaseOperation(async () => {
            const emails = await getGeneratedEmailsBySessionId(input.campaignId);
            return emails.filter((email) => !email.isSent).length;
          });

          // Reschedule the emails with the new configuration if there are unsent emails
          if (unsentCount > 0) {
            const rescheduleResult = await schedulingService.scheduleEmailCampaign(
              input.campaignId,
              organizationId,
              session.userId,
              input.scheduleConfig
            );

            logger.info(
              `Rescheduled ${rescheduleResult.scheduled} emails for campaign ${input.campaignId} with new schedule configuration`
            );

            return {
              success: true,
              campaign: updatedCampaign,
              message: `Campaign schedule updated and ${rescheduleResult.scheduled} emails rescheduled successfully. ${rescheduleResult.scheduledForToday} will be sent today, ${rescheduleResult.scheduledForLater} scheduled for later.`,
            };
          } else {
            return {
              success: true,
              campaign: updatedCampaign,
              message: 'Campaign schedule updated successfully. No emails needed rescheduling.',
            };
          }
        } catch (error) {
          logger.error(
            `Failed to reschedule emails after schedule update: ${error instanceof Error ? error.message : String(error)}`
          );
          // Even if rescheduling fails, the update was successful
          return {
            success: true,
            campaign: updatedCampaign,
            message:
              'Campaign schedule updated successfully, but rescheduling failed. Please manually reschedule the emails.',
          };
        }
      }

      logger.info(`Updated campaign ${input.campaignId} for organization ${organizationId}`);

      return {
        success: true,
        campaign: updatedCampaign,
        message:
          input.scheduleConfig !== undefined && isOnlyScheduleUpdate
            ? 'Campaign schedule updated successfully.'
            : 'Campaign updated successfully',
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to update campaign: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update campaign',
      });
    }
  }

  /**
   * Regenerates all emails for a campaign with new instructions
   * This will delete existing preview emails and regenerate for preview donors only
   * @param input - Regeneration parameters
   * @param organizationId - The organization ID for authorization
   * @param userId - The user ID
   * @returns The result of the regeneration
   */
  async regenerateAllEmails(
    input: RegenerateAllEmailsInput,
    organizationId: string,
    userId: string
  ) {
    try {
      // First verify the session exists and belongs to the user's organization
      const existingSession = await wrapDatabaseOperation(async () => {
        return await getEmailGenerationSessionById(input.sessionId, organizationId);
      });

      if (!existingSession) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign session not found',
        });
      }

      // Get preview donor IDs from the session
      const previewDonorIds = (existingSession.previewDonorIds as number[]) || [];

      logger.info(
        `[regenerateAllEmails] Session ${input.sessionId} has previewDonorIds: ${JSON.stringify(previewDonorIds)}`
      );

      // Get all emails for this session to understand what's happening
      const allSessionEmails = await wrapDatabaseOperation(async () => {
        const emails = await getGeneratedEmailsBySessionId(input.sessionId);
        return emails.map((email) => ({
          donorId: email.donorId,
          isPreview: email.isPreview,
          status: email.status,
        }));
      });

      logger.info(
        `[regenerateAllEmails] All emails in session: ${JSON.stringify(allSessionEmails)}`
      );

      // Get all donors that have preview emails in this session
      const existingPreviewEmails = allSessionEmails.filter((e) => e.isPreview === true);
      const allPreviewDonorIds = [...new Set(existingPreviewEmails.map((e) => e.donorId))];

      // Also check if there are any emails with PENDING_APPROVAL status (these might be preview emails too)
      const pendingApprovalEmails = allSessionEmails.filter((e) => e.status === 'PENDING_APPROVAL');
      const pendingApprovalDonorIds = [...new Set(pendingApprovalEmails.map((e) => e.donorId))];

      logger.info(
        `[regenerateAllEmails] Found ${allPreviewDonorIds.length} donors with isPreview=true, ${pendingApprovalDonorIds.length} with PENDING_APPROVAL status`
      );

      // Combine all potential preview donors
      const combinedDonorIds = [
        ...new Set([...allPreviewDonorIds, ...pendingApprovalDonorIds, ...previewDonorIds]),
      ];

      logger.info(
        `[regenerateAllEmails] Combined donor IDs (preview + pending + stored): ${JSON.stringify(combinedDonorIds)}`
      );

      // Use combined list for regeneration
      let donorsToRegenerate = combinedDonorIds;

      if (donorsToRegenerate.length === 0) {
        // If no preview donors exist, randomly select from selectedDonorIds
        const selectedDonorIds = (existingSession.selectedDonorIds as number[]) || [];
        if (selectedDonorIds.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No donors available for preview generation',
          });
        }

        // Use the same preview donor count as frontend
        const numToSelect = Math.min(selectedDonorIds.length, PREVIEW_DONOR_COUNT);
        const shuffled = [...selectedDonorIds].sort(() => Math.random() - 0.5);
        donorsToRegenerate = shuffled.slice(0, numToSelect);

        // Update the session with the new preview donor IDs
        await wrapDatabaseOperation(async () => {
          await updateEmailGenerationSession(input.sessionId, organizationId, {
            previewDonorIds: donorsToRegenerate,
          });
        });

        logger.info(
          `[regenerateAllEmails] No preview donors found, randomly selected ${donorsToRegenerate.length} donors: ${JSON.stringify(
            donorsToRegenerate
          )}`
        );
      }

      logger.info(
        `[regenerateAllEmails] Regenerating emails for ${donorsToRegenerate.length} preview donors in session ${
          input.sessionId
        }: ${JSON.stringify(donorsToRegenerate)}`
      );

      // Delete only preview emails (emails for preview donors)
      const deleteResult = await db
        .delete(generatedEmails)
        .where(
          and(
            eq(generatedEmails.sessionId, input.sessionId),
            inArray(generatedEmails.donorId, donorsToRegenerate)
          )
        )
        .returning({ id: generatedEmails.id });

      const deletedCount = deleteResult.length;
      logger.info(`Deleted ${deletedCount} preview emails for session ${input.sessionId}`);

      // Use the chat history from input
      const finalChatHistory = input.chatHistory;

      // Update the session chat history ONLY - do not modify donor lists
      await db
        .update(emailGenerationSessions)
        .set({
          chatHistory: finalChatHistory,
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, input.sessionId));

      // Now regenerate emails for preview donors using the same service as preview generation
      const emailGenerationService = new UnifiedSmartEmailGenerationService();

      logger.info(`Starting email regeneration for ${donorsToRegenerate.length} preview donors`);

      const generationResult = await emailGenerationService.generateSmartEmailsForCampaign({
        organizationId,
        sessionId: String(input.sessionId),
        chatHistory: finalChatHistory,
        donorIds: donorsToRegenerate.map((id) => String(id)),
      });

      logger.info(
        `Regenerated ${generationResult.results.length} emails for session ${input.sessionId}, tokens used: ${generationResult.totalTokensUsed}`
      );

      // Count successful regenerations
      const successfulCount = generationResult.results.filter((r) => r.email !== null).length;
      const failedCount = generationResult.results.filter((r) => r.email === null).length;

      return {
        success: true,
        sessionId: existingSession.id,
        deletedEmailsCount: deletedCount,
        regeneratedEmailsCount: successfulCount,
        failedEmailsCount: failedCount,
        message: `Regenerated ${successfulCount} emails for preview donors`,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to regenerate emails: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to regenerate emails',
      });
    }
  }

  /**
   * Unified smart email generation - handles generate more, regenerate all, and generate with new message
   * @param input - Generation parameters
   * @param organizationId - The organization ID
   * @param userId - The user ID
   * @returns Generation result with updated chat history
   */
  async smartEmailGeneration(
    input: SmartEmailGenerationInput,
    organizationId: string,
    userId: string
  ): Promise<SmartEmailGenerationResponse> {
    try {
      // First verify the session exists and belongs to the user's organization
      const existingSession = await wrapDatabaseOperation(async () => {
        return await getEmailGenerationSessionById(input.sessionId, organizationId);
      });

      if (!existingSession) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Campaign session not found',
        });
      }

      // Get existing chat history from database (source of truth)
      const existingChatHistory =
        (existingSession.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) ||
        [];
      let finalChatHistory = existingChatHistory;

      // Handle generate_with_new_message mode
      if (input.mode === 'generate_with_new_message') {
        if (!input.newMessage?.trim()) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'New message is required for generate_with_new_message mode',
          });
        }

        // Append new message to chat history
        finalChatHistory = [
          ...existingChatHistory,
          { role: 'user' as const, content: input.newMessage.trim() },
        ];

        // Update chat history in database
        await wrapDatabaseOperation(async () => {
          await updateEmailGenerationSession(input.sessionId, organizationId, {
            chatHistory: finalChatHistory,
          });
        });

        logger.info(
          `[smartEmailGeneration] Updated chat history for session ${input.sessionId} with new message`
        );
      }

      // Get preview donor IDs from the session
      const previewDonorIds = (existingSession.previewDonorIds as number[]) || [];

      logger.info(
        `[smartEmailGeneration] Session ${input.sessionId} mode: ${input.mode}, previewDonorIds: ${JSON.stringify(
          previewDonorIds
        )}`
      );

      let donorsToProcess: number[] = [];
      let shouldDeleteExisting = false;

      if (input.mode === 'generate_more') {
        // Generate emails for new donors
        if (!input.newDonorIds || input.newDonorIds.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'newDonorIds are required for generate_more mode',
          });
        }

        donorsToProcess = input.newDonorIds;
        shouldDeleteExisting = false;

        // Add new donors to preview set permanently
        const updatedPreviewDonorIds = [...new Set([...previewDonorIds, ...input.newDonorIds])];
        await wrapDatabaseOperation(async () => {
          await updateEmailGenerationSession(input.sessionId, organizationId, {
            previewDonorIds: updatedPreviewDonorIds,
          });
        });

        logger.info(
          `[smartEmailGeneration] Added ${input.newDonorIds.length} new donors to preview set`
        );
      } else if (input.mode === 'regenerate_all' || input.mode === 'generate_with_new_message') {
        // For regenerate_all and generate_with_new_message, always use existing preview donors
        // The preview donors should already be stored in the session from creation

        logger.info(
          `[smartEmailGeneration] Preview donors from session: ${JSON.stringify(previewDonorIds)}`
        );

        if (previewDonorIds.length > 0) {
          // Use existing preview donors from the session - this is the normal case
          donorsToProcess = previewDonorIds;
          logger.info(
            `[smartEmailGeneration] Using existing preview donors from session: ${JSON.stringify(
              previewDonorIds
            )}`
          );
        } else {
          // This should only happen if the session was created without preview donors
          // Try to find existing preview donors from generated emails in this session first
          const existingPreviewEmails = await wrapDatabaseOperation(async () => {
            const emails = await getGeneratedEmailsBySessionId(input.sessionId);
            return emails
              .filter((email) => email.isPreview === true)
              .map((email) => ({ donorId: email.donorId }));
          });

          const existingPreviewDonorIds = [...new Set(existingPreviewEmails.map((e) => e.donorId))];

          if (existingPreviewDonorIds.length > 0) {
            // Use existing preview donors from previous emails
            donorsToProcess = existingPreviewDonorIds;

            // Update the session with the found preview donor IDs
            await wrapDatabaseOperation(async () => {
              await updateEmailGenerationSession(input.sessionId, organizationId, {
                previewDonorIds: existingPreviewDonorIds,
              });
            });

            logger.info(
              `[smartEmailGeneration] Found existing preview donors from generated emails: ${JSON.stringify(
                existingPreviewDonorIds
              )}`
            );
          } else {
            // Last resort: session has no preview donors, generate them now
            const selectedDonorIds = (existingSession.selectedDonorIds as number[]) || [];
            if (selectedDonorIds.length === 0) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'No donors available for preview generation',
              });
            }

            // Use the same preview donor count as frontend
            const numToSelect = Math.min(selectedDonorIds.length, PREVIEW_DONOR_COUNT);
            const shuffled = [...selectedDonorIds].sort(() => Math.random() - 0.5);
            const randomPreviewDonorIds = shuffled.slice(0, numToSelect);

            // Update the session with the new preview donor IDs
            await wrapDatabaseOperation(async () => {
              await updateEmailGenerationSession(input.sessionId, organizationId, {
                previewDonorIds: randomPreviewDonorIds,
              });
            });

            logger.info(
              `[smartEmailGeneration] Session had no preview donors, randomly selected ${randomPreviewDonorIds.length} donors: ${JSON.stringify(
                randomPreviewDonorIds
              )}`
            );

            donorsToProcess = randomPreviewDonorIds;
          }
        }
        shouldDeleteExisting = true;
      }

      // Delete existing emails if needed
      let deletedCount = 0;
      if (shouldDeleteExisting) {
        deletedCount = await wrapDatabaseOperation(async () => {
          return await deleteGeneratedEmails(input.sessionId, donorsToProcess);
        });

        logger.info(
          `[smartEmailGeneration] Deleted ${deletedCount} existing emails for session ${input.sessionId}`
        );
      }

      // Generate emails using the unified service
      const emailGenerationService = new UnifiedSmartEmailGenerationService();

      logger.info(
        `[smartEmailGeneration] Starting email generation for ${donorsToProcess.length} donors`
      );

      const generationResult = await emailGenerationService.generateSmartEmailsForCampaign({
        organizationId,
        sessionId: String(input.sessionId),
        chatHistory: finalChatHistory,
        donorIds: donorsToProcess.map((id) => String(id)),
      });

      logger.info(
        `[smartEmailGeneration] Generated ${generationResult.results.length} emails for session ${input.sessionId}, tokens used: ${generationResult.totalTokensUsed}`
      );

      // Count successful and failed generations
      const successfulCount = generationResult.results.filter((r) => r.email !== null).length;
      const failedCount = generationResult.results.filter((r) => r.email === null).length;

      // Create response message based on mode
      let message = '';
      if (input.mode === 'generate_more') {
        message = `Generated ${successfulCount} emails for ${donorsToProcess.length} new donors`;
      } else if (input.mode === 'regenerate_all') {
        message = `Regenerated ${successfulCount} emails for ${donorsToProcess.length} preview donors`;
      } else if (input.mode === 'generate_with_new_message') {
        message = `Generated ${successfulCount} emails with new instructions for ${donorsToProcess.length} preview donors`;
      }

      return {
        success: true,
        sessionId: existingSession.id,
        chatHistory: finalChatHistory,
        generatedEmailsCount: successfulCount,
        deletedEmailsCount: deletedCount,
        failedEmailsCount: failedCount,
        message,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `[smartEmailGeneration] Failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate emails',
      });
    }
  }

  /**
   * Saves a campaign as a draft - creates or updates an email generation session with DRAFT status
   * @param input - Draft campaign data
   * @param organizationId - The organization ID
   * @param userId - The user ID
   * @returns The draft session
   */
  async saveDraft(input: SaveDraftInput, organizationId: string, userId: string) {
    logger.info(`[saveDraft] Called with input:`, {
      sessionId: input.sessionId,
      campaignName: input.campaignName,
      selectedDonorCount: input.selectedDonorIds?.length,
      selectedDonorIds: input.selectedDonorIds,
      templateId: input.templateId,
      organizationId,
      userId,
    });

    // Validate required fields
    if (!input.campaignName || !input.selectedDonorIds || input.selectedDonorIds.length === 0) {
      logger.error(`[saveDraft] Missing required fields:`, {
        hasCampaignName: !!input.campaignName,
        hasSelectedDonorIds: !!input.selectedDonorIds,
        selectedDonorCount: input.selectedDonorIds?.length || 0,
      });
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Campaign name and selected donors are required',
      });
    }

    try {
      if (input.sessionId) {
        logger.info(`[saveDraft] Attempting to update existing draft session ${input.sessionId}`);

        // First check if the session exists and its current status
        const existingSession = await wrapDatabaseOperation(async () => {
          return await getEmailGenerationSessionById(input.sessionId!, organizationId);
        });

        logger.info(`[saveDraft] Existing session lookup result:`, {
          found: !!existingSession,
          status: existingSession?.status,
          sessionId: existingSession?.id,
        });

        // Update existing draft
        const updateData = {
          jobName: input.campaignName,
          selectedDonorIds: input.selectedDonorIds,
          totalDonors: input.selectedDonorIds.length,
          templateId: input.templateId,
          chatHistory: input.chatHistory || [],
          previewDonorIds: input.previewDonorIds || [],
          updatedAt: new Date(),
        };

        logger.info(`[saveDraft] Updating session with data:`, {
          ...updateData,
          chatHistoryLength: updateData.chatHistory.length,
          existingStatus: existingSession?.status,
          lastTwoMessages: updateData.chatHistory.slice(-2).map((m) => ({
            role: m.role,
            contentPreview: m.content.substring(0, 50) + '...',
          })),
        });

        const updatedSession = await wrapDatabaseOperation(async () => {
          return await updateEmailGenerationSession(input.sessionId!, organizationId, updateData);
        });

        if (!updatedSession) {
          logger.error(
            `[saveDraft] Failed to update session ${input.sessionId} - session not found`
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Session not found',
          });
        }

        logger.info(`[saveDraft] Successfully updated draft session ${input.sessionId}`);
        return { sessionId: updatedSession.id };
      } else {
        logger.info(`[saveDraft] Creating new draft session`);

        const newSessionData = {
          organizationId,
          userId,
          templateId: input.templateId,
          jobName: input.campaignName,
          chatHistory: input.chatHistory || [],
          selectedDonorIds: input.selectedDonorIds,
          previewDonorIds: [], // Will be populated when generating preview
          totalDonors: input.selectedDonorIds.length,
          completedDonors: 0,
          status: 'DRAFT' as const,
        };

        logger.info(`[saveDraft] Creating session with data:`, {
          ...newSessionData,
          chatHistoryLength: newSessionData.chatHistory.length,
          lastMessage:
            newSessionData.chatHistory.length > 0
              ? {
                  role: newSessionData.chatHistory[newSessionData.chatHistory.length - 1].role,
                  contentPreview:
                    newSessionData.chatHistory[
                      newSessionData.chatHistory.length - 1
                    ].content.substring(0, 50) + '...',
                }
              : null,
        });

        // Create new draft
        const newSession = await wrapDatabaseOperation(async () => {
          return await createEmailGenerationSession(newSessionData);
        });

        logger.info(`[saveDraft] Successfully created new draft session ${newSession.id}`);
        return { sessionId: newSession.id };
      }
    } catch (error) {
      if (error instanceof TRPCError) {
        logger.error(`[saveDraft] TRPC error:`, error.message);
        throw error;
      }
      logger.error(`[saveDraft] Unexpected error:`, {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save draft',
      });
    }
  }

  /**
   * Checks and updates completion status for multiple campaigns in batch
   * @param sessionIds - Array of session IDs to check
   * @param organizationId - The organization ID
   * @returns Map of sessionId to updated status info
   */
  async checkAndUpdateMultipleCampaignCompletion(sessionIds: number[], organizationId: string) {
    if (sessionIds.length === 0) return new Map();

    try {
      // Get all sessions in batch
      const sessions = await wrapDatabaseOperation(async () => {
        return await getSessionsByCriteria(organizationId, { sessionIds });
      });

      if (sessions.length === 0) return new Map();

      // Get email stats for all sessions in batch
      const emailStats = await wrapDatabaseOperation(async () => {
        return await getEmailStatsBySessionIds(sessionIds);
      });

      // Create lookup map for email stats
      const emailStatsMap = new Map();
      emailStats.forEach((stats) => {
        emailStatsMap.set(stats.sessionId, stats);
      });

      const results = new Map();
      const sessionsToUpdate = [];

      logger.info(
        `[checkAndUpdateMultipleCampaignCompletion] Checking ${sessions.length} campaigns in batch`,
        {
          sessionIds,
          organizationId,
        }
      );

      // Process each session
      for (const session of sessions) {
        const stats = emailStatsMap.get(session.id) || {
          totalEmails: 0,
          sentEmails: 0,
          approvedEmails: 0,
        };
        const selectedDonorIds = (session.selectedDonorIds as number[]) || [];
        const totalDonors = selectedDonorIds.length;

        let shouldUpdate = false;
        let newStatus = session.status;
        let newCompletedDonors = session.completedDonors;

        // Same logic as individual function but collected for batch update
        if (
          session.status === EmailGenerationSessionStatus.GENERATING &&
          stats.approvedEmails > 0
        ) {
          logger.info(
            `[checkAndUpdateMultipleCampaignCompletion] Campaign ${session.id} moving from GENERATING to READY_TO_SEND`
          );
          newStatus = EmailGenerationSessionStatus.READY_TO_SEND;
          newCompletedDonors = stats.approvedEmails;
          shouldUpdate = true;
        }

        // Check for completion (works for both IN_PROGRESS and campaigns that were just updated)
        if (
          (session.status === EmailGenerationSessionStatus.READY_TO_SEND ||
            (session.status === EmailGenerationSessionStatus.GENERATING &&
              stats.approvedEmails > 0)) &&
          stats.totalEmails > 0 &&
          stats.totalEmails === stats.sentEmails
        ) {
          logger.info(
            `[checkAndUpdateMultipleCampaignCompletion] Campaign ${session.id} completed - all emails sent`
          );
          newStatus = EmailGenerationSessionStatus.COMPLETED;
          newCompletedDonors = totalDonors;
          shouldUpdate = true;
        } else if (
          (session.status === EmailGenerationSessionStatus.READY_TO_SEND ||
            session.status === EmailGenerationSessionStatus.GENERATING) &&
          stats.approvedEmails === totalDonors &&
          stats.sentEmails === 0
        ) {
          // All emails generated but none sent yet - ensure status is READY_TO_SEND
          if (session.status === EmailGenerationSessionStatus.GENERATING) {
            logger.info(
              `[checkAndUpdateMultipleCampaignCompletion] Campaign ${session.id} all emails generated, moving to READY_TO_SEND`
            );
            newStatus = EmailGenerationSessionStatus.READY_TO_SEND;
            newCompletedDonors = totalDonors;
            shouldUpdate = true;
          }
        }

        if (shouldUpdate) {
          sessionsToUpdate.push({
            id: session.id,
            status: newStatus,
            completedDonors: newCompletedDonors,
            shouldSetCompletedAt: newStatus === EmailGenerationSessionStatus.COMPLETED,
          });
        }

        results.set(session.id, {
          status: newStatus,
          completedDonors: newCompletedDonors,
          totalEmails: stats.totalEmails,
          sentEmails: stats.sentEmails,
          approvedEmails: stats.approvedEmails,
        });
      }

      // Perform batch updates
      if (sessionsToUpdate.length > 0) {
        await wrapDatabaseOperation(async () => {
          const updates = sessionsToUpdate.map((update) => ({
            sessionId: update.id,
            status: update.status,
            completedDonors: update.completedDonors,
            completedAt: update.shouldSetCompletedAt ? new Date() : undefined,
          }));
          await updateSessionsBatch(updates);
        });

        logger.info(
          `[checkAndUpdateMultipleCampaignCompletion] Updated ${sessionsToUpdate.length} campaigns: ${sessionsToUpdate
            .map((u) => `${u.id}->${u.status}`)
            .join(', ')}`
        );
      }

      return results;
    } catch (error) {
      logger.error(
        `Failed to check campaign completion for sessions ${sessionIds.join(', ')}: ${error}`
      );
      return new Map();
    }
  }

  /**
   * Checks if all emails in a session have been sent and updates status to COMPLETED
   * Also handles campaigns stuck in PENDING that should be IN_PROGRESS or COMPLETED
   * @param sessionId - The session ID
   * @param organizationId - The organization ID
   */
  async checkAndUpdateCampaignCompletion(sessionId: number, organizationId: string) {
    // Use batch function with single session ID for consistency
    await this.checkAndUpdateMultipleCampaignCompletion([sessionId], organizationId);
  }

  /**
   * Saves a generated email incrementally with PENDING_APPROVAL status
   * @param input - Generated email data
   * @param organizationId - The organization ID for authorization
   * @returns Success confirmation
   */
  async saveGeneratedEmail(input: SaveGeneratedEmailInput, organizationId: string) {
    try {
      // Verify the session belongs to the organization
      const sessionExists = await wrapDatabaseOperation(async () => {
        return await checkSessionExists(input.sessionId, organizationId);
      });

      if (!sessionExists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      // Check if email already exists for this donor in this session
      const existingEmail = await wrapDatabaseOperation(async () => {
        return await getEmailBySessionAndDonor(input.sessionId, input.donorId);
      });

      // Remove signature from content before saving (only if structuredContent exists)
      const contentWithoutSignature = input.structuredContent
        ? removeSignatureFromContent(input.structuredContent)
        : undefined;

      if (existingEmail) {
        // Update existing email
        const updateData: any = {
          subject: input.subject,
          status: input.isPreview ? 'PENDING_APPROVAL' : 'APPROVED',
          isPreview: input.isPreview || false,
          updatedAt: new Date(),
        };

        // Add legacy format fields if provided
        if (contentWithoutSignature) {
          updateData.structuredContent = contentWithoutSignature;
        }
        if (input.referenceContexts) {
          updateData.referenceContexts = input.referenceContexts;
        }

        // Add new format fields if provided
        if (input.emailContent) {
          updateData.emailContent = input.emailContent;
        }
        if (input.reasoning) {
          updateData.reasoning = input.reasoning;
        }
        if (input.response) {
          updateData.response = input.response;
        }

        const updatedEmail = await wrapDatabaseOperation(async () => {
          return await updateGeneratedEmail(existingEmail.id, updateData);
        });
        return { success: true, email: updatedEmail };
      } else {
        // Create new email
        const insertData: any = {
          sessionId: input.sessionId,
          donorId: input.donorId,
          subject: input.subject,
          status: input.isPreview ? 'PENDING_APPROVAL' : 'APPROVED',
          isPreview: input.isPreview || false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Add legacy format fields if provided
        if (contentWithoutSignature) {
          insertData.structuredContent = contentWithoutSignature;
        }
        if (input.referenceContexts) {
          insertData.referenceContexts = input.referenceContexts;
        }

        // Add new format fields if provided
        if (input.emailContent) {
          insertData.emailContent = input.emailContent;
        }
        if (input.reasoning) {
          insertData.reasoning = input.reasoning;
        }
        if (input.response) {
          insertData.response = input.response;
        }

        const newEmail = await wrapDatabaseOperation(async () => {
          return await createGeneratedEmail(insertData);
        });
        return { success: true, email: newEmail };
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to save generated email: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save generated email',
      });
    }
  }

  /**
   * Retry a campaign that is stuck in PENDING status
   * @param sessionId - The session ID to retry
   * @param organizationId - The organization ID for authorization
   * @param userId - The user ID
   * @returns Success confirmation
   */
  async retryCampaign(sessionId: number, organizationId: string, userId: string) {
    try {
      // Get the session
      const session = await wrapDatabaseOperation(async () => {
        return await getEmailGenerationSessionById(sessionId, organizationId);
      });

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      // Only retry if status is PENDING or FAILED
      if (session.status !== EmailGenerationSessionStatus.GENERATING && true) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot retry campaign with status: ${session.status}`,
        });
      }

      logger.info(`Retrying campaign ${sessionId} with status ${session.status}`);

      // Reset status to PENDING and clear error message
      await wrapDatabaseOperation(async () => {
        await updateEmailGenerationSession(sessionId, organizationId, {
          status: EmailGenerationSessionStatus.GENERATING,
          errorMessage: null,
        });
      });

      // Get donors that don't have approved emails yet
      const alreadyGeneratedDonorIds = await wrapDatabaseOperation(async () => {
        return await getDonorIdsWithEmails(sessionId, 'APPROVED');
      });
      const selectedDonorIds = session.selectedDonorIds as number[];
      const donorsToGenerate = selectedDonorIds.filter(
        (id) => !alreadyGeneratedDonorIds.includes(id)
      );

      if (donorsToGenerate.length > 0) {
        try {
          logger.info(
            `Retrying trigger for session ${sessionId} with ${donorsToGenerate.length} donors`
          );

          await generateBulkEmailsTask.trigger({
            sessionId,
            organizationId,
            userId,
            selectedDonorIds: donorsToGenerate,
            previewDonorIds: session.previewDonorIds as number[],
            chatHistory: session.chatHistory as Array<{
              role: 'user' | 'assistant';
              content: string;
            }>,
            templateId: session.templateId || undefined,
          });

          logger.info(`Successfully retried campaign ${sessionId}`);
          return {
            success: true,
            message: `Retried campaign with ${donorsToGenerate.length} donors`,
          };
        } catch (triggerError) {
          logger.error(
            `Failed to retry trigger for session ${sessionId}: ${
              triggerError instanceof Error ? triggerError.message : String(triggerError)
            }`
          );

          // Update session status to FAILED
          await db
            .update(emailGenerationSessions)
            .set({
              status: EmailGenerationSessionStatus.GENERATING,
              errorMessage: `Retry failed: ${
                triggerError instanceof Error ? triggerError.message : String(triggerError)
              }`,
              updatedAt: new Date(),
            })
            .where(eq(emailGenerationSessions.id, sessionId));

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to retry campaign. Please check your Trigger.dev configuration.',
          });
        }
      } else {
        // All donors already have emails, mark as completed
        await db
          .update(emailGenerationSessions)
          .set({
            status: 'COMPLETED',
            completedDonors: selectedDonorIds.length,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, sessionId));

        logger.info(`Campaign ${sessionId} marked as completed - all donors already have emails`);
        return { success: true, message: 'Campaign completed - all emails already generated' };
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to retry campaign ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retry campaign',
      });
    }
  }

  /**
   * Fixes all stuck campaigns for an organization by checking their status
   * @param organizationId - The organization ID
   * @returns Number of campaigns that were fixed
   */
  async fixStuckCampaigns(organizationId: string) {
    try {
      // Get all campaigns that might be stuck (PENDING or IN_PROGRESS)
      const stuckCampaigns = await wrapDatabaseOperation(async () => {
        const sessions = await getSessionsByCriteria(organizationId, {
          statuses: [
            EmailGenerationSessionStatus.GENERATING,
            EmailGenerationSessionStatus.READY_TO_SEND,
          ],
        });
        return sessions.map((session) => ({
          id: session.id,
          status: session.status,
        }));
      });

      let fixedCount = 0;

      for (const campaign of stuckCampaigns) {
        try {
          const originalStatus = campaign.status;
          await this.checkAndUpdateCampaignCompletion(campaign.id, organizationId);

          // Check if status changed
          const updatedCampaign = await wrapDatabaseOperation(async () => {
            const session = await getEmailGenerationSessionById(campaign.id, organizationId);
            return session ? { status: session.status } : null;
          });

          if (updatedCampaign && updatedCampaign.status !== originalStatus) {
            fixedCount++;
            logger.info(
              `Fixed campaign ${campaign.id}: ${originalStatus} → ${updatedCampaign.status}`
            );
          }
        } catch (error) {
          logger.warn(`Failed to fix campaign ${campaign.id}: ${error}`);
        }
      }

      logger.info(
        `Fixed ${fixedCount} out of ${stuckCampaigns.length} potentially stuck campaigns for organization ${organizationId}`
      );

      return {
        success: true,
        fixedCount,
        totalChecked: stuckCampaigns.length,
        message: `Fixed ${fixedCount} campaigns`,
      };
    } catch (error) {
      logger.error(
        `Failed to fix stuck campaigns for organization ${organizationId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fix stuck campaigns',
      });
    }
  }
}
