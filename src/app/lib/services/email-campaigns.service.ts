import { TRPCError } from "@trpc/server";
import { and, desc, eq, count } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { emailGenerationSessions, generatedEmails } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";

/**
 * Input types for campaign management
 */
export interface CreateSessionInput {
  campaignName: string;
  instruction: string;
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  selectedDonorIds: number[];
  previewDonorIds: number[];
  refinedInstruction?: string;
  templateId?: number;
}

export interface ListCampaignsInput {
  limit?: number;
  offset?: number;
  status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
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
  instruction?: string;
  chatHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  selectedDonorIds?: number[];
  previewDonorIds?: number[];
  refinedInstruction?: string;
  templateId?: number;
}

/**
 * Service for handling email campaign operations
 */
export class EmailCampaignsService {
  /**
   * Creates a new email generation session and triggers bulk generation
   * @param input - Session creation parameters
   * @param organizationId - The organization ID
   * @param userId - The user ID
   * @returns The created session
   */
  async createSession(input: CreateSessionInput, organizationId: string, userId: string) {
    try {
      // Create session record
      const [session] = await db
        .insert(emailGenerationSessions)
        .values({
          organizationId,
          userId,
          templateId: input.templateId,
          jobName: input.campaignName,
          instruction: input.instruction,
          refinedInstruction: input.refinedInstruction,
          chatHistory: input.chatHistory,
          selectedDonorIds: input.selectedDonorIds,
          previewDonorIds: input.previewDonorIds,
          totalDonors: input.selectedDonorIds.length,
          status: "PENDING",
        })
        .returning();

      // Trigger the background job
      await generateBulkEmailsTask.trigger({
        sessionId: session.id,
        organizationId,
        userId,
        instruction: input.instruction,
        refinedInstruction: input.refinedInstruction,
        selectedDonorIds: input.selectedDonorIds,
        previewDonorIds: input.previewDonorIds,
        chatHistory: input.chatHistory,
        templateId: input.templateId,
      });

      logger.info(`Created email generation session ${session.id} for user ${userId}`);
      return { sessionId: session.id };
    } catch (error) {
      logger.error(
        `Failed to create email generation session: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create email generation session",
      });
    }
  }

  /**
   * Gets an email generation session with generated emails
   * @param sessionId - The session ID
   * @param organizationId - The organization ID for authorization
   * @returns The session with emails
   */
  async getSession(sessionId: number, organizationId: string) {
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

      return {
        session,
        emails,
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

    // Get email counts for each campaign separately
    const campaignsWithCounts = await Promise.all(
      campaigns.map(async (campaign) => {
        const [sentEmailsResult, totalEmailsResult] = await Promise.all([
          db
            .select({ count: count() })
            .from(generatedEmails)
            .where(and(eq(generatedEmails.sessionId, campaign.id), eq(generatedEmails.isSent, true))),
          db.select({ count: count() }).from(generatedEmails).where(eq(generatedEmails.sessionId, campaign.id)),
        ]);

        return {
          ...campaign,
          sentEmails: sentEmailsResult[0]?.count ?? 0,
          totalEmails: totalEmailsResult[0]?.count ?? 0,
        };
      })
    );

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

      // Update the email
      const [updatedEmail] = await db
        .update(generatedEmails)
        .set({
          subject: input.subject,
          structuredContent: input.structuredContent,
          referenceContexts: input.referenceContexts,
          updatedAt: new Date(),
        })
        .where(eq(generatedEmails.id, input.emailId))
        .returning();

      logger.info(`Updated email ${input.emailId} for organization ${organizationId}: subject="${input.subject}"`);

      return {
        success: true,
        email: updatedEmail,
        message: "Email updated successfully",
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

      if (existingCampaign.status === "IN_PROGRESS" || existingCampaign.status === "PENDING") {
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
      if (input.instruction) {
        updateData.instruction = input.instruction;
      }
      if (input.refinedInstruction !== undefined) {
        updateData.refinedInstruction = input.refinedInstruction;
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
}
