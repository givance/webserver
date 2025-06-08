import { getCommunicationThreadById, getDonorCommunicationHistory } from "@/app/lib/data/communications";
import { DonationWithDetails, listDonations } from "@/app/lib/data/donations";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getDismissedMemories, getUserMemories, getUserById } from "@/app/lib/data/users";
import { db } from "@/app/lib/db";
import {
  emailGenerationSessions,
  generatedEmails,
  organizations,
  donors as donorsSchema,
  staff,
} from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { CommunicationsService } from "@/app/lib/services/communications.service";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";
import { RawCommunicationThread } from "@/app/lib/utils/email-generator/types";
import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, count } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

// Helper function to authorize thread access
async function authorizeThreadAccess(
  threadId: number,
  organizationId: string,
  includeDetails: {
    includeStaff?: boolean;
    includeDonors?: boolean;
    includeMessages?: boolean | { limit: number };
  } = {}
) {
  const thread = await getCommunicationThreadById(threadId, {
    includeStaff: true, // Always include staff for auth check
    includeDonors: true, // Always include donors for auth check
    ...includeDetails,
  });

  if (!thread) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Communication thread not found",
    });
  }

  const belongsToOrg =
    (thread.staff?.some((s) => s.staff?.organizationId === organizationId) ?? false) ||
    (thread.donors?.some((d) => d.donor?.organizationId === organizationId) ?? false);

  if (!belongsToOrg) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Communication thread does not belong to your organization",
    });
  }
  return thread; // Return the fetched thread
}

// Input validation schemas
const threadIdSchema = z.object({
  id: z.number(),
});

const createThreadSchema = z.object({
  channel: z.enum(["email", "phone", "text"]),
  staffIds: z.array(z.number()).optional(),
  donorIds: z.array(z.number()).optional(),
});

const threadDetailsSchema = z.object({
  includeStaff: z.boolean().optional(),
  includeDonors: z.boolean().optional(),
  includeMessages: z.union([z.boolean(), z.object({ limit: z.number() })]).optional(),
});

const listThreadsSchema = z.object({
  channel: z.enum(["email", "phone", "text"]).optional(),
  staffId: z.number().optional(),
  donorId: z.number().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  includeStaff: z.boolean().optional(),
  includeDonors: z.boolean().optional(),
  includeLatestMessage: z.boolean().optional(),
});

const addMessageSchema = z.object({
  threadId: z.number(),
  content: z.string(),
  fromStaffId: z.number().optional(),
  fromDonorId: z.number().optional(),
  toStaffId: z.number().optional(),
  toDonorId: z.number().optional(),
});

const getMessagesSchema = z.object({
  threadId: z.number(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  includeSendersRecipients: z.boolean().optional(),
});

const participantSchema = z.object({
  threadId: z.number(),
  participantId: z.number(),
});

const generateEmailsSchema = z.object({
  instruction: z.string(),
  donors: z.array(
    z.object({
      id: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
    })
  ),
  organizationName: z.string(),
  organizationWritingInstructions: z.string().optional(),
  previousInstruction: z.string().optional(),
  currentDate: z.string().optional(),
});

const createSessionSchema = z.object({
  campaignName: z.string().min(1).max(255),
  instruction: z.string().min(1),
  chatHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  selectedDonorIds: z.array(z.number()),
  previewDonorIds: z.array(z.number()),
  refinedInstruction: z.string().optional(),
  templateId: z.number().optional(),
});

const getSessionSchema = z.object({
  sessionId: z.number(),
});

const getSessionStatusSchema = z.object({
  sessionId: z.number(),
});

const listCampaignsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]).optional(),
});

const deleteCampaignSchema = z.object({
  campaignId: z.number(),
});

const sendIndividualEmailSchema = z.object({
  emailId: z.number(),
});

const sendBulkEmailsSchema = z.object({
  sessionId: z.number(),
  sendType: z.enum(["all", "unsent"]),
});

const getEmailStatusSchema = z.object({
  emailId: z.number(),
});

const updateEmailSchema = z.object({
  emailId: z.number(),
  subject: z.string().min(1).max(200),
  structuredContent: z.array(
    z.object({
      piece: z.string(),
      references: z.array(z.string()),
      addNewlineAfter: z.boolean(),
    })
  ),
  referenceContexts: z.record(z.string(), z.string()),
});

// Define input types
interface DonorInput {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface GenerateEmailsInput {
  instruction: string;
  donors: DonorInput[];
  organizationName: string;
  organizationWritingInstructions?: string;
  previousInstruction?: string;
  currentDate?: string;
}

/**
 * Service for handling email generation business logic
 */
class EmailGenerationService {
  /**
   * Generates smart donor emails based on instruction and donor data
   * @param input - Email generation parameters
   * @param organizationId - The organization ID
   * @param userId - The user ID for fetching user memories
   * @returns Generated emails for each donor
   */
  async generateSmartEmails(input: GenerateEmailsInput, organizationId: string, userId: string) {
    const { instruction, donors, organizationWritingInstructions, previousInstruction, currentDate } = input;

    // Process project mentions in the instruction
    const processedInstruction = await processProjectMentions(instruction, organizationId);

    if (processedInstruction !== instruction) {
      logger.info(
        `Processed project mentions in instruction for organization ${organizationId} (original: "${instruction}", processed: "${processedInstruction}")`
      );
    }

    // Get organization data
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    if (!organization) {
      logger.error(`Organization ${organizationId} not found for email generation`);
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    // Fetch full donor data from database to include notes and assigned staff
    const donorIds = donors.map((d) => d.id);
    const fullDonorData = await db.query.donors.findMany({
      where: and(inArray(donorsSchema.id, donorIds), eq(donorsSchema.organizationId, organizationId)),
      with: {
        assignedStaff: true, // Include staff assignment and signature
      },
    });

    if (fullDonorData.length !== donorIds.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Some donors not found or don't belong to this organization",
      });
    }

    // Convert to DonorInfo format including notes
    const donorInfos = fullDonorData.map((donor) => ({
      id: donor.id,
      email: donor.email,
      notes: donor.notes, // Include user notes
      // Include all the new name fields
      displayName: donor.displayName,
      hisTitle: donor.hisTitle,
      hisFirstName: donor.hisFirstName,
      hisInitial: donor.hisInitial,
      hisLastName: donor.hisLastName,
      herTitle: donor.herTitle,
      herFirstName: donor.herFirstName,
      herInitial: donor.herInitial,
      herLastName: donor.herLastName,
      isCouple: donor.isCouple,
      // Keep deprecated fields for fallback
      firstName: donor.firstName,
      lastName: donor.lastName,
    }));

    // Convert organization to the email generator format
    const emailGeneratorOrg = {
      ...organization,
      rawWebsiteSummary: organization.websiteSummary,
    };

    // Fetch all donor histories concurrently for better performance
    const historiesPromises = donorInfos.map(async (donor) => {
      const [communicationHistory, donationHistory] = await Promise.all([
        getDonorCommunicationHistory(donor.id, { organizationId }),
        listDonations({
          donorId: donor.id,
          limit: 50,
          orderBy: "date",
          orderDirection: "desc",
          includeProject: true,
        }),
      ]);

      return {
        donor,
        communicationHistory: communicationHistory.map((thread) => ({
          content: thread.content?.map((message) => ({ content: message.content })) || [],
        })) as RawCommunicationThread[],
        donationHistory: donationHistory.donations,
      };
    });

    const donorHistories = await Promise.all(historiesPromises);

    // Get organization and user memories, and user data including signature
    const [organizationMemories, userMemories, dismissedMemories, user] = await Promise.all([
      getOrganizationMemories(organizationId),
      getUserMemories(userId), // Get user memories for the current user
      getDismissedMemories(userId), // Get dismissed memories for the current user
      getUserById(userId), // Get user data including email signature
    ]);

    logger.info(
      `Generating emails for ${donorInfos.length} donors in organization ${organizationId} with instruction: "${processedInstruction}"`
    );

    // Convert donor histories to the required format
    const communicationHistories: Record<number, RawCommunicationThread[]> = {};
    const donationHistoriesMap: Record<number, DonationWithDetails[]> = {};

    donorHistories.forEach(({ donor, communicationHistory, donationHistory }) => {
      communicationHistories[donor.id] = communicationHistory;
      donationHistoriesMap[donor.id] = donationHistory;
    });

    // Generate emails using the email generator (without signatures - they'll be added below)
    const result = await generateSmartDonorEmails(
      donorInfos, // Use full donor data instead of simplified input
      processedInstruction,
      input.organizationName,
      emailGeneratorOrg,
      organizationWritingInstructions,
      previousInstruction,
      undefined, // userFeedback
      communicationHistories,
      donationHistoriesMap,
      userMemories,
      organizationMemories,
      dismissedMemories,
      currentDate,
      undefined // Don't pass user signature - we'll handle staff signatures below
    );

    // Get primary staff for fallback
    const primaryStaff = await db.query.staff.findFirst({
      where: and(eq(staff.organizationId, organizationId), eq(staff.isPrimary, true)),
    });

    // Add staff signatures to each generated email
    const emailsWithSignatures = result.emails.map((email) => {
      // Find the donor to get their assigned staff info
      const donor = fullDonorData.find((d) => d.id === email.donorId);
      const assignedStaff = donor?.assignedStaff;

      // Create the appropriate signature
      let signature: string;
      if (assignedStaff?.signature) {
        signature = assignedStaff.signature;
      } else if (assignedStaff) {
        // Default signature format: "Best, firstname"
        signature = `Best,\n${assignedStaff.firstName}`;
      } else if (primaryStaff?.signature) {
        // Use primary staff signature if available
        signature = primaryStaff.signature;
      } else if (primaryStaff) {
        // Default signature format for primary staff: "Best, firstname"
        signature = `Best,\n${primaryStaff.firstName}`;
      } else {
        // Fallback to user signature if no staff assigned and no primary staff
        signature = user?.emailSignature || `Best,\n${user?.firstName || "Team"}`;
      }

      // Append signature to the structured content
      const enhancedStructuredContent = [
        ...email.structuredContent,
        {
          piece: "\n\n" + signature,
          references: [],
          addNewlineAfter: false,
        },
      ];

      return {
        ...email,
        structuredContent: enhancedStructuredContent,
      };
    });

    logger.info(`Successfully generated ${emailsWithSignatures.length} emails for organization ${organizationId}`);
    return {
      ...result,
      emails: emailsWithSignatures,
    };
  }
}

/**
 * Communications router for managing communication threads and email generation
 * Uses CommunicationsService for thread operations and EmailGenerationService for email generation
 */
export const communicationsRouter = router({
  /**
   * Creates a new communication thread with participants
   */
  createThread: protectedProcedure.input(createThreadSchema).mutation(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.createThreadWithParticipants(
      input.channel,
      input.staffIds,
      input.donorIds,
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Retrieves a communication thread with optional details
   */
  getThread: protectedProcedure
    .input(z.object({ ...threadIdSchema.shape, ...threadDetailsSchema.shape }))
    .query(async ({ input, ctx }) => {
      const communicationsService = new CommunicationsService();
      return await communicationsService.authorizeThreadAccess(input.id, ctx.auth.user.organizationId, {
        includeStaff: input.includeStaff,
        includeDonors: input.includeDonors,
        includeMessages: input.includeMessages,
      });
    }),

  /**
   * Lists communication threads with filtering and pagination
   */
  listThreads: protectedProcedure.input(listThreadsSchema).query(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.listAuthorizedThreads(input, ctx.auth.user.organizationId);
  }),

  /**
   * Adds a message to a communication thread
   */
  addMessage: protectedProcedure.input(addMessageSchema).mutation(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.addAuthorizedMessage(
      input.threadId,
      input.content,
      input.fromStaffId,
      input.fromDonorId,
      input.toStaffId,
      input.toDonorId,
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Retrieves messages from a communication thread
   */
  getMessages: protectedProcedure.input(getMessagesSchema).query(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.getAuthorizedMessages(
      input.threadId,
      input.limit,
      input.offset,
      input.includeSendersRecipients,
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Adds a staff member to a communication thread
   */
  addStaffToThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.addAuthorizedParticipant(
      input.threadId,
      input.participantId,
      "staff",
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Removes a staff member from a communication thread
   */
  removeStaffFromThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.removeAuthorizedParticipant(
      input.threadId,
      input.participantId,
      "staff",
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Adds a donor to a communication thread
   */
  addDonorToThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.addAuthorizedParticipant(
      input.threadId,
      input.participantId,
      "donor",
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Removes a donor from a communication thread
   */
  removeDonorFromThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    const communicationsService = new CommunicationsService();
    return await communicationsService.removeAuthorizedParticipant(
      input.threadId,
      input.participantId,
      "donor",
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Generates smart donor emails based on instruction and donor data
   */
  generateEmails: protectedProcedure
    .input(generateEmailsSchema)
    .mutation(async ({ ctx, input }: { ctx: any; input: GenerateEmailsInput }) => {
      const emailService = new EmailGenerationService();
      return await emailService.generateSmartEmails(input, ctx.auth.user.organizationId, ctx.auth.user.id);
    }),

  /**
   * Creates a new email generation session and triggers bulk generation
   */
  createSession: protectedProcedure.input(createSessionSchema).mutation(async ({ ctx, input }) => {
    try {
      // Create session record
      const [session] = await db
        .insert(emailGenerationSessions)
        .values({
          organizationId: ctx.auth.user.organizationId,
          userId: ctx.auth.user.id,
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
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
        instruction: input.instruction,
        refinedInstruction: input.refinedInstruction,
        selectedDonorIds: input.selectedDonorIds,
        previewDonorIds: input.previewDonorIds,
        chatHistory: input.chatHistory,
        templateId: input.templateId,
      });

      logger.info(`Created email generation session ${session.id} for user ${ctx.auth.user.id}`);
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
  }),

  /**
   * Gets an email generation session with generated emails
   */
  getSession: protectedProcedure.input(getSessionSchema).query(async ({ ctx, input }) => {
    try {
      const [session] = await db
        .select()
        .from(emailGenerationSessions)
        .where(eq(emailGenerationSessions.id, input.sessionId))
        .limit(1);

      if (!session || session.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Get generated emails for this session
      const emails = await db.select().from(generatedEmails).where(eq(generatedEmails.sessionId, input.sessionId));

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
  }),

  /**
   * Gets the status of an email generation session
   */
  getSessionStatus: protectedProcedure.input(getSessionStatusSchema).query(async ({ ctx, input }) => {
    const { sessionId } = input;
    const orgId = ctx.auth.user.organizationId;

    const session = await db.query.emailGenerationSessions.findFirst({
      where: and(eq(emailGenerationSessions.id, sessionId), eq(emailGenerationSessions.organizationId, orgId)),
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
  }),

  listCampaigns: protectedProcedure.input(listCampaignsSchema).query(async ({ ctx, input }) => {
    const { limit = 10, offset = 0, status } = input;
    const orgId = ctx.auth.user.organizationId;

    const whereClauses = [eq(emailGenerationSessions.organizationId, orgId)];
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
  }),

  deleteCampaign: protectedProcedure.input(deleteCampaignSchema).mutation(async ({ ctx, input }) => {
    const { campaignId } = input;
    const orgId = ctx.auth.user.organizationId;

    // First, verify the job belongs to the organization
    const campaign = await db.query.emailGenerationSessions.findFirst({
      where: and(eq(emailGenerationSessions.id, campaignId), eq(emailGenerationSessions.organizationId, orgId)),
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

    logger.info(`Campaign ${campaignId} and associated emails deleted for organization ${orgId}`);
    return { campaignId };
  }),

  /**
   * Get email sending status
   */
  getEmailStatus: protectedProcedure.input(getEmailStatusSchema).query(async ({ ctx, input }) => {
    try {
      logger.info(
        `Getting email status for emailId: ${input.emailId}, organizationId: ${ctx.auth.user.organizationId}`
      );

      // Validate emailId
      if (!input.emailId || input.emailId <= 0) {
        logger.warn(`Invalid emailId provided: ${input.emailId}`);
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
        .where(
          and(
            eq(generatedEmails.id, input.emailId),
            eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId)
          )
        )
        .limit(1);

      if (!email) {
        logger.warn(`Email not found for emailId: ${input.emailId}, organizationId: ${ctx.auth.user.organizationId}`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Email not found",
        });
      }

      logger.info(`Successfully retrieved email status for emailId: ${input.emailId}, isSent: ${email.isSent}`);
      return email;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        `Failed to get email status for emailId: ${input.emailId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get email status",
      });
    }
  }),

  /**
   * Update email content and subject
   */
  updateEmail: protectedProcedure.input(updateEmailSchema).mutation(async ({ ctx, input }) => {
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
        .where(
          and(
            eq(generatedEmails.id, input.emailId),
            eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId)
          )
        )
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

      logger.info(
        `Updated email ${input.emailId} for organization ${ctx.auth.user.organizationId}: subject="${input.subject}"`
      );

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
  }),
});
