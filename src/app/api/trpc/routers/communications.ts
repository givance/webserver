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
import { organizations } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { generateSmartDonorEmails } from "@/app/lib/utils/email-generator";
import { RawCommunicationThread } from "@/app/lib/utils/email-generator/types";
import { processProjectMentions } from "@/app/lib/utils/email-generator/mention-processor";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { CommunicationsService } from "@/app/lib/services/communications.service";

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
   * @returns Generated emails for each donor
   */
  async generateSmartEmails(input: GenerateEmailsInput, organizationId: string) {
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
      getUserMemories(organizationId), // Assuming this gets user memories for the org
      getDismissedMemories(organizationId), // Assuming this gets dismissed memories for the org
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
      return await emailService.generateSmartEmails(input, ctx.auth.user.organizationId);
    }),
});
