import { TRPCError } from "@trpc/server";
import { and, desc, eq, count, sql } from "drizzle-orm";
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
  status?: "DRAFT" | "PENDING" | "GENERATING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
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

export interface RegenerateAllEmailsInput {
  sessionId: number;
  instruction: string; // Empty string means use existing instruction
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  refinedInstruction?: string;
}

export interface SaveDraftInput {
  sessionId?: number;
  campaignName: string;
  selectedDonorIds: number[];
  templateId?: number;
  instruction?: string;
  chatHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  refinedInstruction?: string;
  previewDonorIds?: number[];
}

export interface SaveGeneratedEmailInput {
  sessionId: number;
  donorId: number;
  subject: string;
  structuredContent: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts: Record<string, string>;
  isPreview?: boolean;
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
      // First check if there's an existing draft with the same name
      const existingDraft = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.organizationId, organizationId),
            eq(emailGenerationSessions.jobName, input.campaignName),
            eq(emailGenerationSessions.status, "DRAFT")
          )
        )
        .limit(1);

      let sessionId: number;

      if (existingDraft[0]) {
        // Update existing draft to PENDING and use it
        const [updatedSession] = await db
          .update(emailGenerationSessions)
          .set({
            status: "PENDING",
            instruction: input.instruction,
            refinedInstruction: input.refinedInstruction,
            chatHistory: input.chatHistory,
            selectedDonorIds: input.selectedDonorIds,
            previewDonorIds: input.previewDonorIds,
            totalDonors: input.selectedDonorIds.length,
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, existingDraft[0].id))
          .returning();

        sessionId = updatedSession.id;

        // Update any PENDING_APPROVAL emails to APPROVED
        await db
          .update(generatedEmails)
          .set({
            status: "APPROVED",
            isPreview: false,
            updatedAt: new Date(),
          })
          .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.status, "PENDING_APPROVAL")));

        logger.info(`Updated existing draft session ${sessionId} to PENDING for user ${userId}`);
      } else {
        // Create new session
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

        sessionId = session.id;
        logger.info(`Created new email generation session ${sessionId} for user ${userId}`);
      }

      // Get the list of donors that already have approved emails
      const existingEmails = await db
        .select({ donorId: generatedEmails.donorId })
        .from(generatedEmails)
        .where(and(eq(generatedEmails.sessionId, sessionId), eq(generatedEmails.status, "APPROVED")));

      const alreadyGeneratedDonorIds = existingEmails.map((e) => e.donorId);
      const donorsToGenerate = input.selectedDonorIds.filter((id) => !alreadyGeneratedDonorIds.includes(id));

      // Only trigger background job if there are donors without emails
      if (donorsToGenerate.length > 0) {
        await generateBulkEmailsTask.trigger({
          sessionId,
          organizationId,
          userId,
          instruction: input.instruction,
          refinedInstruction: input.refinedInstruction,
          selectedDonorIds: donorsToGenerate,
          previewDonorIds: input.previewDonorIds,
          chatHistory: input.chatHistory,
          templateId: input.templateId,
        });

        logger.info(
          `Triggered email generation for ${donorsToGenerate.length} donors (${alreadyGeneratedDonorIds.length} already have emails)`
        );
      } else {
        logger.info(`All donors already have emails, marking session as completed`);

        // If all donors already have emails, mark session as completed
        await db
          .update(emailGenerationSessions)
          .set({
            status: "COMPLETED",
            completedDonors: input.selectedDonorIds.length,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, sessionId));
      }

      return { sessionId };
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

      if (existingCampaign.status === "GENERATING" || existingCampaign.status === "IN_PROGRESS") {
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

  /**
   * Regenerates all emails for a campaign with new instructions
   * This will delete all existing emails and trigger new generation
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

      if (
        existingSession.status === "GENERATING" ||
        existingSession.status === "IN_PROGRESS" ||
        existingSession.status === "PENDING"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot regenerate emails while campaign is still processing",
        });
      }

      // Delete all existing generated emails for this session
      const deleteResult = await db
        .delete(generatedEmails)
        .where(eq(generatedEmails.sessionId, input.sessionId))
        .returning({ id: generatedEmails.id });

      const deletedCount = deleteResult.length;
      logger.info(`Deleted ${deletedCount} existing emails for session ${input.sessionId}`);

      // If instruction is empty, use the existing instruction from the session
      const useExistingInstruction = !input.instruction || input.instruction.trim() === "";
      const finalInstruction = useExistingInstruction ? existingSession.instruction : input.instruction;
      const finalRefinedInstruction = useExistingInstruction
        ? existingSession.refinedInstruction || existingSession.instruction
        : input.refinedInstruction || input.instruction;
      const finalChatHistory = useExistingInstruction
        ? (existingSession.chatHistory as Array<{ role: "user" | "assistant"; content: string }>) || []
        : input.chatHistory;

      // Update the session with instruction and reset status
      await db
        .update(emailGenerationSessions)
        .set({
          instruction: finalInstruction,
          refinedInstruction: finalRefinedInstruction,
          chatHistory: finalChatHistory,
          status: "PENDING",
          completedDonors: 0,
          completedAt: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, input.sessionId));

      // Trigger the background job with regeneration flag
      await generateBulkEmailsTask.trigger({
        sessionId: existingSession.id,
        organizationId,
        userId,
        instruction: finalInstruction,
        refinedInstruction: finalRefinedInstruction,
        selectedDonorIds: existingSession.selectedDonorIds as number[],
        previewDonorIds: existingSession.previewDonorIds as number[],
        chatHistory: finalChatHistory,
        templateId: existingSession.templateId ?? undefined,
      });

      logger.info(
        `Started regeneration for session ${input.sessionId} with ${
          useExistingInstruction ? "existing" : "new"
        } instruction`
      );

      return {
        success: true,
        sessionId: existingSession.id,
        deletedEmailsCount: deletedCount,
        message: "Email regeneration started successfully",
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
          instruction: input.instruction || "",
          refinedInstruction: input.refinedInstruction,
          chatHistory: input.chatHistory || [],
          previewDonorIds: input.previewDonorIds || [],
          updatedAt: new Date(),
        };

        logger.info(`[saveDraft] Updating session with data:`, {
          ...updateData,
          chatHistoryLength: updateData.chatHistory.length,
          hasRefinedInstruction: !!updateData.refinedInstruction,
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
          instruction: input.instruction || "",
          refinedInstruction: input.refinedInstruction,
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
          hasRefinedInstruction: !!newSessionData.refinedInstruction,
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
   * Checks if all emails in a session have been sent and updates status to COMPLETED
   * @param sessionId - The session ID
   * @param organizationId - The organization ID
   */
  async checkAndUpdateCampaignCompletion(sessionId: number, organizationId: string) {
    try {
      // Get the session
      const session = await db.query.emailGenerationSessions.findFirst({
        where: and(
          eq(emailGenerationSessions.id, sessionId),
          eq(emailGenerationSessions.organizationId, organizationId)
        ),
      });

      if (!session || session.status !== "IN_PROGRESS") {
        return; // Only update if campaign is in IN_PROGRESS status
      }

      // Count total emails and sent emails
      const [emailStats] = await db
        .select({
          totalEmails: count(),
          sentEmails: sql<number>`COUNT(CASE WHEN ${generatedEmails.isSent} = true THEN 1 END)`,
        })
        .from(generatedEmails)
        .where(eq(generatedEmails.sessionId, sessionId));

      // If all emails have been sent, mark campaign as COMPLETED
      if (emailStats.totalEmails > 0 && emailStats.totalEmails === emailStats.sentEmails) {
        await db
          .update(emailGenerationSessions)
          .set({
            status: "COMPLETED",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, sessionId));

        logger.info(`Campaign ${sessionId} marked as COMPLETED - all ${emailStats.totalEmails} emails have been sent`);
      }
    } catch (error) {
      logger.error(`Failed to check campaign completion for session ${sessionId}: ${error}`);
    }
  }

  /**
   * Saves a generated email incrementally with PENDING_APPROVAL status
   * @param input - Generated email data
   * @param organizationId - The organization ID
   * @returns The saved email
   */
  async saveGeneratedEmail(input: SaveGeneratedEmailInput, organizationId: string) {
    try {
      // Verify session belongs to organization
      const session = await db
        .select()
        .from(emailGenerationSessions)
        .where(
          and(
            eq(emailGenerationSessions.id, input.sessionId),
            eq(emailGenerationSessions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!session[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Check if email already exists for this donor in this session
      const existingEmail = await db
        .select()
        .from(generatedEmails)
        .where(and(eq(generatedEmails.sessionId, input.sessionId), eq(generatedEmails.donorId, input.donorId)))
        .limit(1);

      if (existingEmail[0]) {
        // Update existing email
        const [updatedEmail] = await db
          .update(generatedEmails)
          .set({
            subject: input.subject,
            structuredContent: input.structuredContent,
            referenceContexts: input.referenceContexts,
            status: "PENDING_APPROVAL",
            isPreview: input.isPreview ?? true,
            updatedAt: new Date(),
          })
          .where(eq(generatedEmails.id, existingEmail[0].id))
          .returning();

        logger.info(`Updated generated email ${updatedEmail.id} for donor ${input.donorId}`);
        return { emailId: updatedEmail.id };
      } else {
        // Create new email
        const [newEmail] = await db
          .insert(generatedEmails)
          .values({
            sessionId: input.sessionId,
            donorId: input.donorId,
            subject: input.subject,
            structuredContent: input.structuredContent,
            referenceContexts: input.referenceContexts,
            status: "PENDING_APPROVAL",
            isPreview: input.isPreview ?? true,
            isSent: false,
          })
          .returning();

        logger.info(`Created new generated email ${newEmail.id} for donor ${input.donorId}`);
        return { emailId: newEmail.id };
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
}
