import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
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
  getDonorCommunicationHistory,
} from "@/app/lib/data/communications";
import { getDonorById } from "@/app/lib/data/donors";
import { getStaffById } from "@/app/lib/data/staff";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { env } from "@/app/lib/env";
import { getOrganizationById } from "@/app/lib/data/organizations";
import { logger } from "@/app/lib/logger";
import { generateDonorEmails } from "@/app/lib/utils/email-generator";
import { DonationWithDetails, getDonationById, listDonations } from "@/app/lib/data/donations";
import type { GeneratedEmail } from "@/app/lib/utils/email-generator";
import { db } from "@/app/lib/db";
import { organizations, donations, projects } from "@/app/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { DonationInfo, RawCommunicationThread } from "@/app/lib/utils/email-generator/types";

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
}

export const communicationsRouter = router({
  createThread: protectedProcedure.input(createThreadSchema).mutation(async ({ input, ctx }) => {
    // Verify all staff members belong to organization
    if (input.staffIds) {
      for (const staffId of input.staffIds) {
        const staff = await getStaffById(staffId, ctx.auth.user.organizationId);
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
        const donor = await getDonorById(donorId, ctx.auth.user.organizationId);
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
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not create communication thread",
      });
    }
  }),

  getThread: protectedProcedure
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
        (thread.staff?.some((s) => s.staff?.organizationId === ctx.auth.user.organizationId) ?? false) ||
        (thread.donors?.some((d) => d.donor?.organizationId === ctx.auth.user.organizationId) ?? false);

      if (!belongsToOrg) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Communication thread does not belong to your organization",
        });
      }

      return thread;
    }),

  listThreads: protectedProcedure.input(listThreadsSchema).query(async ({ input, ctx }) => {
    const threads = await listCommunicationThreads({
      ...input,
      organizationId: ctx.auth.user.organizationId,
    });

    // Filter threads to only include those matching the staff/donor filters
    const filteredThreads = threads.filter((thread) => {
      // Apply staff filter
      if (input.staffId && !thread.staff?.some((s) => s.staffId === input.staffId)) {
        return false;
      }

      // Apply donor filter
      if (input.donorId && !thread.donors?.some((d) => d.donorId === input.donorId)) {
        return false;
      }

      return true;
    });

    return {
      threads: filteredThreads,
      totalCount: filteredThreads.length,
    };
  }),

  addMessage: protectedProcedure.input(addMessageSchema).mutation(async ({ input, ctx }) => {
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
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.auth.user.organizationId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.auth.user.organizationId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    // Verify sender and recipient belong to organization
    if (input.fromStaffId) {
      const staff = await getStaffById(input.fromStaffId, ctx.auth.user.organizationId);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sender staff member not found in your organization",
        });
      }
    }

    if (input.fromDonorId) {
      const donor = await getDonorById(input.fromDonorId, ctx.auth.user.organizationId);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sender donor not found in your organization",
        });
      }
    }

    if (input.toStaffId) {
      const staff = await getStaffById(input.toStaffId, ctx.auth.user.organizationId);
      if (!staff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recipient staff member not found in your organization",
        });
      }
    }

    if (input.toDonorId) {
      const donor = await getDonorById(input.toDonorId, ctx.auth.user.organizationId);
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

  getMessages: protectedProcedure.input(getMessagesSchema).query(async ({ input, ctx }) => {
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
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.auth.user.organizationId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.auth.user.organizationId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    return await getMessagesInThread(input.threadId, {
      limit: input.limit,
      offset: input.offset,
      includeSendersRecipients: input.includeSendersRecipients,
    });
  }),

  addStaffToThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify staff member belongs to organization
    const staff = await getStaffById(input.participantId, ctx.auth.user.organizationId);
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
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.auth.user.organizationId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.auth.user.organizationId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await addStaffToThread(input.threadId, input.participantId);
  }),

  removeStaffFromThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify staff member belongs to organization
    const staff = await getStaffById(input.participantId, ctx.auth.user.organizationId);
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
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.auth.user.organizationId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.auth.user.organizationId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await removeStaffFromThread(input.threadId, input.participantId);
  }),

  addDonorToThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify donor belongs to organization
    const donor = await getDonorById(input.participantId, ctx.auth.user.organizationId);
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
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.auth.user.organizationId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.auth.user.organizationId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await addDonorToThread(input.threadId, input.participantId);
  }),

  removeDonorFromThread: protectedProcedure.input(participantSchema).mutation(async ({ input, ctx }) => {
    // Verify donor belongs to organization
    const donor = await getDonorById(input.participantId, ctx.auth.user.organizationId);
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
      (thread.staff?.some((s) => s.staff?.organizationId === ctx.auth.user.organizationId) ?? false) ||
      (thread.donors?.some((d) => d.donor?.organizationId === ctx.auth.user.organizationId) ?? false);

    if (!belongsToOrg) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Communication thread does not belong to your organization",
      });
    }

    await removeDonorFromThread(input.threadId, input.participantId);
  }),

  generateEmails: protectedProcedure
    .input(
      z.object({
        instruction: z.string(),
        donors: z.array(
          z.object({
            id: z.number(),
            firstName: z.string(),
            lastName: z.string(),
            email: z.string(),
            history: z.array(
              z.object({
                content: z.string(),
                datetime: z.string(),
              })
            ),
            donationHistory: z.array(
              z.object({
                id: z.string(),
                amount: z.number(),
                date: z.union([z.date(), z.string()]).transform((d) => (d instanceof Date ? d : new Date(d))),
                project: z
                  .object({
                    id: z.number(),
                    name: z.string(),
                    description: z.string().nullable(),
                    goal: z.number().nullable(),
                    status: z.string(),
                  })
                  .nullable(),
              })
            ),
          })
        ),
        organizationName: z.string(),
        organizationWritingInstructions: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }: { ctx: any; input: GenerateEmailsInput }) => {
      const { instruction, donors, organizationName, organizationWritingInstructions } = input;

      // Get organization data using Drizzle
      const [organization] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.name, organizationName))
        .limit(1);

      if (!organization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      // Convert organization to the new format
      const emailGeneratorOrg = {
        ...organization,
        rawWebsiteSummary: organization.websiteSummary,
      };

      // Fetch all histories concurrently for better performance
      const historiesPromises = donors.map(async (donor) => {
        const [communicationHistory, donationHistory] = await Promise.all([
          getDonorCommunicationHistory(donor.id, ctx.auth.user.organizationId),
          listDonations({ donorId: donor.id }),
        ]);

        return {
          donorId: donor.id,
          communicationHistory,
          donationHistory: donationHistory.donations,
        };
      });

      // Wait for all histories to be fetched
      const histories = await Promise.all(historiesPromises);

      // Convert to the required format
      const communicationHistories: Record<number, RawCommunicationThread[]> = {};
      const donationHistories: Record<number, DonationWithDetails[]> = {};

      histories.forEach(({ donorId, communicationHistory, donationHistory }) => {
        communicationHistories[donorId] = communicationHistory;
        donationHistories[donorId] = donationHistory;
      });

      try {
        logger.info(
          `Generating emails for ${donors.length} donors with histories: ${JSON.stringify({
            communicationHistoriesCount: Object.values(communicationHistories).flat().length,
            donationHistoriesCount: Object.values(donationHistories).flat().length,
          })}`
        );

        const emails = await generateDonorEmails(
          donors,
          instruction,
          organizationName,
          emailGeneratorOrg,
          organizationWritingInstructions,
          communicationHistories,
          donationHistories
        );

        return emails as GeneratedEmail[];
      } catch (error) {
        logger.error("Error generating emails:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate emails",
        });
      }
    }),
});
