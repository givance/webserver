import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { CommunicationsService } from "@/app/lib/services/communications.service";

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
  staffId: z.number().nullable().optional(),
  donorId: z.number().nullable().optional(),
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

/**
 * Router for communication thread management
 * Handles creation, retrieval, and management of communication threads
 */
export const communicationThreadsRouter = router({
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
});
