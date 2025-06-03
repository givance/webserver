import {
  addDonorToThread,
  addMessageToThread,
  addStaffToThread,
  createCommunicationThread,
  getCommunicationThreadById,
  getDonorCommunicationHistory,
  getMessagesInThread,
  listCommunicationThreads,
  removeDonorFromThread,
  removeStaffFromThread,
} from "@/app/lib/data/communications";
import { DonationWithDetails, listDonations } from "@/app/lib/data/donations";
import { getDonorById } from "@/app/lib/data/donors";
import { getOrganizationMemories } from "@/app/lib/data/organizations";
import { getStaffById } from "@/app/lib/data/staff";
import { getDismissedMemories, getUserMemories } from "@/app/lib/data/users";
import { db } from "@/app/lib/db";
import { organizations, emailGenerationSessions, generatedEmails, donors } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { RawCommunicationThread } from "@/app/lib/utils/email-generator/types";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { CommunicationsService } from "@/app/lib/services/communications.service";
import { generateBulkEmailsTask } from "@/trigger/jobs/generateBulkEmails";

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
});

const createSessionSchema = z.object({
  jobName: z.string().min(1).max(255),
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

const listJobsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]).optional(),
});

const deleteJobSchema = z.object({
  jobId: z.number(),
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
    const { instruction, donors, organizationWritingInstructions, previousInstruction } = input;

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

    // Convert organization to the email generator format
    const emailGeneratorOrg = {
      ...organization,
      rawWebsiteSummary: organization.websiteSummary,
    };

    // Fetch all donor histories concurrently for better performance
    const historiesPromises = donors.map(async (donor) => {
      const [communicationHistory, donationHistory] = await Promise.all([
        getDonorCommunicationHistory(donor.id, { organizationId }),
        listDonations({ donorId: donor.id }),
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

    // Get organization and user memories
    const [organizationMemories, userMemories, dismissedMemories] = await Promise.all([
      getOrganizationMemories(organizationId),
      getUserMemories(userId), // Get user memories for the current user
      getDismissedMemories(userId), // Get dismissed memories for the current user
    ]);

    logger.info(
      `Generating emails for ${donors.length} donors in organization ${organizationId} with instruction: "${processedInstruction}"`
    );

    // Convert donor histories to the required format
    const communicationHistories: Record<number, RawCommunicationThread[]> = {};
    const donationHistoriesMap: Record<number, DonationWithDetails[]> = {};

    donorHistories.forEach(({ donor, communicationHistory, donationHistory }) => {
      communicationHistories[donor.id] = communicationHistory;
      donationHistoriesMap[donor.id] = donationHistory;
    });

    // Generate emails using the email generator
    const result = await generateSmartDonorEmails(
      donors,
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
      dismissedMemories
    );

    logger.info(`Successfully generated ${result.emails.length} emails for organization ${organizationId}`);
    return result;
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
          jobName: input.jobName,
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
    try {
      const [session] = await db
        .select({
          id: emailGenerationSessions.id,
          organizationId: emailGenerationSessions.organizationId,
          status: emailGenerationSessions.status,
          totalDonors: emailGenerationSessions.totalDonors,
          completedDonors: emailGenerationSessions.completedDonors,
          errorMessage: emailGenerationSessions.errorMessage,
          createdAt: emailGenerationSessions.createdAt,
          updatedAt: emailGenerationSessions.updatedAt,
          completedAt: emailGenerationSessions.completedAt,
        })
        .from(emailGenerationSessions)
        .where(eq(emailGenerationSessions.id, input.sessionId))
        .limit(1);

      if (!session || session.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      return session;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to get session status: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get session status",
      });
    }
  }),

  /**
   * Lists communication jobs (email generation sessions) for the organization
   */
  listJobs: protectedProcedure.input(listJobsSchema).query(async ({ ctx, input }) => {
    try {
      const { limit = 20, offset = 0, status } = input;

      const whereConditions = [eq(emailGenerationSessions.organizationId, ctx.auth.user.organizationId)];

      if (status) {
        whereConditions.push(eq(emailGenerationSessions.status, status));
      }

      // Get jobs with sent email counts
      const jobs = await db
        .select({
          id: emailGenerationSessions.id,
          jobName: emailGenerationSessions.jobName,
          status: emailGenerationSessions.status,
          totalDonors: emailGenerationSessions.totalDonors,
          completedDonors: emailGenerationSessions.completedDonors,
          errorMessage: emailGenerationSessions.errorMessage,
          createdAt: emailGenerationSessions.createdAt,
          updatedAt: emailGenerationSessions.updatedAt,
          completedAt: emailGenerationSessions.completedAt,
          sentEmails: sql<number>`COALESCE(COUNT(CASE WHEN ${generatedEmails.isSent} = true THEN 1 END), 0)`,
          totalEmails: sql<number>`COALESCE(COUNT(${generatedEmails.id}), 0)`,
        })
        .from(emailGenerationSessions)
        .leftJoin(generatedEmails, eq(generatedEmails.sessionId, emailGenerationSessions.id))
        .where(whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0])
        .groupBy(emailGenerationSessions.id)
        .orderBy(desc(emailGenerationSessions.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count for pagination
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(emailGenerationSessions)
        .where(whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0]);

      logger.info(`Listed ${jobs.length} communication jobs for organization ${ctx.auth.user.organizationId}`);

      return {
        jobs,
        totalCount: count,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to list communication jobs: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list communication jobs",
      });
    }
  }),

  /**
   * Deletes a communication job and its associated emails
   */
  deleteJob: protectedProcedure.input(deleteJobSchema).mutation(async ({ ctx, input }) => {
    try {
      // First verify the job exists and belongs to the user's organization
      const [existingJob] = await db
        .select({ id: emailGenerationSessions.id, organizationId: emailGenerationSessions.organizationId })
        .from(emailGenerationSessions)
        .where(eq(emailGenerationSessions.id, input.jobId))
        .limit(1);

      if (!existingJob) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Communication job not found",
        });
      }

      if (existingJob.organizationId !== ctx.auth.user.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this job",
        });
      }

      // Delete session record (cascade delete will handle associated emails)
      await db.delete(emailGenerationSessions).where(eq(emailGenerationSessions.id, input.jobId));

      logger.info(`Deleted communication job ${input.jobId} for organization ${ctx.auth.user.organizationId}`);
      return { jobId: input.jobId };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(`Failed to delete communication job: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete communication job",
      });
    }
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
