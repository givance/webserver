import { TRPCError } from "@trpc/server";
import { and, desc, eq, count, sql, or, inArray } from "drizzle-orm";
import { db } from "@/app/lib/db";
import {
  emailGenerationSessions,
  generatedEmails,
  EmailGenerationSessionStatus,
  emailSendJobs,
  organizations,
  staff,
  donors,
} from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";
import { runs } from "@trigger.dev/sdk/v3";
import { appendSignatureToEmail } from "@/app/lib/utils/email-with-signature";
import { removeSignatureFromContent } from "@/app/lib/utils/email-with-signature";
import { UnifiedSmartEmailGenerationService } from "./unified-smart-email-generation.service";

/**
 * Input types for campaign management
 */
export interface CreateSessionInput {
  campaignName: string;
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  selectedDonorIds: number[];
  previewDonorIds: number[];
  templateId?: number;
  // Signature configuration
  signatureType?: "none" | "custom" | "staff";
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
    role: "user" | "assistant";
    content: string;
  }>;
  selectedDonorIds?: number[];
  previewDonorIds?: number[];
  templateId?: number;
}

export interface RegenerateAllEmailsInput {
  sessionId: number;
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface SmartEmailGenerationInput {
  sessionId: number;
  mode: "generate_more" | "regenerate_all" | "generate_with_new_message";
  // For generate_more: specify which new donors to generate for
  newDonorIds?: number[];
  // For generate_with_new_message: the new message to add to chat history
  newMessage?: string;
}

export interface SmartEmailGenerationResponse {
  success: boolean;
  sessionId: number;
  // Always return the updated chat history to keep frontend in sync
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
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
    role: "user" | "assistant";
    content: string;
  }>;
  previewDonorIds?: number[];
  // Signature configuration
  signatureType?: "none" | "custom" | "staff";
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
          code: "BAD_REQUEST",
          message: "Selected donor IDs are required to launch a campaign",
        });
      }

      // First check if there's an existing campaign with the same ID
      const existingCampaign = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.id, input.campaignId),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!existingCampaign[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      let sessionId: number = existingCampaign[0].id;

      // First, count existing emails (both PENDING_APPROVAL and APPROVED) for selected donors
      const existingEmailsForSelectedDonors = await db
        .select({ donorId: generatedEmails.donorId })
        .from(generatedEmails)
        .where(
          and(
            eq(generatedEmails.sessionId, existingCampaign[0].id),
            or(eq(generatedEmails.status, "PENDING_APPROVAL"), eq(generatedEmails.status, "APPROVED"))
          )
        );

      // Count how many of the selected donors already have emails
      const existingDonorIds = existingEmailsForSelectedDonors.map((e) => e.donorId);
      const currentCompletedCount = input.selectedDonorIds.filter((id) => existingDonorIds.includes(id)).length;

      // Determine the appropriate status based on whether emails need to be generated
      const allEmailsExist = currentCompletedCount === input.selectedDonorIds.length;
      const newStatus = allEmailsExist
        ? EmailGenerationSessionStatus.READY_TO_SEND
        : EmailGenerationSessionStatus.GENERATING;

      // Update existing campaign with appropriate status
      logger.info(`[launchCampaign] Updating existing campaign ${existingCampaign[0].id} to ${newStatus} status`, {
        campaignId: existingCampaign[0].id,
        oldStatus: existingCampaign[0].status,
        newStatus,
        totalDonors: input.selectedDonorIds.length,
        currentCompletedCount,
        allEmailsExist,
        organizationId,
        userId,
      });

      const [updatedSession] = await db
        .update(emailGenerationSessions)
        .set({
          status: newStatus,
          chatHistory: input.chatHistory ?? existingCampaign[0].chatHistory,
          selectedDonorIds: input.selectedDonorIds,
          previewDonorIds: input.previewDonorIds ?? [],
          totalDonors: input.selectedDonorIds.length,
          completedDonors: currentCompletedCount, // Set the initial completed count
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, existingCampaign[0].id))
        .returning();

      sessionId = updatedSession.id;

      // Update any PENDING_APPROVAL emails to APPROVED
      await db
        .update(generatedEmails)
        .set({
          status: "APPROVED",
          isPreview: false,
          isSent: false,
          sendStatus: "pending",
          updatedAt: new Date(),
        })
        .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.status, "PENDING_APPROVAL")));

      logger.info(
        `Updated existing campaign session ${sessionId} to ${newStatus} with ${currentCompletedCount} completed donors for user ${userId}`
      );

      // Get the list of donors that already have approved emails
      const existingEmails = await db
        .select({ donorId: generatedEmails.donorId })
        .from(generatedEmails)
        .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.status, "APPROVED")));

      const alreadyGeneratedDonorIds = existingEmails.map((e) => e.donorId);
      const donorsToGenerate = input.selectedDonorIds.filter((id) => !alreadyGeneratedDonorIds.includes(id));

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
              (existingCampaign[0].chatHistory as Array<{ role: "user" | "assistant"; content: string }>) ??
              [],
            templateId: input.templateId ?? existingCampaign[0].templateId ?? undefined,
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
          await db
            .update(emailGenerationSessions)
            .set({
              errorMessage: `Failed to start background job: ${
                triggerError instanceof Error ? triggerError.message : String(triggerError)
              }`,
              updatedAt: new Date(),
            })
            .where(eq(emailGenerationSessions.id, sessionId));

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to start email generation job. Please check your Trigger.dev configuration.",
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
          await db
            .update(emailGenerationSessions)
            .set({
              status: EmailGenerationSessionStatus.READY_TO_SEND,
              completedDonors: input.selectedDonorIds.length,
              updatedAt: new Date(),
            })
            .where(eq(emailGenerationSessions.id, sessionId));
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
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to launch email generation campaign",
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
      const existingDraft = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.organizationId, organizationId),
            eq(emailGenerationSessions.jobName, input.campaignName),
            eq(emailGenerationSessions.status, EmailGenerationSessionStatus.DRAFT)
          )
        )
        .limit(1);

      if (existingDraft[0]) {
        // Update existing draft
        const [updatedSession] = await db
          .update(emailGenerationSessions)
          .set({
            chatHistory: input.chatHistory,
            selectedDonorIds: input.selectedDonorIds,
            previewDonorIds: input.previewDonorIds,
            totalDonors: input.selectedDonorIds.length,
            completedDonors: 0,
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, existingDraft[0].id))
          .returning();

        logger.info(`Updated existing draft session ${updatedSession.id} for user ${userId}`);
        return { sessionId: updatedSession.id };
      } else {
        // Create new draft session
        const [session] = await db
          .insert(emailGenerationSessions)
          .values({
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
          })
          .returning();

        logger.info(`Created new draft session ${session.id} for user ${userId}`);
        return { sessionId: session.id };
      }
    } catch (error) {
      logger.error("Error in createSession:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create session",
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
      const [session] = await db
        .select()
        .from(emailGenerationSessions)
        .where(eq(emailGenerationSessions.id, sessionId))
        .limit(1);

      if (!session || session.organizationId !== organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Get generated emails for this session
      const emails = await db.select().from(generatedEmails).where(eq(generatedEmails.sessionId, sessionId));

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
      logger.error(`Failed to get email generation session: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get email generation session",
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
    const session = await db.query.emailGenerationSessions.findFirst({
      where: and(eq(emailGenerationSessions.id, sessionId), eq(emailGenerationSessions.organizationId, organizationId)),
      columns: {
        status: true,
        totalDonors: true,
        completedDonors: true,
        id: true,
      },
    });

    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
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

      await db
        .update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.COMPLETED,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

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
    const campaigns = await db
      .select({
        id: emailGenerationSessions.id,
        campaignName: emailGenerationSessions.jobName,
        status: emailGenerationSessions.status,
        totalDonors: emailGenerationSessions.totalDonors,
        completedDonors: emailGenerationSessions.completedDonors,
        errorMessage: emailGenerationSessions.errorMessage,
        createdAt: emailGenerationSessions.createdAt,
        updatedAt: emailGenerationSessions.updatedAt,
        completedAt: emailGenerationSessions.completedAt,
      })
      .from(emailGenerationSessions)
      .where(and(...whereClauses))
      .orderBy(desc(emailGenerationSessions.createdAt))
      .limit(limit)
      .offset(offset);

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
        batchResults = await this.checkAndUpdateMultipleCampaignCompletion(campaignsToCheck, organizationId);
      } catch (error) {
        logger.warn(`Failed to check completion for campaigns ${campaignsToCheck.join(", ")}: ${error}`);
      }
    }

    // Get email counts for all campaigns in batch
    const allSessionIds = campaigns.map((c) => c.id);
    const emailCounts = await db
      .select({
        sessionId: generatedEmails.sessionId,
        totalEmails: count(),
        sentEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.isSent} = true THEN 1 END)`,
      })
      .from(generatedEmails)
      .where(inArray(generatedEmails.sessionId, allSessionIds))
      .groupBy(generatedEmails.sessionId);

    // Create lookup map for email counts
    const emailCountsMap = new Map();
    emailCounts.forEach((count) => {
      emailCountsMap.set(count.sessionId, count);
    });

    // Get updated campaign statuses in batch
    const updatedCampaigns = await db
      .select({
        id: emailGenerationSessions.id,
        status: emailGenerationSessions.status,
        completedDonors: emailGenerationSessions.completedDonors,
      })
      .from(emailGenerationSessions)
      .where(inArray(emailGenerationSessions.id, allSessionIds));

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

    const totalCountResult = await db
      .select({ count: count() })
      .from(emailGenerationSessions)
      .where(and(...whereClauses));

    const totalCount = totalCountResult[0]?.count ?? 0;

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
    const campaign = await db.query.emailGenerationSessions.findFirst({
      where: and(
        eq(emailGenerationSessions.id, campaignId),
        eq(emailGenerationSessions.organizationId, organizationId)
      ),
      columns: { id: true },
    });

    if (!campaign) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    }

    // Get all scheduled jobs that need to be cancelled
    const scheduledJobs = await db
      .select()
      .from(emailSendJobs)
      .where(
        and(
          eq(emailSendJobs.sessionId, campaignId),
          eq(emailSendJobs.organizationId, organizationId),
          eq(emailSendJobs.status, "scheduled")
        )
      );

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

    // Use a transaction to delete the job and associated emails
    await db.transaction(async (tx) => {
      // Delete associated emails first to maintain foreign key constraints
      await tx.delete(generatedEmails).where(eq(generatedEmails.sessionId, campaignId));

      // Then delete the job
      await tx.delete(emailGenerationSessions).where(eq(emailGenerationSessions.id, campaignId));
    });

    logger.info(`Campaign ${campaignId} and associated emails deleted for organization ${organizationId}`);
    return { campaignId };
  }

  /**
   * Updates email approval status
   * @param emailId - The email ID
   * @param status - The new status (PENDING_APPROVAL or APPROVED)
   * @param organizationId - The organization ID for authorization
   * @returns The updated email
   */
  async updateEmailStatus(emailId: number, status: "PENDING_APPROVAL" | "APPROVED", organizationId: string) {
    try {
      // First verify the email exists and belongs to the user's organization
      const [existingEmail] = await db
        .select({
          id: generatedEmails.id,
          sessionId: generatedEmails.sessionId,
          isSent: generatedEmails.isSent,
          currentStatus: generatedEmails.status,
        })
        .from(generatedEmails)
        .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
        .where(and(eq(generatedEmails.id, emailId), eq(emailGenerationSessions.organizationId, organizationId)))
        .limit(1);

      if (!existingEmail) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Email not found",
        });
      }

      if (existingEmail.isSent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change status of an email that has already been sent",
        });
      }

      // Update the email status
      const [updatedEmail] = await db
        .update(generatedEmails)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, emailId))
        .returning();

      logger.info(
        `Updated email ${emailId} status from ${existingEmail.currentStatus} to ${status} for organization ${organizationId}`
      );

      return {
        success: true,
        email: updatedEmail,
        message: `Email ${status === "APPROVED" ? "approved" : "marked as pending"}`,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to update email status: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update email status",
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
      logger.info(`Getting email status for emailId: ${emailId}, organizationId: ${organizationId}`);

      // Validate emailId
      if (!emailId || emailId <= 0) {
        logger.warn(`Invalid emailId provided: ${emailId}`);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid email ID provided",
        });
      }

      const [email] = await db
        .select({
          id: generatedEmails.id,
          isSent: generatedEmails.isSent,
          sentAt: generatedEmails.sentAt,
        })
        .from(generatedEmails)
        .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
        .where(and(eq(generatedEmails.id, emailId), eq(emailGenerationSessions.organizationId, organizationId)))
        .limit(1);

      if (!email) {
        logger.warn(`Email not found for emailId: ${emailId}, organizationId: ${organizationId}`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Email not found",
        });
      }

      logger.info(`Successfully retrieved email status for emailId: ${emailId}, isSent: ${email.isSent}`);
      return email;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to get email status for emailId: ${emailId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get email status",
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
      const [existingEmail] = await db
        .select({
          id: generatedEmails.id,
          sessionId: generatedEmails.sessionId,
          isSent: generatedEmails.isSent,
        })
        .from(generatedEmails)
        .innerJoin(emailGenerationSessions, eq(generatedEmails.sessionId, emailGenerationSessions.id))
        .where(and(eq(generatedEmails.id, input.emailId), eq(emailGenerationSessions.organizationId, organizationId)))
        .limit(1);

      if (!existingEmail) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Email not found",
        });
      }

      if (existingEmail.isSent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit an email that has already been sent",
        });
      }

      // Remove signature from content before saving
      const contentWithoutSignature = removeSignatureFromContent(input.structuredContent);

      // Update the email and reset status to PENDING_APPROVAL since content was edited
      const [updatedEmail] = await db
        .update(generatedEmails)
        .set({
          subject: input.subject,
          structuredContent: contentWithoutSignature, // Save without signature
          referenceContexts: input.referenceContexts,
          status: "PENDING_APPROVAL", // Reset status when email is edited
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, input.emailId))
        .returning();

      logger.info(
        `Updated email ${input.emailId} for organization ${organizationId}: subject="${input.subject}" and reset status to PENDING_APPROVAL`
      );

      return {
        success: true,
        email: updatedEmail,
        message: "Email updated successfully and marked for review",
        sessionId: existingEmail.sessionId,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to update email: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update email",
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
      const [existingCampaign] = await db
        .select({
          id: emailGenerationSessions.id,
          status: emailGenerationSessions.status,
        })
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.id, input.campaignId),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!existingCampaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      if (
        existingCampaign.status === EmailGenerationSessionStatus.GENERATING ||
        existingCampaign.status === EmailGenerationSessionStatus.READY_TO_SEND
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit a campaign that is currently processing",
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
      if (input.previewDonorIds) {
        updateData.previewDonorIds = input.previewDonorIds;
      }
      if (input.templateId !== undefined) {
        updateData.templateId = input.templateId;
      }

      // Update the campaign
      const [updatedCampaign] = await db
        .update(emailGenerationSessions)
        .set(updateData)
        .where(eq(emailGenerationSessions.id, input.campaignId))
        .returning();

      logger.info(`Updated campaign ${input.campaignId} for organization ${organizationId}`);

      return {
        success: true,
        campaign: updatedCampaign,
        message: "Campaign updated successfully",
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to update campaign: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update campaign",
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
  async regenerateAllEmails(input: RegenerateAllEmailsInput, organizationId: string, userId: string) {
    try {
      // First verify the session exists and belongs to the user's organization
      const [existingSession] = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.id, input.sessionId),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!existingSession) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign session not found",
        });
      }

      // Get preview donor IDs from the session
      const previewDonorIds = (existingSession.previewDonorIds as number[]) || [];

      logger.info(
        `[regenerateAllEmails] Session ${input.sessionId} has previewDonorIds: ${JSON.stringify(previewDonorIds)}`
      );

      // Get all emails for this session to understand what's happening
      const allSessionEmails = await db
        .select({
          donorId: generatedEmails.donorId,
          isPreview: generatedEmails.isPreview,
          status: generatedEmails.status,
        })
        .from(generatedEmails)
        .where(eq(generatedEmails.sessionId, input.sessionId));

      logger.info(`[regenerateAllEmails] All emails in session: ${JSON.stringify(allSessionEmails)}`);

      // Get all donors that have preview emails in this session
      const existingPreviewEmails = allSessionEmails.filter((e) => e.isPreview === true);
      const allPreviewDonorIds = [...new Set(existingPreviewEmails.map((e) => e.donorId))];

      // Also check if there are any emails with PENDING_APPROVAL status (these might be preview emails too)
      const pendingApprovalEmails = allSessionEmails.filter((e) => e.status === "PENDING_APPROVAL");
      const pendingApprovalDonorIds = [...new Set(pendingApprovalEmails.map((e) => e.donorId))];

      logger.info(
        `[regenerateAllEmails] Found ${allPreviewDonorIds.length} donors with isPreview=true, ${pendingApprovalDonorIds.length} with PENDING_APPROVAL status`
      );

      // Combine all potential preview donors
      const combinedDonorIds = [...new Set([...allPreviewDonorIds, ...pendingApprovalDonorIds, ...previewDonorIds])];

      logger.info(
        `[regenerateAllEmails] Combined donor IDs (preview + pending + stored): ${JSON.stringify(combinedDonorIds)}`
      );

      // Use combined list for regeneration
      const donorsToRegenerate = combinedDonorIds;

      if (donorsToRegenerate.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No preview donors found for regeneration",
        });
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
          and(eq(generatedEmails.sessionId, input.sessionId), inArray(generatedEmails.donorId, donorsToRegenerate))
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
      logger.error(`Failed to regenerate emails: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to regenerate emails",
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
      const [existingSession] = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.id, input.sessionId),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!existingSession) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign session not found",
        });
      }

      // Get existing chat history from database (source of truth)
      const existingChatHistory =
        (existingSession.chatHistory as Array<{ role: "user" | "assistant"; content: string }>) || [];
      let finalChatHistory = existingChatHistory;

      // Handle generate_with_new_message mode
      if (input.mode === "generate_with_new_message") {
        if (!input.newMessage?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New message is required for generate_with_new_message mode",
          });
        }

        // Append new message to chat history
        finalChatHistory = [...existingChatHistory, { role: "user" as const, content: input.newMessage.trim() }];

        // Update chat history in database
        await db
          .update(emailGenerationSessions)
          .set({
            chatHistory: finalChatHistory,
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, input.sessionId));

        logger.info(`[smartEmailGeneration] Updated chat history for session ${input.sessionId} with new message`);
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

      if (input.mode === "generate_more") {
        // Generate emails for new donors
        if (!input.newDonorIds || input.newDonorIds.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "newDonorIds are required for generate_more mode",
          });
        }

        donorsToProcess = input.newDonorIds;
        shouldDeleteExisting = false;

        // Add new donors to preview set permanently
        const updatedPreviewDonorIds = [...new Set([...previewDonorIds, ...input.newDonorIds])];
        await db
          .update(emailGenerationSessions)
          .set({
            previewDonorIds: updatedPreviewDonorIds,
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, input.sessionId));

        logger.info(`[smartEmailGeneration] Added ${input.newDonorIds.length} new donors to preview set`);
      } else if (input.mode === "regenerate_all" || input.mode === "generate_with_new_message") {
        // Regenerate emails for existing preview donors
        if (previewDonorIds.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No preview donors found for regeneration",
          });
        }

        donorsToProcess = previewDonorIds;
        shouldDeleteExisting = true;
      }

      // Delete existing emails if needed
      let deletedCount = 0;
      if (shouldDeleteExisting) {
        const deleteResult = await db
          .delete(generatedEmails)
          .where(and(eq(generatedEmails.sessionId, input.sessionId), inArray(generatedEmails.donorId, donorsToProcess)))
          .returning({ id: generatedEmails.id });

        deletedCount = deleteResult.length;
        logger.info(`[smartEmailGeneration] Deleted ${deletedCount} existing emails for session ${input.sessionId}`);
      }

      // Generate emails using the unified service
      const emailGenerationService = new UnifiedSmartEmailGenerationService();

      logger.info(`[smartEmailGeneration] Starting email generation for ${donorsToProcess.length} donors`);

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
      let message = "";
      if (input.mode === "generate_more") {
        message = `Generated ${successfulCount} emails for ${donorsToProcess.length} new donors`;
      } else if (input.mode === "regenerate_all") {
        message = `Regenerated ${successfulCount} emails for ${donorsToProcess.length} preview donors`;
      } else if (input.mode === "generate_with_new_message") {
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
      logger.error(`[smartEmailGeneration] Failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate emails",
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
        code: "BAD_REQUEST",
        message: "Campaign name and selected donors are required",
      });
    }

    try {
      if (input.sessionId) {
        logger.info(`[saveDraft] Attempting to update existing draft session ${input.sessionId}`);

        // First check if the session exists and its current status
        const existingSession = await db
          .select()
          .from(emailGenerationSessions)
          .where(
            and(
              eq(emailGenerationSessions.id, input.sessionId),
              eq(emailGenerationSessions.organizationId, organizationId)
            )
          )
          .limit(1);

        logger.info(`[saveDraft] Existing session lookup result:`, {
          found: !!existingSession[0],
          status: existingSession[0]?.status,
          sessionId: existingSession[0]?.id,
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
          existingStatus: existingSession[0]?.status,
          lastTwoMessages: updateData.chatHistory.slice(-2).map((m) => ({
            role: m.role,
            contentPreview: m.content.substring(0, 50) + "...",
          })),
        });

        const [updatedSession] = await db
          .update(emailGenerationSessions)
          .set(updateData)
          .where(
            and(
              eq(emailGenerationSessions.id, input.sessionId),
              eq(emailGenerationSessions.organizationId, organizationId)
              // Removed status check - allow updating sessions in any status
            )
          )
          .returning();

        if (!updatedSession) {
          logger.error(`[saveDraft] Failed to update session ${input.sessionId} - session not found`);
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
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
          status: "DRAFT" as const,
        };

        logger.info(`[saveDraft] Creating session with data:`, {
          ...newSessionData,
          chatHistoryLength: newSessionData.chatHistory.length,
          lastMessage:
            newSessionData.chatHistory.length > 0
              ? {
                  role: newSessionData.chatHistory[newSessionData.chatHistory.length - 1].role,
                  contentPreview:
                    newSessionData.chatHistory[newSessionData.chatHistory.length - 1].content.substring(0, 50) + "...",
                }
              : null,
        });

        // Create new draft
        const [newSession] = await db.insert(emailGenerationSessions).values(newSessionData).returning();

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
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to save draft",
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
      const sessions = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(
            inArray(emailGenerationSessions.id, sessionIds),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        );

      if (sessions.length === 0) return new Map();

      // Get email stats for all sessions in batch
      const emailStats = await db
        .select({
          sessionId: generatedEmails.sessionId,
          totalEmails: count(),
          sentEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.isSent} = true THEN 1 END)`,
          approvedEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.status} = 'APPROVED' THEN 1 END)`,
        })
        .from(generatedEmails)
        .where(inArray(generatedEmails.sessionId, sessionIds))
        .groupBy(generatedEmails.sessionId);

      // Create lookup map for email stats
      const emailStatsMap = new Map();
      emailStats.forEach((stats) => {
        emailStatsMap.set(stats.sessionId, stats);
      });

      const results = new Map();
      const sessionsToUpdate = [];

      logger.info(`[checkAndUpdateMultipleCampaignCompletion] Checking ${sessions.length} campaigns in batch`, {
        sessionIds,
        organizationId,
      });

      // Process each session
      for (const session of sessions) {
        const stats = emailStatsMap.get(session.id) || { totalEmails: 0, sentEmails: 0, approvedEmails: 0 };
        const selectedDonorIds = (session.selectedDonorIds as number[]) || [];
        const totalDonors = selectedDonorIds.length;

        let shouldUpdate = false;
        let newStatus = session.status;
        let newCompletedDonors = session.completedDonors;

        // Same logic as individual function but collected for batch update
        if (session.status === EmailGenerationSessionStatus.GENERATING && stats.approvedEmails > 0) {
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
            (session.status === EmailGenerationSessionStatus.GENERATING && stats.approvedEmails > 0)) &&
          stats.totalEmails > 0 &&
          stats.totalEmails === stats.sentEmails
        ) {
          logger.info(`[checkAndUpdateMultipleCampaignCompletion] Campaign ${session.id} completed - all emails sent`);
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
        for (const update of sessionsToUpdate) {
          await db
            .update(emailGenerationSessions)
            .set({
              status: update.status,
              completedDonors: update.completedDonors,
              updatedAt: new Date(),
              ...(update.shouldSetCompletedAt && {
                completedAt: new Date(),
              }),
            })
            .where(eq(emailGenerationSessions.id, update.id));
        }

        logger.info(
          `[checkAndUpdateMultipleCampaignCompletion] Updated ${sessionsToUpdate.length} campaigns: ${sessionsToUpdate
            .map((u) => `${u.id}->${u.status}`)
            .join(", ")}`
        );
      }

      return results;
    } catch (error) {
      logger.error(`Failed to check campaign completion for sessions ${sessionIds.join(", ")}: ${error}`);
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
      const session = await db.query.emailGenerationSessions.findFirst({
        where: and(
          eq(emailGenerationSessions.id, input.sessionId),
          eq(emailGenerationSessions.organizationId, organizationId)
        ),
        columns: { id: true },
      });

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      // Check if email already exists for this donor in this session
      const existingEmail = await db.query.generatedEmails.findFirst({
        where: and(eq(generatedEmails.sessionId, input.sessionId), eq(generatedEmails.donorId, input.donorId)),
        columns: { id: true },
      });

      // Remove signature from content before saving (only if structuredContent exists)
      const contentWithoutSignature = input.structuredContent
        ? removeSignatureFromContent(input.structuredContent)
        : undefined;

      if (existingEmail) {
        // Update existing email
        const updateData: any = {
          subject: input.subject,
          status: input.isPreview ? "PENDING_APPROVAL" : "APPROVED",
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

        const [updatedEmail] = await db
          .update(generatedEmails)
          .set(updateData)
          .where(eq(generatedEmails.id, existingEmail.id))
          .returning();
        return { success: true, email: updatedEmail };
      } else {
        // Create new email
        const insertData: any = {
          sessionId: input.sessionId,
          donorId: input.donorId,
          subject: input.subject,
          status: input.isPreview ? "PENDING_APPROVAL" : "APPROVED",
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

        const [newEmail] = await db.insert(generatedEmails).values(insertData).returning();
        return { success: true, email: newEmail };
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to save generated email: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to save generated email",
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
      const session = await db.query.emailGenerationSessions.findFirst({
        where: and(
          eq(emailGenerationSessions.id, sessionId),
          eq(emailGenerationSessions.organizationId, organizationId)
        ),
      });

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      // Only retry if status is PENDING or FAILED
      if (session.status !== EmailGenerationSessionStatus.GENERATING && true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot retry campaign with status: ${session.status}`,
        });
      }

      logger.info(`Retrying campaign ${sessionId} with status ${session.status}`);

      // Reset status to PENDING and clear error message
      await db
        .update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.GENERATING,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      // Get donors that don't have approved emails yet
      const existingEmails = await db
        .select({ donorId: generatedEmails.donorId })
        .from(generatedEmails)
        .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.status, "APPROVED")));

      const alreadyGeneratedDonorIds = existingEmails.map((e) => e.donorId);
      const selectedDonorIds = session.selectedDonorIds as number[];
      const donorsToGenerate = selectedDonorIds.filter((id) => !alreadyGeneratedDonorIds.includes(id));

      if (donorsToGenerate.length > 0) {
        try {
          logger.info(`Retrying trigger for session ${sessionId} with ${donorsToGenerate.length} donors`);

          await generateBulkEmailsTask.trigger({
            sessionId,
            organizationId,
            userId,
            selectedDonorIds: donorsToGenerate,
            previewDonorIds: session.previewDonorIds as number[],
            chatHistory: session.chatHistory as Array<{ role: "user" | "assistant"; content: string }>,
            templateId: session.templateId || undefined,
          });

          logger.info(`Successfully retried campaign ${sessionId}`);
          return { success: true, message: `Retried campaign with ${donorsToGenerate.length} donors` };
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
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to retry campaign. Please check your Trigger.dev configuration.",
          });
        }
      } else {
        // All donors already have emails, mark as completed
        await db
          .update(emailGenerationSessions)
          .set({
            status: "COMPLETED",
            completedDonors: selectedDonorIds.length,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, sessionId));

        logger.info(`Campaign ${sessionId} marked as completed - all donors already have emails`);
        return { success: true, message: "Campaign completed - all emails already generated" };
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to retry campaign ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to retry campaign",
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
      const stuckCampaigns = await db
        .select({
          id: emailGenerationSessions.id,
          status: emailGenerationSessions.status,
        })
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.organizationId, organizationId),
            or(
              eq(emailGenerationSessions.status, EmailGenerationSessionStatus.GENERATING),
              eq(emailGenerationSessions.status, EmailGenerationSessionStatus.READY_TO_SEND)
            )
          )
        );

      let fixedCount = 0;

      for (const campaign of stuckCampaigns) {
        try {
          const originalStatus = campaign.status;
          await this.checkAndUpdateCampaignCompletion(campaign.id, organizationId);

          // Check if status changed
          const [updatedCampaign] = await db
            .select({ status: emailGenerationSessions.status })
            .from(emailGenerationSessions)
            .where(eq(emailGenerationSessions.id, campaign.id))
            .limit(1);

          if (updatedCampaign && updatedCampaign.status !== originalStatus) {
            fixedCount++;
            logger.info(`Fixed campaign ${campaign.id}: ${originalStatus} → ${updatedCampaign.status}`);
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
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fix stuck campaigns",
      });
    }
  }
}
