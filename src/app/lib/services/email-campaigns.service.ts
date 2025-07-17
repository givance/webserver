import { PREVIEW_DONOR_COUNT } from '@/app/(app)/campaign/steps/write-instruction-step/constants';
import {
  checkSessionExists,
  countEmailsBySession,
  countSessionsByOrganization,
  createEmailGenerationSession,
  createGeneratedEmail,
  deleteEmailGenerationSession,
  deleteGeneratedEmails,
  getDonorIdsWithEmails,
  getDonorIdsWithExistingEmails,
  getDraftSessionByName,
  getEmailBySessionAndDonor,
  getEmailGenerationSessionById,
  getEmailStatsBySessionIds,
  getEmailWithOrganizationCheck,
  getEmailWithSessionAuth,
  getGeneratedEmailsBySessionId,
  getScheduledEmailJobs,
  getSessionsByCriteria,
  getSessionStatus as getSessionStatusData,
  listEmailGenerationSessions,
  updateEmailGenerationSession,
  updateEmailStatus,
  updateEmailStatusBulk,
  updateGeneratedEmail,
  updateGeneratedEmailContent,
  updateSessionsBatch,
  type EmailGenerationSession,
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
import { SmartEmailGenerationService } from '@/app/lib/smart-email-generation/services/smart-email-generation.service';
import { check, createTRPCError, ERROR_MESSAGES, validateNotNullish } from '@/app/api/trpc/trpc';
import { env } from '@/app/lib/env';
import { isFeatureEnabledForOrganization } from '@/app/lib/feature-flags/utils';

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
  statusGroup?: 'active' | 'ready' | 'other';
}

export interface UpdateEmailInput {
  emailId: number;
  subject: string;
  // Legacy format fields (optional for backward compatibility)
  structuredContent?: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts?: Record<string, string>;
  // New format fields
  emailContent?: string;
  reasoning?: string;
}

export interface UpdateCampaignInput {
  campaignId: number;
  campaignName?: string;
  chatHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  selectedDonorIds?: number[];
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
  // For generate_more: number of new emails to generate
  count?: number;
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
        throw createTRPCError({
          code: 'BAD_REQUEST',
          message: 'Selected donor IDs are required to launch a campaign',
        });
      }

      // First check if there's an existing campaign with the same ID
      const existingCampaign = await getEmailGenerationSessionById(
        input.campaignId,
        organizationId
      );

      validateNotNullish(existingCampaign, 'NOT_FOUND', 'Campaign not found');

      let sessionId: number = existingCampaign.id;

      // First, count existing emails (both PENDING_APPROVAL and APPROVED) for selected donors
      const donorIds = await getDonorIdsWithExistingEmails(existingCampaign.id);
      const existingEmailsForSelectedDonors = donorIds.map((donorId) => ({ donorId }));

      // Count how many of the selected donors already have emails
      const existingDonorIds = existingEmailsForSelectedDonors.map((e) => e.donorId);
      const currentCompletedCount = input.selectedDonorIds!.filter((id) =>
        existingDonorIds.includes(id)
      ).length;

      // Determine the appropriate status based on whether emails need to be generated
      const allEmailsExist = currentCompletedCount === input.selectedDonorIds!.length;
      const newStatus = allEmailsExist
        ? EmailGenerationSessionStatus.READY_TO_SEND
        : EmailGenerationSessionStatus.GENERATING;

      // Update existing campaign with appropriate status
      logger.info(
        `[launchCampaign] Updating existing campaign ${existingCampaign.id} to ${newStatus} status`,
        {
          campaignId: existingCampaign.id,
          oldStatus: existingCampaign.status,
          newStatus,
          totalDonors: input.selectedDonorIds!.length,
          currentCompletedCount,
          allEmailsExist,
          organizationId,
          userId,
        }
      );

      const updatedSession = await updateEmailGenerationSession(
        existingCampaign.id,
        organizationId,
        {
          status: newStatus,
          chatHistory: input.chatHistory ?? existingCampaign.chatHistory,
          selectedDonorIds: input.selectedDonorIds,
          totalDonors: input.selectedDonorIds!.length,
          completedDonors: currentCompletedCount, // Set the initial completed count
        }
      );

      validateNotNullish(updatedSession, 'INTERNAL_SERVER_ERROR', 'Failed to update session');

      sessionId = updatedSession.id;

      // Update any PENDING_APPROVAL emails to APPROVED
      await updateEmailStatusBulk(sessionId, 'PENDING_APPROVAL', 'APPROVED', {
        isPreview: false,
        isSent: false,
        sendStatus: 'pending',
      });

      logger.info(
        `Updated existing campaign session ${sessionId} to ${newStatus} with ${currentCompletedCount} completed donors for user ${userId}`
      );

      // Get the list of donors that already have approved emails
      const alreadyGeneratedDonorIds = await getDonorIdsWithEmails(sessionId, 'APPROVED');
      const donorsToGenerate = input.selectedDonorIds!.filter(
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
            previewDonorIds: [], // Will be handled automatically by the background job
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
          await updateEmailGenerationSession(sessionId, organizationId, {
            errorMessage: `Failed to start background job: ${
              triggerError instanceof Error ? triggerError.message : String(triggerError)
            }`,
          });

          throw createTRPCError({
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
            totalDonors: input.selectedDonorIds!.length,
            completedDonors: input.selectedDonorIds!.length,
            organizationId,
            userId,
          }
        );

        // If all donors already have emails, ensure session status is READY_TO_SEND
        if (newStatus !== EmailGenerationSessionStatus.READY_TO_SEND) {
          await updateEmailGenerationSession(sessionId, organizationId, {
            status: EmailGenerationSessionStatus.READY_TO_SEND,
            completedDonors: input.selectedDonorIds!.length,
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

      throw createTRPCError({
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
      const existingDraft = await getDraftSessionByName(organizationId, input.campaignName);

      if (existingDraft) {
        // Update existing draft
        const updatedSession = await updateEmailGenerationSession(
          existingDraft.id,
          organizationId,
          {
            chatHistory: input.chatHistory,
            selectedDonorIds: input.selectedDonorIds,
            totalDonors: input.selectedDonorIds.length,
            completedDonors: 0,
          }
        );

        validateNotNullish(
          updatedSession,
          'INTERNAL_SERVER_ERROR',
          'Failed to update draft session'
        );

        logger.info(`Updated existing draft session ${updatedSession.id} for user ${userId}`);
        return { sessionId: updatedSession.id };
      } else {
        // Create new draft session
        const session = await createEmailGenerationSession({
          organizationId,
          userId,
          templateId: input.templateId,
          jobName: input.campaignName,
          chatHistory: input.chatHistory,
          selectedDonorIds: input.selectedDonorIds,
          previewDonorIds: [], // Start with empty preview donors - will be selected automatically
          totalDonors: input.selectedDonorIds.length,
          completedDonors: 0,
          status: EmailGenerationSessionStatus.DRAFT, // Always create as DRAFT
        });

        logger.info(`Created new draft session ${session.id} for user ${userId}`);
        return { sessionId: session.id };
      }
    } catch (error) {
      logger.error('Error in createSession:', error);
      throw createTRPCError({
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

      validateNotNullish(session, 'NOT_FOUND', 'Session not found');

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

      // Get actual email count from database instead of using stored completedDonors
      const actualEmailCount = await countEmailsBySession(sessionId);

      return {
        session: {
          ...session,
          completedDonors: actualEmailCount,
        },
        emails: emailsWithSignatures,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to get email generation session: ${error instanceof Error ? error.message : String(error)}`
      );
      throw createTRPCError({
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
    const session = await getSessionStatusData(sessionId, organizationId);

    validateNotNullish(session, 'NOT_FOUND', 'Session not found');

    // Get actual email count from database instead of using stored completedDonors
    const actualEmailCount = await countEmailsBySession(sessionId);

    // Failsafe: If status is GENERATING or READY_TO_SEND but all donors are completed, update to COMPLETED
    if (
      (session.status === EmailGenerationSessionStatus.GENERATING ||
        session.status === EmailGenerationSessionStatus.READY_TO_SEND) &&
      actualEmailCount >= session.totalDonors &&
      session.totalDonors > 0
    ) {
      logger.info(
        `Session ${sessionId} shows as ${session.status} but all donors are completed. Updating to ${EmailGenerationSessionStatus.COMPLETED}.`
      );

      await updateEmailGenerationSession(sessionId, organizationId, {
        status: EmailGenerationSessionStatus.COMPLETED,
        completedAt: new Date(),
      });

      return {
        ...session,
        status: EmailGenerationSessionStatus.COMPLETED,
        completedDonors: actualEmailCount,
      };
    }

    return {
      ...session,
      completedDonors: actualEmailCount,
    };
  }

  /**
   * Lists campaigns with filtering and pagination
   * @param input - Filtering and pagination options
   * @param organizationId - The organization ID for authorization
   * @returns Campaigns list with counts
   */
  async listCampaigns(input: ListCampaignsInput, organizationId: string) {
    const { limit = 10, offset = 0, status, statusGroup } = input;

    // For status groups, we need to fetch more broadly and filter after
    // because the display status is computed from multiple factors
    let statuses: (keyof typeof EmailGenerationSessionStatus)[] | undefined;
    if (statusGroup) {
      // Fetch all statuses and filter after based on computed status
      statuses = undefined; // We'll filter after fetching
    }

    // Get campaigns without email counts first
    // When using statusGroup, we need to fetch more to account for filtering
    const campaignsResult = await listEmailGenerationSessions(organizationId, {
      limit: statusGroup ? 1000 : limit, // Fetch more when filtering by group
      offset: statusGroup ? 0 : offset,
      status,
      statuses,
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

    // Get email counts for all campaigns in batch
    const allSessionIds = campaigns.map((c) => c.id);
    const stats = await getEmailStatsBySessionIds(allSessionIds);
    const emailCounts = stats.map((stat) => ({
      sessionId: stat.sessionId,
      totalEmails: stat.totalEmails,
      sentEmails: stat.sentEmails,
    }));

    // Create lookup map for email counts
    const emailCountsMap = new Map();
    emailCounts.forEach((count) => {
      emailCountsMap.set(count.sessionId, count);
    });

    // Get updated campaign statuses in batch
    const sessions = await getSessionsByCriteria(organizationId, { sessionIds: allSessionIds });
    const updatedCampaigns = sessions.map((session) => ({
      id: session.id,
      status: session.status,
      completedDonors: session.completedDonors,
    }));

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
        completedDonors: emailCount.totalEmails, // Use actual database count instead of stored field
        sentEmails: emailCount.sentEmails,
        totalEmails: emailCount.totalEmails,
      };
    });

    // If statusGroup is specified, we need to filter campaigns based on their computed status
    // This is necessary because the actual campaign status (Running, In Progress, etc.)
    // is derived from multiple factors including email counts and completion status
    let filteredCampaigns = campaignsWithCounts;
    if (statusGroup) {
      filteredCampaigns = campaignsWithCounts.filter((campaign) => {
        const derivedStatus = this.getDerivedCampaignStatus(campaign);

        switch (statusGroup) {
          case 'active':
            return ['Running', 'In Progress'].includes(derivedStatus);
          case 'ready':
            return ['Ready to Send', 'Paused', 'Generating'].includes(derivedStatus);
          case 'other':
            return ['Draft', 'Completed'].includes(derivedStatus);
          default:
            return true;
        }
      });
    }

    // When using statusGroup, we need different handling
    if (statusGroup) {
      // Apply pagination to the filtered results
      const startIndex = offset || 0;
      const endIndex = startIndex + (limit || 10);
      const paginatedCampaigns = filteredCampaigns.slice(startIndex, endIndex);
      const totalFilteredCount = filteredCampaigns.length;

      return { campaigns: paginatedCampaigns, totalCount: totalFilteredCount };
    } else {
      // When not using statusGroup, return the results as-is with proper count
      const totalCount = await countSessionsByOrganization(organizationId, status, statuses);
      return { campaigns: campaignsWithCounts, totalCount };
    }
  }

  /**
   * Determines the derived status of a campaign based on multiple factors
   */
  private getDerivedCampaignStatus(campaign: any): string {
    const { status, totalEmails, sentEmails, totalDonors, completedDonors } = campaign;

    // If it's a draft, show draft status
    if (status === 'DRAFT') {
      return 'Draft';
    }

    // If still generating emails (actively generating or in progress)
    if (completedDonors < totalDonors && status !== 'COMPLETED') {
      return 'Generating';
    }

    // If status shows as generating but all donors are completed, treat as ready
    if (status === 'GENERATING' && completedDonors >= totalDonors && totalDonors > 0) {
      return 'Ready to Send';
    }

    // Check for new RUNNING and PAUSED statuses
    if (status === 'RUNNING') {
      return 'Running';
    }

    if (status === 'PAUSED') {
      return 'Paused';
    }

    // All emails generated, check sending status
    if (totalEmails > 0) {
      // All emails sent
      if (sentEmails === totalEmails) {
        return 'Completed';
      }

      // Some emails sent, some not
      if (sentEmails > 0) {
        return 'In Progress';
      }

      // No emails sent yet, but all generated
      return 'Ready to Send';
    }

    // Fallback cases
    if (status === 'COMPLETED') {
      return 'Completed';
    }

    return 'Unknown';
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

    validateNotNullish(campaign, 'NOT_FOUND', 'Campaign not found');

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
      const existingEmail = await getEmailWithSessionAuth(emailId, organizationId);

      validateNotNullish(existingEmail, 'NOT_FOUND', 'Email not found');

      if (existingEmail.isSent) {
        throw createTRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot change status of an email that has already been sent',
        });
      }

      // Update the email status
      const updatedEmail = await updateEmailStatus(emailId, status);

      validateNotNullish(updatedEmail, 'INTERNAL_SERVER_ERROR', 'Failed to update email status');

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
      throw createTRPCError({
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
        throw createTRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid email ID provided',
        });
      }

      const email = await getEmailWithOrganizationCheck(emailId, organizationId);
      validateNotNullish(email, 'NOT_FOUND', 'Email not found');

      logger.info(
        `Successfully retrieved email status for emailId: ${emailId}, isSent: ${email.isSent}`
      );
      return email;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to get email status for emailId: ${emailId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw createTRPCError({
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
      const existingEmail = await getEmailWithSessionAuth(input.emailId, organizationId);

      validateNotNullish(existingEmail, 'NOT_FOUND', 'Email not found');

      if (existingEmail.isSent) {
        throw createTRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot edit an email that has already been sent',
        });
      }

      // Handle both old and new formats
      const updateData: any = {
        subject: input.subject,
        status: 'PENDING_APPROVAL', // Reset status when email is edited
      };

      // Handle legacy structured content format
      if (input.structuredContent && input.structuredContent.length > 0) {
        // Remove signature from content before saving
        const contentWithoutSignature = removeSignatureFromContent(input.structuredContent);
        updateData.structuredContent = contentWithoutSignature;
        updateData.referenceContexts = input.referenceContexts;
      }

      // Handle new email content format
      if (input.emailContent !== undefined) {
        updateData.emailContent = input.emailContent;
      }

      if (input.reasoning !== undefined) {
        updateData.reasoning = input.reasoning;
      }

      // Update the email and reset status to PENDING_APPROVAL since content was edited
      const updatedEmail = await updateGeneratedEmailContent(input.emailId, updateData);

      validateNotNullish(updatedEmail, 'INTERNAL_SERVER_ERROR', 'Failed to update email');

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
      throw createTRPCError({
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
      const existingCampaign = await getEmailGenerationSessionById(
        input.campaignId,
        organizationId
      );

      validateNotNullish(existingCampaign, 'NOT_FOUND', 'Campaign not found');

      // Check if only schedule config is being updated
      const isOnlyScheduleUpdate =
        input.scheduleConfig !== undefined &&
        !input.campaignName &&
        !input.chatHistory &&
        !input.selectedDonorIds &&
        input.templateId === undefined;

      // Don't allow editing other fields if campaign is processing
      if (
        (existingCampaign.status === EmailGenerationSessionStatus.GENERATING ||
          existingCampaign.status === EmailGenerationSessionStatus.READY_TO_SEND) &&
        !isOnlyScheduleUpdate
      ) {
        throw createTRPCError({
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
      if (input.templateId !== undefined) {
        updateData.templateId = input.templateId;
      }
      if (input.scheduleConfig !== undefined) {
        updateData.scheduleConfig = input.scheduleConfig;
      }

      // Update the campaign
      const updatedCampaign = await updateEmailGenerationSession(
        input.campaignId,
        organizationId,
        updateData
      );

      validateNotNullish(updatedCampaign, 'INTERNAL_SERVER_ERROR', 'Failed to update campaign');

      // If schedule config was updated and campaign has scheduled emails, reschedule them
      if (input.scheduleConfig !== undefined && isOnlyScheduleUpdate) {
        try {
          // Use the new EmailSchedulingService method to reschedule the campaign
          const schedulingService = new EmailSchedulingService();

          // Get current user ID from the session
          const session = await getEmailGenerationSessionById(input.campaignId, organizationId);

          validateNotNullish(session, 'NOT_FOUND', 'Session not found for rescheduling');
          const campaignStatus = session.status;

          // First pause the campaign to cancel existing jobs
          try {
            await schedulingService.pauseCampaign(input.campaignId, organizationId);
            logger.info(`Paused campaign ${input.campaignId} for rescheduling`);
          } catch (pauseError) {
            // If pause fails because there are no scheduled emails, that's fine
            logger.info(`No scheduled emails to pause for campaign ${input.campaignId}`);
          }

          // Check if there are any unsent emails
          const emails = await getGeneratedEmailsBySessionId(input.campaignId);
          const unsentCount = emails.filter((email) => !email.isSent).length;

          // Reschedule the emails with the new configuration if there are unsent emails

          if (unsentCount > 0 && campaignStatus === 'RUNNING') {
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
      const existingSession = await getEmailGenerationSessionById(input.sessionId, organizationId);

      validateNotNullish(existingSession, 'NOT_FOUND', 'Campaign session not found');

      // Get preview donor IDs from the session
      const previewDonorIds = (existingSession.previewDonorIds as number[]) || [];

      logger.info(
        `[regenerateAllEmails] Session ${input.sessionId} has previewDonorIds: ${JSON.stringify(previewDonorIds)}`
      );

      // Get all emails for this session to understand what's happening
      const emails = await getGeneratedEmailsBySessionId(input.sessionId);
      const allSessionEmails = emails.map((email) => ({
        donorId: email.donorId,
        isPreview: email.isPreview,
        status: email.status,
      }));

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
        await updateEmailGenerationSession(input.sessionId, organizationId, {
          previewDonorIds: donorsToRegenerate,
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
      const deletedCount = await deleteGeneratedEmails(input.sessionId, donorsToRegenerate);

      logger.info(`Deleted ${deletedCount} preview emails for session ${input.sessionId}`);

      // Use the chat history from input
      const finalChatHistory = input.chatHistory;

      // Update the session chat history ONLY - do not modify donor lists
      await updateEmailGenerationSession(input.sessionId, organizationId, {
        chatHistory: finalChatHistory,
      });

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
      throw createTRPCError({
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
      // Validate session exists and belongs to organization
      const existingSession = await this.validateSession(input.sessionId, organizationId);

      // Handle different modes
      switch (input.mode) {
        case 'generate_more':
          return await this.handleGenerateMore(input, existingSession, organizationId, userId);
        case 'regenerate_all':
          return await this.handleRegenerateAll(input, existingSession, organizationId, userId);
        case 'generate_with_new_message':
          return await this.handleGenerateWithNewMessage(
            input,
            existingSession,
            organizationId,
            userId
          );
        default:
          throw createTRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid mode: ${input.mode}`,
          });
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `[smartEmailGeneration] Failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw createTRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate emails',
      });
    }
  }

  /**
   * Streaming version of smart email generation with real-time status updates
   */
  async *smartEmailGenerationStream(
    input: SmartEmailGenerationInput,
    organizationId: string,
    userId: string
  ): AsyncGenerator<{
    status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
    message?: string;
    result?: SmartEmailGenerationResponse;
  }> {
    try {
      // Validate session exists and belongs to organization
      const existingSession = await this.validateSession(input.sessionId, organizationId);

      // Handle different modes
      switch (input.mode) {
        case 'generate_more':
          yield* this.handleGenerateMoreStream(input, existingSession, organizationId, userId);
          break;
        case 'regenerate_all':
          yield* this.handleRegenerateAllStream(input, existingSession, organizationId, userId);
          break;
        case 'generate_with_new_message':
          yield* this.handleGenerateWithNewMessageStream(
            input,
            existingSession,
            organizationId,
            userId
          );
          break;
        default:
          throw createTRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid mode: ${input.mode}`,
          });
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `[smartEmailGenerationStream] Failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw createTRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate emails',
      });
    }
  }

  /**
   * Validates that a session exists and belongs to the organization
   */
  private async validateSession(
    sessionId: number,
    organizationId: string
  ): Promise<EmailGenerationSession> {
    const session = await getEmailGenerationSessionById(sessionId, organizationId);

    if (!session) {
      throw createTRPCError({
        code: 'NOT_FOUND',
        message: 'Campaign session not found',
      });
    }

    return session;
  }

  /**
   * Updates chat history for a session
   */
  private async updateChatHistory(
    sessionId: number,
    organizationId: string,
    newMessage: string,
    existingHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const updatedHistory = [
      ...existingHistory,
      { role: 'user' as const, content: newMessage.trim() },
    ];

    await updateEmailGenerationSession(sessionId, organizationId, {
      chatHistory: updatedHistory,
    });

    logger.info(`[updateChatHistory] Updated chat history for session ${sessionId}`);
    return updatedHistory;
  }

  /**
   * Gets donors to process for generation/regeneration
   */
  private async getDonorsToProcess(
    session: EmailGenerationSession,
    mode: 'regenerate' | 'new_preview'
  ): Promise<number[]> {
    const previewDonorIds = (session.previewDonorIds as number[]) || [];

    if (previewDonorIds.length > 0) {
      logger.info(
        `[getDonorsToProcess] Using ${previewDonorIds.length} existing preview donors from session`
      );
      return previewDonorIds;
    }

    // If no preview donors exist, find them from existing emails or create new ones
    const existingPreviewDonorIds = await this.findExistingPreviewDonors(session.id);

    if (existingPreviewDonorIds.length > 0) {
      // Update session with found preview donors
      await this.updateSessionPreviewDonors(
        session.id,
        session.organizationId,
        existingPreviewDonorIds
      );
      logger.info(
        `[getDonorsToProcess] Found ${existingPreviewDonorIds.length} existing preview donors from emails`
      );
      return existingPreviewDonorIds;
    }

    // Last resort: create new preview donors
    const newPreviewDonors = await this.createPreviewDonors(session);
    await this.updateSessionPreviewDonors(session.id, session.organizationId, newPreviewDonors);
    logger.info(`[getDonorsToProcess] Created ${newPreviewDonors.length} new preview donors`);
    return newPreviewDonors;
  }

  /**
   * Finds existing preview donors from generated emails
   */
  private async findExistingPreviewDonors(sessionId: number): Promise<number[]> {
    const emails = await getGeneratedEmailsBySessionId(sessionId);

    const previewEmails = emails.filter((email) => email.isPreview === true);
    return [...new Set(previewEmails.map((email) => email.donorId))];
  }

  /**
   * Creates new preview donors from selected donors
   */
  private async createPreviewDonors(session: EmailGenerationSession): Promise<number[]> {
    const selectedDonorIds = (session.selectedDonorIds as number[]) || [];

    if (selectedDonorIds.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No donors available for preview generation',
      });
    }

    const numToSelect = Math.min(selectedDonorIds.length, PREVIEW_DONOR_COUNT);

    // Use a deterministic selection based on session ID to ensure consistency
    // This ensures the same donors are selected for preview each time
    const sortedDonorIds = [...selectedDonorIds].sort((a, b) => a - b);

    // Use a simple deterministic selection: take every Nth donor
    const step = Math.max(1, Math.floor(sortedDonorIds.length / numToSelect));
    const previewDonors: number[] = [];

    for (let i = 0; i < sortedDonorIds.length && previewDonors.length < numToSelect; i += step) {
      previewDonors.push(sortedDonorIds[i]);
    }

    // If we don't have enough, fill from the beginning
    let index = 0;
    while (previewDonors.length < numToSelect && index < sortedDonorIds.length) {
      if (!previewDonors.includes(sortedDonorIds[index])) {
        previewDonors.push(sortedDonorIds[index]);
      }
      index++;
    }

    return previewDonors;
  }

  /**
   * Updates session with preview donor IDs
   */
  private async updateSessionPreviewDonors(
    sessionId: number,
    organizationId: string,
    previewDonorIds: number[]
  ): Promise<void> {
    await updateEmailGenerationSession(sessionId, organizationId, {
      previewDonorIds,
    });
  }

  /**
   * Handles generate_more mode - generates emails for new donors
   */
  private async handleGenerateMore(
    input: SmartEmailGenerationInput,
    session: EmailGenerationSession,
    organizationId: string,
    userId: string
  ): Promise<SmartEmailGenerationResponse> {
    // Validate input
    const count = input.count || 5; // Default to 5 if not specified
    if (count <= 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Count must be greater than 0 for generate_more mode',
      });
    }

    // Get existing data
    const existingChatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];
    const previewDonorIds = (session.previewDonorIds as number[]) || [];
    const selectedDonorIds = (session.selectedDonorIds as number[]) || [];

    // Find donors that haven't been processed yet
    const remainingDonorIds = selectedDonorIds.filter((id) => !previewDonorIds.includes(id));

    if (remainingDonorIds.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No more donors available to generate emails for',
      });
    }

    // Select random donors from remaining pool
    const shuffled = [...remainingDonorIds].sort(() => Math.random() - 0.5);
    const newDonorIds = shuffled.slice(0, Math.min(count, shuffled.length));

    logger.info(
      `[handleGenerateMore] Selecting ${newDonorIds.length} donors from ${remainingDonorIds.length} remaining donors`
    );

    // Add new donors to preview set
    const updatedPreviewDonorIds = [...new Set([...previewDonorIds, ...newDonorIds])];
    await this.updateSessionPreviewDonors(session.id, organizationId, updatedPreviewDonorIds);

    logger.info(`[handleGenerateMore] Added ${newDonorIds.length} new donors to preview set`);

    // Use the same streaming service as handleGenerateWithNewMessage
    const emailGenerationService = new UnifiedSmartEmailGenerationService();
    const generator = emailGenerationService.generateSmartEmailsForCampaignStream({
      organizationId,
      sessionId: String(session.id),
      chatHistory: existingChatHistory,
      donorIds: newDonorIds.map((id) => String(id)),
    });

    let finalResult: any = null;
    let successfulCount = 0;
    let failedCount = 0;

    // Process the stream
    for await (const update of generator) {
      if (update.result) {
        finalResult = update.result;
        successfulCount = update.result.results.filter((r: any) => r.email !== null).length;
        failedCount = update.result.results.filter((r: any) => r.email === null).length;
      }
    }

    return {
      success: true,
      sessionId: session.id,
      chatHistory: existingChatHistory,
      generatedEmailsCount: successfulCount,
      deletedEmailsCount: 0,
      failedEmailsCount: failedCount,
      message: `Generated ${successfulCount} emails for ${newDonorIds.length} new donors`,
    };
  }

  /**
   * Handles regenerate_all mode - regenerates emails for preview donors
   */
  private async handleRegenerateAll(
    input: SmartEmailGenerationInput,
    session: EmailGenerationSession,
    organizationId: string,
    userId: string
  ): Promise<SmartEmailGenerationResponse> {
    const existingChatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];

    // Get donors to regenerate
    const donorsToProcess = await this.getDonorsToProcess(session, 'regenerate');

    // Note: We don't delete existing emails anymore - the saveGeneratedEmail function
    // in UnifiedSmartEmailGenerationService will handle upsert logic automatically
    logger.info(`[handleRegenerateAll] Regenerating emails for ${donorsToProcess.length} donors`);

    // Use the same streaming service as handleGenerateWithNewMessage
    const emailGenerationService = new UnifiedSmartEmailGenerationService();
    const generator = emailGenerationService.generateSmartEmailsForCampaignStream({
      organizationId,
      sessionId: String(session.id),
      chatHistory: existingChatHistory,
      donorIds: donorsToProcess.map((id) => String(id)),
    });

    let finalResult: any = null;
    let successfulCount = 0;
    let failedCount = 0;

    // Process the stream
    for await (const update of generator) {
      if (update.result) {
        finalResult = update.result;
        successfulCount = update.result.results.filter((r: any) => r.email !== null).length;
        failedCount = update.result.results.filter((r: any) => r.email === null).length;
      }
    }

    return {
      success: true,
      sessionId: session.id,
      chatHistory: existingChatHistory,
      generatedEmailsCount: successfulCount,
      deletedEmailsCount: 0, // No longer deleting emails upfront
      failedEmailsCount: failedCount,
      message: `Regenerated ${successfulCount} emails for ${donorsToProcess.length} preview donors`,
    };
  }

  /**
   * Handles generate_with_new_message mode - adds message and regenerates
   */
  private async handleGenerateWithNewMessage(
    input: SmartEmailGenerationInput,
    session: EmailGenerationSession,
    organizationId: string,
    userId: string
  ): Promise<SmartEmailGenerationResponse> {
    // Validate input
    if (!input.newMessage?.trim()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'New message is required for generate_with_new_message mode',
      });
    }

    // Check if we should use the agentic flow
    const useAgenticFlow = await isFeatureEnabledForOrganization(
      organizationId,
      'use_agentic_flow'
    );
    logger.info('[handleGenerateWithNewMessage] use_agentic_flow enabled:', useAgenticFlow);

    if (useAgenticFlow) {
      logger.info('[handleGenerateWithNewMessage] Entering agentic flow');
      // For agentic flow, we need to update the session's chat history with the user message
      // The SmartEmailGenerationService will handle its own message storage separately
      const existingChatHistory =
        (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];
      const updatedChatHistory = await this.updateChatHistory(
        session.id,
        organizationId,
        input.newMessage,
        existingChatHistory
      );
      return await this.handleAgenticConversation(
        input,
        session,
        organizationId,
        userId,
        updatedChatHistory
      );
    }

    // For non-agentic flow, update chat history as before
    const existingChatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];
    const updatedChatHistory = await this.updateChatHistory(
      session.id,
      organizationId,
      input.newMessage,
      existingChatHistory
    );

    logger.info(
      '[handleGenerateWithNewMessage] Using traditional flow (use_agentic_flow is false)'
    );

    // Original flow: always generate emails
    // Get donors to regenerate
    const donorsToProcess = await this.getDonorsToProcess(session, 'regenerate');

    // Note: We don't delete existing emails anymore - the saveGeneratedEmail function
    // in UnifiedSmartEmailGenerationService will handle upsert logic automatically
    logger.info(
      `[handleGenerateWithNewMessage] Regenerating emails for ${donorsToProcess.length} donors`
    );

    // Use the streaming version to generate emails
    const emailGenerationService = new UnifiedSmartEmailGenerationService();
    const generator = emailGenerationService.generateSmartEmailsForCampaignStream({
      organizationId,
      sessionId: String(session.id),
      chatHistory: updatedChatHistory,
      donorIds: donorsToProcess.map((id) => String(id)),
    });

    let finalResult: any = null;
    let successfulCount = 0;
    let failedCount = 0;

    // Process the stream
    for await (const update of generator) {
      if (update.result) {
        finalResult = update.result;
        successfulCount = update.result.results.filter((r: any) => r.email !== null).length;
        failedCount = update.result.results.filter((r: any) => r.email === null).length;
      }
    }

    // Add assistant response to chat history
    const assistantMessage = `I've generated ${successfulCount} personalized emails for your ${donorsToProcess.length} preview donors based on your instructions. The emails have been reviewed and refined to ensure they meet best practices.`;

    const finalChatHistory = [
      ...updatedChatHistory,
      { role: 'assistant' as const, content: assistantMessage },
    ];

    // Update session with final chat history including assistant response
    await updateEmailGenerationSession(session.id, organizationId, {
      chatHistory: finalChatHistory,
    });

    return {
      success: true,
      sessionId: session.id,
      chatHistory: finalChatHistory,
      generatedEmailsCount: successfulCount,
      deletedEmailsCount: 0, // No longer deleting emails upfront
      failedEmailsCount: failedCount,
      message: assistantMessage,
    };
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
        const existingSession = await getEmailGenerationSessionById(
          input.sessionId!,
          organizationId
        );

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

        const updatedSession = await updateEmailGenerationSession(
          input.sessionId!,
          organizationId,
          updateData
        );

        validateNotNullish(updatedSession, 'NOT_FOUND', 'Session not found');

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
        const newSession = await createEmailGenerationSession(newSessionData);

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
      const sessions = await getSessionsByCriteria(organizationId, { sessionIds });

      if (sessions.length === 0) return new Map();

      // Get email stats for all sessions in batch
      const emailStats = await getEmailStatsBySessionIds(sessionIds);

      // Create lookup map for email stats
      const emailStatsMap = new Map();
      emailStats.forEach((stats) => {
        emailStatsMap.set(stats.sessionId, stats);
      });

      const results = new Map();
      const sessionsToUpdate: Array<{
        id: number;
        status: 'DRAFT' | 'GENERATING' | 'READY_TO_SEND' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
        completedDonors: number;
        shouldSetCompletedAt: boolean;
      }> = [];

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
        const updates = sessionsToUpdate.map((update) => ({
          sessionId: update.id,
          status: update.status,
          completedDonors: update.completedDonors,
          completedAt: update.shouldSetCompletedAt ? new Date() : undefined,
        }));
        await updateSessionsBatch(updates);

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
      const sessionExists = await checkSessionExists(input.sessionId, organizationId);

      if (!sessionExists) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      // Check if email already exists for this donor in this session
      const existingEmail = await getEmailBySessionAndDonor(input.sessionId, input.donorId);

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

        const updatedEmail = await updateGeneratedEmail(existingEmail.id, updateData);
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

        try {
          const newEmail = await createGeneratedEmail(insertData);
          return { success: true, email: newEmail };
        } catch (createError) {
          // If constraint violation occurs, check if email now exists and update it instead
          if (
            createError instanceof Error &&
            createError.message.includes('Email already exists for this donor in this session')
          ) {
            logger.info(
              `Constraint violation detected for sessionId: ${input.sessionId}, donorId: ${input.donorId}. Attempting to update existing email.`
            );

            // Re-check for existing email and update it
            const existingEmailAfterConstraint = await getEmailBySessionAndDonor(
              input.sessionId,
              input.donorId
            );
            if (existingEmailAfterConstraint) {
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

              const updatedEmail = await updateGeneratedEmail(
                existingEmailAfterConstraint.id,
                updateData
              );
              return { success: true, email: updatedEmail };
            }
          }

          // If it's not a constraint violation or we couldn't handle it, re-throw
          throw createError;
        }
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
      const session = await getEmailGenerationSessionById(sessionId, organizationId);

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
      await updateEmailGenerationSession(sessionId, organizationId, {
        status: EmailGenerationSessionStatus.GENERATING,
        errorMessage: null,
      });

      // Get donors that don't have approved emails yet
      const alreadyGeneratedDonorIds = await getDonorIdsWithEmails(sessionId, 'APPROVED');
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
          await updateEmailGenerationSession(sessionId, organizationId, {
            status: EmailGenerationSessionStatus.GENERATING,
            errorMessage: `Retry failed: ${
              triggerError instanceof Error ? triggerError.message : String(triggerError)
            }`,
          });

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to retry campaign. Please check your Trigger.dev configuration.',
          });
        }
      } else {
        // All donors already have emails, mark as completed
        await updateEmailGenerationSession(sessionId, organizationId, {
          status: EmailGenerationSessionStatus.COMPLETED,
          completedDonors: selectedDonorIds.length,
          completedAt: new Date(),
        });

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
      const sessions = await getSessionsByCriteria(organizationId, {
        statuses: [
          EmailGenerationSessionStatus.GENERATING,
          EmailGenerationSessionStatus.READY_TO_SEND,
        ],
      });
      const stuckCampaigns = sessions.map((session) => ({
        id: session.id,
        status: session.status,
      }));

      let fixedCount = 0;

      for (const campaign of stuckCampaigns) {
        try {
          const originalStatus = campaign.status;
          await this.checkAndUpdateCampaignCompletion(campaign.id, organizationId);

          // Check if status changed
          const session = await getEmailGenerationSessionById(campaign.id, organizationId);
          const updatedCampaign = session ? { status: session.status } : null;

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

  /**
   * Handle conversation using the agentic flow
   */
  private async handleAgenticConversation(
    input: SmartEmailGenerationInput,
    session: EmailGenerationSession,
    organizationId: string,
    userId: string,
    updatedChatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<SmartEmailGenerationResponse> {
    logger.info('[handleAgenticConversation] Starting agentic conversation');
    logger.info('[handleAgenticConversation] Input:', JSON.stringify(input));
    logger.info('[handleAgenticConversation] Session ID:', session.id);
    logger.info(
      '[handleAgenticConversation] Updated chat history:',
      JSON.stringify(updatedChatHistory)
    );

    const smartEmailService = new SmartEmailGenerationService();

    // Check if we have an existing smart email session
    const smartSessionKey = `smart_session_${session.id}`;
    let smartSessionId = (session as any).smartSessionId;

    try {
      if (!smartSessionId) {
        // First message - start a new smart email flow
        logger.info('[EmailCampaignsService] Starting new smart email session');

        // Get donor IDs from the session
        const donorIds = (session.selectedDonorIds as number[]) || [];

        // Extract the initial instruction from chat history
        const userMessages = updatedChatHistory
          .filter((msg) => msg.role === 'user')
          .map((msg) => msg.content);
        const initialInstruction = userMessages[userMessages.length - 1] || input.newMessage;

        const { sessionId: newSmartSessionId, response } =
          await smartEmailService.startSmartEmailFlow({
            organizationId,
            userId,
            donorIds,
            initialInstruction: initialInstruction || '',
          });

        smartSessionId = newSmartSessionId;

        // Store the smart session ID in the email generation session
        await updateEmailGenerationSession(session.id, organizationId, {
          smartSessionId,
        } as any);

        console.log('response', response);

        // Don't add AI response here - SmartEmailGenerationService already handles it
        // to avoid duplicate messages in chat history

        // Check if conversation is complete
        if (!response.shouldContinue) {
          return await this.generateEmailsFromSmartSession(
            session,
            organizationId,
            smartSessionId,
            response.content
          );
        }

        return {
          success: true,
          sessionId: session.id,
          chatHistory: await this.getChatHistory(session.id, organizationId),
          generatedEmailsCount: 0,
          deletedEmailsCount: 0,
          failedEmailsCount: 0,
          message: response.content,
        };
      } else {
        // Continue existing conversation
        logger.info(`[EmailCampaignsService] Continuing smart email session ${smartSessionId}`);

        const { response, isComplete, finalInstruction } =
          await smartEmailService.continueConversation({
            sessionId: smartSessionId,
            userMessage: input.newMessage!,
            organizationId,
            userId,
          });

        // Don't add AI response here - SmartEmailGenerationService already handles it
        // to avoid duplicate messages in chat history

        // Check if user is explicitly asking to generate emails
        const userWantsToGenerate =
          input.newMessage!.toLowerCase().includes('generate') ||
          input.newMessage!.toLowerCase().includes('create') ||
          input.newMessage!.toLowerCase().includes('write');

        logger.info('[handleAgenticConversation] Decision point:', {
          isComplete,
          userWantsToGenerate,
          hasFinalInstruction: !!finalInstruction,
          userMessage: input.newMessage,
          willGenerateEmails: isComplete || (userWantsToGenerate && finalInstruction),
        });

        // Generate emails if conversation is complete or user explicitly asks
        if (isComplete || (userWantsToGenerate && finalInstruction)) {
          return await this.generateEmailsFromSmartSession(
            session,
            organizationId,
            smartSessionId,
            response.content
          );
        }

        // Ensure we have a meaningful message for the frontend
        const messageToReturn =
          response.content && response.content.trim() !== ''
            ? response.content
            : "I understand you'd like to continue our conversation. How can I help you craft the perfect emails for your donors?";

        return {
          success: true,
          sessionId: session.id,
          chatHistory: await this.getChatHistory(session.id, organizationId),
          generatedEmailsCount: 0,
          deletedEmailsCount: 0,
          failedEmailsCount: 0,
          message: messageToReturn,
        };
      }
    } catch (error) {
      logger.error('[EmailCampaignsService] Error in agentic conversation:', error);
      logger.error('[EmailCampaignsService] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        sessionId: session.id,
        smartSessionId,
      });

      // Return an error message to the user instead of falling back to generation
      const errorMessage =
        'I apologize, but I encountered an issue while processing your request. Let me try again. What specific aspects of your donors would you like to know about for crafting thank you emails?';

      // Add error recovery message to chat history
      if (session.id && organizationId) {
        try {
          await this.addAIResponseToChatHistory(session.id, organizationId, errorMessage);
        } catch (historyError) {
          logger.error(
            '[EmailCampaignsService] Failed to add error message to chat history:',
            historyError
          );
        }
      }

      return {
        success: true,
        sessionId: session.id,
        chatHistory: await this.getChatHistory(session.id, organizationId),
        generatedEmailsCount: 0,
        deletedEmailsCount: 0,
        failedEmailsCount: 0,
        message: errorMessage,
      };
    }
  }

  /**
   * Generate emails from a completed smart email session
   */
  private async generateEmailsFromSmartSession(
    session: EmailGenerationSession,
    organizationId: string,
    smartSessionId: string,
    aiResponse: string
  ): Promise<SmartEmailGenerationResponse> {
    const smartEmailService = new SmartEmailGenerationService();

    // Get the final instruction from the smart session
    const sessionState = await smartEmailService.getSessionState({
      sessionId: smartSessionId,
      organizationId,
      userId: session.userId,
    });

    const finalInstruction = sessionState.session.finalInstruction;
    if (!finalInstruction) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No final instruction found in smart email session',
      });
    }

    // Get updated chat history including the final instruction
    const existingChatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];
    const enhancedChatHistory = [
      ...existingChatHistory,
      { role: 'user' as const, content: finalInstruction },
    ];

    // Update session chat history
    await updateEmailGenerationSession(session.id, organizationId, {
      chatHistory: enhancedChatHistory,
    });

    // Get donors to process
    const donorsToProcess = await this.getDonorsToProcess(session, 'regenerate');

    // Note: We don't delete existing emails anymore - the saveGeneratedEmail function
    // in UnifiedSmartEmailGenerationService will handle upsert logic automatically

    // Use the same streaming service as handleGenerateWithNewMessage
    const emailGenerationService = new UnifiedSmartEmailGenerationService();
    const generator = emailGenerationService.generateSmartEmailsForCampaignStream({
      organizationId,
      sessionId: String(session.id),
      chatHistory: enhancedChatHistory,
      donorIds: donorsToProcess.map((id) => String(id)),
    });

    let finalResult: any = null;
    let successfulCount = 0;
    let failedCount = 0;

    // Process the stream
    for await (const update of generator) {
      if (update.result) {
        finalResult = update.result;
        successfulCount = update.result.results.filter((r: any) => r.email !== null).length;
        failedCount = update.result.results.filter((r: any) => r.email === null).length;
      }
    }

    return {
      success: true,
      sessionId: session.id,
      chatHistory: enhancedChatHistory,
      generatedEmailsCount: successfulCount,
      deletedEmailsCount: 0, // No longer deleting emails upfront
      failedEmailsCount: failedCount,
      message: `${aiResponse}\n\nGenerated ${successfulCount} emails successfully!`,
    };
  }

  /**
   * Add AI response to chat history
   */
  private async addAIResponseToChatHistory(
    sessionId: number,
    organizationId: string,
    aiResponse: string
  ): Promise<void> {
    const session = await getEmailGenerationSessionById(sessionId, organizationId);
    if (!session) return;

    const chatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];
    chatHistory.push({ role: 'assistant', content: aiResponse });

    await updateEmailGenerationSession(sessionId, organizationId, {
      chatHistory,
    });
  }

  /**
   * Get chat history for a session
   */
  private async getChatHistory(
    sessionId: number,
    organizationId: string
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const session = await getEmailGenerationSessionById(sessionId, organizationId);
    if (!session) return [];

    // Check if we have a smart session ID, which means we're using the agentic flow
    const smartSessionId = (session as any).smartSessionId;

    const useAgenticFlow = await isFeatureEnabledForOrganization(
      organizationId,
      'use_agentic_flow'
    );

    if (smartSessionId && useAgenticFlow) {
      // Get messages from the SmartEmailGenerationService
      try {
        const smartEmailService = new SmartEmailGenerationService();
        const sessionState = await smartEmailService.getSessionState({
          sessionId: smartSessionId,
          organizationId,
          userId: session.userId,
        });

        // Convert smart email messages to chat history format
        return sessionState.messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));
      } catch (error) {
        logger.error('[getChatHistory] Failed to get messages from smart email service:', error);
        // Fall back to session chat history
        return (
          (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || []
        );
      }
    }

    // For non-agentic flow or if smart session doesn't exist, use session chat history
    return (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];
  }

  /**
   * Streaming version of handleGenerateWithNewMessage
   */
  private async *handleGenerateWithNewMessageStream(
    input: SmartEmailGenerationInput,
    session: EmailGenerationSession,
    organizationId: string,
    userId: string
  ): AsyncGenerator<{
    status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
    message?: string;
    result?: SmartEmailGenerationResponse;
  }> {
    // Validate input
    if (!input.newMessage?.trim()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'New message is required for generate_with_new_message mode',
      });
    }

    // Check if we should use the agentic flow
    const useAgenticFlow = await isFeatureEnabledForOrganization(
      organizationId,
      'use_agentic_flow'
    );

    if (useAgenticFlow) {
      logger.info('[handleGenerateWithNewMessageStream] Using agentic flow');
      // For agentic flow, delegate to non-streaming version for now
      const result = await this.handleGenerateWithNewMessage(
        input,
        session,
        organizationId,
        userId
      );
      yield {
        status: 'refined' as const,
        result,
      };
      return;
    }

    // For non-agentic flow, update chat history
    const existingChatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];

    const updatedChatHistory = await this.updateChatHistory(
      session.id,
      organizationId,
      input.newMessage,
      existingChatHistory
    );

    // Get or create preview donors
    const previewDonorIds = await this.getDonorsToProcess(session, 'new_preview');

    // Use streaming generation service
    const emailGenerationService = new UnifiedSmartEmailGenerationService();
    const stream = emailGenerationService.generateSmartEmailsForCampaignStream({
      organizationId,
      sessionId: String(session.id),
      chatHistory: updatedChatHistory,
      donorIds: previewDonorIds.map((id) => String(id)),
    });

    // Forward all stream updates
    let finalResult: any = null;
    for await (const update of stream) {
      // When we get the final result, format it as SmartEmailGenerationResponse
      if (update.status === 'refined' && update.result) {
        finalResult = update.result;
        const successfulCount = update.result.results.filter((r) => r.email !== null).length;
        const failedCount = update.result.results.filter((r) => r.email === null).length;

        // Add assistant response to chat history
        const assistantMessage = `Generated ${successfulCount} emails for ${previewDonorIds.length} preview donors`;
        const finalChatHistory = [
          ...updatedChatHistory,
          { role: 'assistant' as const, content: assistantMessage },
        ];

        // Update session with final chat history including assistant response
        await updateEmailGenerationSession(session.id, organizationId, {
          chatHistory: finalChatHistory,
        });

        yield {
          status: update.status,
          result: {
            success: true,
            sessionId: session.id,
            chatHistory: finalChatHistory,
            generatedEmailsCount: successfulCount,
            deletedEmailsCount: 0,
            failedEmailsCount: failedCount,
            message: assistantMessage,
          },
        };
      } else {
        // For intermediate updates, only pass status and message (no result to avoid type mismatch)
        yield {
          status: update.status,
          message: update.message,
        };
      }
    }
  }

  /**
   * Streaming version of handleGenerateMore
   */
  private async *handleGenerateMoreStream(
    input: SmartEmailGenerationInput,
    session: EmailGenerationSession,
    organizationId: string,
    userId: string
  ): AsyncGenerator<{
    status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
    message?: string;
    result?: SmartEmailGenerationResponse;
  }> {
    // Validate input
    const count = input.count || 5; // Default to 5 if not specified
    if (count <= 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Count must be greater than 0 for generate_more mode',
      });
    }

    // Get existing data
    const existingChatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];
    const previewDonorIds = (session.previewDonorIds as number[]) || [];
    const selectedDonorIds = (session.selectedDonorIds as number[]) || [];

    // Find donors that haven't been processed yet
    const remainingDonorIds = selectedDonorIds.filter((id) => !previewDonorIds.includes(id));

    if (remainingDonorIds.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No more donors available to generate emails for',
      });
    }

    // Select random donors from remaining pool
    const shuffled = [...remainingDonorIds].sort(() => Math.random() - 0.5);
    const newDonorIds = shuffled.slice(0, Math.min(count, shuffled.length));

    logger.info(
      `[handleGenerateMoreStream] Selecting ${newDonorIds.length} donors from ${remainingDonorIds.length} remaining donors`
    );

    // Add new donors to preview set
    const updatedPreviewDonorIds = [...new Set([...previewDonorIds, ...newDonorIds])];
    await this.updateSessionPreviewDonors(session.id, organizationId, updatedPreviewDonorIds);

    logger.info(`[handleGenerateMoreStream] Added ${newDonorIds.length} new donors to preview set`);

    // Use the same streaming service as handleGenerateWithNewMessage
    const emailGenerationService = new UnifiedSmartEmailGenerationService();
    const generator = emailGenerationService.generateSmartEmailsForCampaignStream({
      organizationId,
      sessionId: String(session.id),
      chatHistory: existingChatHistory,
      donorIds: newDonorIds.map((id) => String(id)),
    });

    let finalResult: any = null;
    let successfulCount = 0;
    let failedCount = 0;

    // Forward all stream updates
    for await (const update of generator) {
      if (update.result) {
        finalResult = update.result;
        successfulCount = update.result.results.filter((r: any) => r.email !== null).length;
        failedCount = update.result.results.filter((r: any) => r.email === null).length;
      }

      // When we get the final result, format it as SmartEmailGenerationResponse
      if (update.status === 'refined' && update.result) {
        yield {
          status: update.status,
          result: {
            success: true,
            sessionId: session.id,
            chatHistory: existingChatHistory,
            generatedEmailsCount: successfulCount,
            deletedEmailsCount: 0,
            failedEmailsCount: failedCount,
            message: `Generated ${successfulCount} emails for ${newDonorIds.length} new donors`,
          },
        };
      } else {
        // For intermediate updates, only pass status and message
        yield {
          status: update.status,
          message: update.message,
        };
      }
    }
  }

  /**
   * Streaming version of handleRegenerateAll
   */
  private async *handleRegenerateAllStream(
    input: SmartEmailGenerationInput,
    session: EmailGenerationSession,
    organizationId: string,
    userId: string
  ): AsyncGenerator<{
    status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
    message?: string;
    result?: SmartEmailGenerationResponse;
  }> {
    const existingChatHistory =
      (session.chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>) || [];

    // Get donors to regenerate
    const donorsToProcess = await this.getDonorsToProcess(session, 'regenerate');

    // Note: We don't delete existing emails anymore - the saveGeneratedEmail function
    // in UnifiedSmartEmailGenerationService will handle upsert logic automatically
    logger.info(
      `[handleRegenerateAllStream] Regenerating emails for ${donorsToProcess.length} donors`
    );

    // Use the same streaming service as handleGenerateWithNewMessage
    const emailGenerationService = new UnifiedSmartEmailGenerationService();
    const generator = emailGenerationService.generateSmartEmailsForCampaignStream({
      organizationId,
      sessionId: String(session.id),
      chatHistory: existingChatHistory,
      donorIds: donorsToProcess.map((id) => String(id)),
    });

    let finalResult: any = null;
    let successfulCount = 0;
    let failedCount = 0;

    // Forward all stream updates
    for await (const update of generator) {
      if (update.result) {
        finalResult = update.result;
        successfulCount = update.result.results.filter((r: any) => r.email !== null).length;
        failedCount = update.result.results.filter((r: any) => r.email === null).length;
      }

      // When we get the final result, format it as SmartEmailGenerationResponse
      if (update.status === 'refined' && update.result) {
        yield {
          status: update.status,
          result: {
            success: true,
            sessionId: session.id,
            chatHistory: existingChatHistory,
            generatedEmailsCount: successfulCount,
            deletedEmailsCount: 0, // No longer deleting emails upfront
            failedEmailsCount: failedCount,
            message: `Regenerated ${successfulCount} emails for ${donorsToProcess.length} preview donors`,
          },
        };
      } else {
        // For intermediate updates, only pass status and message
        yield {
          status: update.status,
          message: update.message,
        };
      }
    }
  }
}
