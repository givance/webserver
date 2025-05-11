import { z } from "zod";
import { router, orgProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  createCommunicationThread,
  getCommunicationThreadById,
  listCommunicationThreads,
  addMessageToThread,
  getMessagesInThread,
  addStaffToThread,
  removeStaffFromThread,
  addDonorToThread,
  removeDonorFromThread,
  type CommunicationChannel,
  type CommunicationThreadWithDetails,
  type MessageWithSenderRecipient,
} from "@/app/lib/data/communications";
import { getDonorById } from "@/app/lib/data/donors";
import { getStaffById } from "@/app/lib/data/staff";

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

export const communicationsRouter = router({
  createThread: orgProcedure.input(createThreadSchema).mutation(async ({ input, ctx }) => {
    // Verify all staff members belong to organization
    if (input.staffIds) {
      for (const staffId of input.staffIds) {
        const staff = await getStaffById(staffId, ctx.orgId!);
        if (!staff) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Staff member ${staffId} not found in your organization`,
          });
        }
      }
    }

    // Verify all donors belong to organization
    if (input.donorIds) {
      for (const donorId of input.donorIds) {
        const donor = await getDonorById(donorId, ctx.orgId!);
        if (!donor) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Donor ${donorId} not found in your organization`,
          });
        }
      }
    }

    try {
      return await createCommunicationThread({ channel: input.channel }, input.staffIds, input.donorIds);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not create communication thread",
      });
    }
  }),

  getThread: orgProcedure
    .input(z.object({ ...threadIdSchema.shape, ...threadDetailsSchema.shape }))
    .query(async ({ input, ctx }) => {
      const thread = await getCommunicationThreadById(input.id, {
        includeStaff: input.includeStaff,
        includeDonors: input.includeDonors,
        includeMessages: input.includeMessages,
      });

      if (!thread) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Communication thread not found",
        });
      }

      // Verify thread belongs to organization through staff or donors
      const belongsToOrg =
        (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
        (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false);

      if (!belongsToOrg) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Communication thread does not belong to your organization",
        });
      }

      return thread;
    }),

  listThreads: orgProcedure.input(listThreadsSchema).query(async ({ input, ctx }) => {
    const threads = await listCommunicationThreads(input);

    // Filter threads to only include those belonging to the organization
    return threads.filter(
      (thread) =>
        (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
        (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false)
    );
  }),

  addMessage: orgProcedure.input(addMessageSchema).mutation(async ({ input, ctx }) => {
    // First verify the thread belongs to the organization
    const thread = await getCommunicationThreadById(input.threadId, {
      includeStaff: true,
      includeDonors: true,
    });

    if (!thread) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Communication thread not found",
      });
    }

    const belongsToOrg =
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    // Verify sender and recipient belong to organization
    if (input.fromStaffId) {
      const staff = await getStaffById(input.fromStaffId, ctx.orgId!);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sender staff member not found in your organization",
        });
      }
    }

    if (input.fromDonorId) {
      const donor = await getDonorById(input.fromDonorId, ctx.orgId!);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sender donor not found in your organization",
        });
      }
    }

    if (input.toStaffId) {
      const staff = await getStaffById(input.toStaffId, ctx.orgId!);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recipient staff member not found in your organization",
        });
      }
    }

    if (input.toDonorId) {
      const donor = await getDonorById(input.toDonorId, ctx.orgId!);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recipient donor not found in your organization",
        });
      }
    }

    try {
      return await addMessageToThread({
        ...input,
        datetime: new Date(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("exactly one sender")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not add message to thread",
      });
    }
  }),

  getMessages: orgProcedure.input(getMessagesSchema).query(async ({ input, ctx }) => {
    // First verify the thread belongs to the organization
    const thread = await getCommunicationThreadById(input.threadId, {
      includeStaff: true,
      includeDonors: true,
    });

    if (!thread) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Communication thread not found",
      });
    }

    const belongsToOrg =
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    return await getMessagesInThread(input.threadId, input);
  }),

  addStaffToThread: orgProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify staff member belongs to organization
    const staff = await getStaffById(input.participantId, ctx.orgId!);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found in your organization",
      });
    }

    // Verify thread belongs to organization
    const thread = await getCommunicationThreadById(input.threadId, {
      includeStaff: true,
      includeDonors: true,
    });

    if (!thread) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Communication thread not found",
      });
    }

    const belongsToOrg =
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await addStaffToThread(input.threadId, input.participantId);
  }),

  removeStaffFromThread: orgProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify staff member belongs to organization
    const staff = await getStaffById(input.participantId, ctx.orgId!);
    if (!staff) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Staff member not found in your organization",
      });
    }

    // Verify thread belongs to organization
    const thread = await getCommunicationThreadById(input.threadId, {
      includeStaff: true,
      includeDonors: true,
    });

    if (!thread) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Communication thread not found",
      });
    }

    const belongsToOrg =
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await removeStaffFromThread(input.threadId, input.participantId);
  }),

  addDonorToThread: orgProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify donor belongs to organization
    const donor = await getDonorById(input.participantId, ctx.orgId!);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found in your organization",
      });
    }

    // Verify thread belongs to organization
    const thread = await getCommunicationThreadById(input.threadId, {
      includeStaff: true,
      includeDonors: true,
    });

    if (!thread) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Communication thread not found",
      });
    }

    const belongsToOrg =
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await addDonorToThread(input.threadId, input.participantId);
  }),

  removeDonorFromThread: orgProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify donor belongs to organization
    const donor = await getDonorById(input.participantId, ctx.orgId!);
    if (!donor) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Donor not found in your organization",
      });
    }

    // Verify thread belongs to organization
    const thread = await getCommunicationThreadById(input.threadId, {
      includeStaff: true,
      includeDonors: true,
    });

    if (!thread) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Communication thread not found",
      });
    }

    const belongsToOrg =
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.orgId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.orgId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await removeDonorFromThread(input.threadId, input.participantId);
  }),
});
