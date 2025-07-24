import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { env } from '@/app/lib/env';
import { appendSignatureToEmail } from '@/app/lib/utils/email-with-signature';
import { appendSignatureToPlainText } from '@/app/lib/utils/email-with-signature';
import { getEmailContentWithAuth } from '@/app/lib/data/email-campaigns';
import { TRPCError } from '@trpc/server';

// Input validation schemas
const createSessionSchema = z.object({
  campaignName: z.string().min(1).max(255),
  chatHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
  selectedDonorIds: z.array(z.number()),
  templateId: z.number().optional(),
});

const launchCampaignSchema = z.object({
  campaignId: z.number(),
  campaignName: z.string().min(1).max(255).optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
  selectedDonorIds: z.array(z.number()).optional(),
  templateId: z.number().optional(),
  signature: z.string().optional(),
});

const getSessionSchema = z.object({
  sessionId: z.number(),
  signature: z.string().optional(),
});

const getSessionStatusSchema = z.object({
  sessionId: z.number(),
});

const listCampaignsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  status: z.enum(['DRAFT', 'GENERATING', 'READY_TO_SEND', 'COMPLETED']).optional(),
  statusGroup: z.enum(['active', 'ready', 'other']).optional(),
});

const deleteCampaignSchema = z.object({
  campaignId: z.number(),
});

const getEmailStatusSchema = z.object({
  emailId: z.number(),
});

const retryCampaignSchema = z.object({
  campaignId: z.number(),
});

const updateEmailSchema = z
  .object({
    emailId: z.number(),
    subject: z.string().min(1).max(200),
    // Legacy format fields (optional for backward compatibility)
    structuredContent: z
      .array(
        z.object({
          piece: z.string(),
          references: z.array(z.string()),
          addNewlineAfter: z.boolean(),
        })
      )
      .optional(),
    referenceContexts: z.record(z.string(), z.string()).optional(),
    // New format fields
    emailContent: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .refine(
    (data) => {
      // At least one content format must be provided
      return (
        (data.structuredContent && data.structuredContent.length > 0) ||
        data.emailContent !== undefined
      );
    },
    {
      message: 'Either structuredContent or emailContent must be provided',
    }
  );

const updateCampaignSchema = z.object({
  campaignId: z.number(),
  campaignName: z.string().min(1).max(255).optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
  scheduleConfig: z
    .object({
      dailyLimit: z.number().optional(),
      minGapMinutes: z.number().optional(),
      maxGapMinutes: z.number().optional(),
      timezone: z.string().optional(),
      allowedDays: z.array(z.number()).optional(),
      allowedStartTime: z.string().optional(),
      allowedEndTime: z.string().optional(),
      allowedTimezone: z.string().optional(),
      dailySchedules: z
        .record(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
            enabled: z.boolean(),
          })
        )
        .optional(),
    })
    .optional(),
  selectedDonorIds: z.array(z.number()).optional(),
  templateId: z.number().optional(),
});

const smartEmailGenerationSchema = z.object({
  sessionId: z.number(),
  mode: z.enum([
    'generate_more',
    'regenerate_all',
    'generate_with_new_message',
    'regenerate_with_edited_history',
  ]),
  count: z.number().min(1).max(50).optional(), // Number of new emails to generate (for generate_more mode)
  newMessage: z.string().optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(), // Full chat history for regenerate_with_edited_history mode
});

const saveDraftSchema = z.object({
  sessionId: z.number().optional(), // Optional for new drafts
  campaignName: z.string().min(1).max(255),
  selectedDonorIds: z.array(z.number()),
  templateId: z.number().optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

const saveGeneratedEmailSchema = z.object({
  sessionId: z.number(),
  donorId: z.number(),
  subject: z.string(),
  // Legacy format fields (optional for new emails)
  structuredContent: z
    .array(
      z.object({
        piece: z.string(),
        references: z.array(z.string()),
        addNewlineAfter: z.boolean(),
      })
    )
    .optional(),
  referenceContexts: z.record(z.string(), z.string()).optional(),
  // New format fields
  emailContent: z.string().optional(),
  reasoning: z.string().optional(),
  response: z.string().optional(),
  isPreview: z.boolean().optional().default(true),
});

const updateEmailStatusSchema = z.object({
  emailId: z.number(),
  status: z.enum(['PENDING_APPROVAL', 'APPROVED']),
});

const getEmailWithSignatureSchema = z.object({
  donorId: z.number(),
  structuredContent: z.array(
    z.object({
      piece: z.string(),
      references: z.array(z.string()),
      addNewlineAfter: z.boolean(),
    })
  ),
});

const getPlainTextEmailWithSignatureSchema = z.object({
  emailId: z.number(),
});

/**
 * Router for email campaign management
 * Handles email generation, campaign management, and email operations
 */
export const emailCampaignsRouter = router({
  /**
   * Creates a new draft email generation session (does not trigger generation)
   */
  createSession: protectedProcedure.input(createSessionSchema).mutation(async ({ ctx, input }) => {
    return await ctx.services.emailCampaigns.createSession(
      input,
      ctx.auth.user.organizationId,
      ctx.auth.user.id
    );
  }),

  /**
   * Launch a draft campaign (transition from DRAFT to GENERATING/READY_TO_SEND)
   */
  launchCampaign: protectedProcedure
    .input(launchCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.launchCampaign(
        input,
        ctx.auth.user.organizationId,
        ctx.auth.user.id
      );
    }),

  /**
   * Gets an email generation session with generated emails
   */
  getSession: protectedProcedure.input(getSessionSchema).query(async ({ ctx, input }) => {
    return await ctx.services.emailCampaigns.getSession(
      input.sessionId,
      ctx.auth.user.organizationId,
      input.signature
    );
  }),

  /**
   * Gets the status of an email generation session
   */
  getSessionStatus: protectedProcedure
    .input(getSessionStatusSchema)
    .query(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.getSessionStatus(
        input.sessionId,
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Lists campaigns with filtering and pagination
   */
  listCampaigns: protectedProcedure.input(listCampaignsSchema).query(async ({ ctx, input }) => {
    return await ctx.services.emailCampaigns.listCampaigns(input, ctx.auth.user.organizationId);
  }),

  /**
   * Deletes a campaign and its associated emails
   */
  deleteCampaign: protectedProcedure
    .input(deleteCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.deleteCampaign(
        input.campaignId,
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Get email sending status
   */
  getEmailStatus: protectedProcedure.input(getEmailStatusSchema).query(async ({ ctx, input }) => {
    return await ctx.services.emailCampaigns.getEmailStatus(
      input.emailId,
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Update email content and subject
   */
  updateEmail: protectedProcedure.input(updateEmailSchema).mutation(async ({ ctx, input }) => {
    return await ctx.services.emailCampaigns.updateEmail(input, ctx.auth.user.organizationId);
  }),

  /**
   * Update email approval status
   */
  updateEmailStatus: protectedProcedure
    .input(updateEmailStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.updateEmailStatus(
        input.emailId,
        input.status,
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Update campaign data (for editing campaigns)
   */
  updateCampaign: protectedProcedure
    .input(updateCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.updateCampaign(input, ctx.auth.user.organizationId);
    }),

  /**
   * Unified smart email generation - handles generate more, regenerate all, and generate with new message
   */
  smartEmailGeneration: protectedProcedure
    .input(smartEmailGenerationSchema)
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.smartEmailGeneration(
        input,
        ctx.auth.user.organizationId,
        ctx.auth.user.id
      );
    }),

  /**
   * Save campaign as draft - auto-saves campaign data without triggering generation
   */
  saveDraft: protectedProcedure.input(saveDraftSchema).mutation(async ({ ctx, input }) => {
    return await ctx.services.emailCampaigns.saveDraft(
      input,
      ctx.auth.user.organizationId,
      ctx.auth.user.id
    );
  }),

  /**
   * Save a generated email incrementally with PENDING_APPROVAL status
   */
  saveGeneratedEmail: protectedProcedure
    .input(saveGeneratedEmailSchema)
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.saveGeneratedEmail(
        input,
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Retry a campaign that is stuck in PENDING status
   */
  retryCampaign: protectedProcedure.input(retryCampaignSchema).mutation(async ({ ctx, input }) => {
    return await ctx.services.emailCampaigns.retryCampaign(
      input.campaignId,
      ctx.auth.user.organizationId,
      ctx.auth.user.id
    );
  }),

  /**
   * Schedule email sending for a campaign
   */
  scheduleEmailSend: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        scheduleConfig: z
          .object({
            dailyLimit: z.number().optional(),
            minGapMinutes: z.number().optional(),
            maxGapMinutes: z.number().optional(),
            timezone: z.string().optional(),
            allowedDays: z.array(z.number()).optional(),
            allowedStartTime: z.string().optional(),
            allowedEndTime: z.string().optional(),
            allowedTimezone: z.string().optional(),
            dailySchedules: z
              .record(
                z.object({
                  startTime: z.string(),
                  endTime: z.string(),
                  enabled: z.boolean(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailScheduling.scheduleEmailCampaign(
        input.sessionId,
        ctx.auth.user.organizationId,
        ctx.auth.user.id,
        input.scheduleConfig
      );
    }),

  /**
   * Get email schedule and status for a campaign
   */
  getEmailSchedule: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await ctx.services.emailScheduling.getCampaignSchedule(
        input.sessionId,
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Pause email sending for a campaign
   */
  pauseEmailSending: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailScheduling.pauseCampaign(
        input.sessionId,
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Resume email sending for a paused campaign
   */
  resumeEmailSending: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailScheduling.resumeCampaign(
        input.sessionId,
        ctx.auth.user.organizationId,
        ctx.auth.user.id
      );
    }),

  /**
   * Cancel all remaining emails in a campaign
   */
  cancelEmailSending: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailScheduling.cancelCampaign(
        input.sessionId,
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Get or create email schedule configuration
   */
  getScheduleConfig: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.services.emailScheduling.getOrCreateScheduleConfig(
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Update email schedule configuration
   */
  updateScheduleConfig: protectedProcedure
    .input(
      z.object({
        dailyLimit: z.number().min(1).max(500).optional(),
        minGapMinutes: z.number().min(0).optional(),
        maxGapMinutes: z.number().min(0).optional(),
        timezone: z.string().optional(),
        allowedDays: z.array(z.number().min(0).max(6)).min(1).optional(),
        allowedStartTime: z
          .string()
          .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
          .optional(),
        allowedEndTime: z
          .string()
          .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
          .optional(),
        allowedTimezone: z.string().optional(),
        dailySchedules: z
          .record(
            z.object({
              startTime: z.string(),
              endTime: z.string(),
              enabled: z.boolean(),
            })
          )
          .optional(),
        rescheduleExisting: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.services.emailScheduling.updateScheduleConfig(
        ctx.auth.user.organizationId,
        input
      );
    }),

  /**
   * Fix stuck campaigns by checking and updating their status
   */
  fixStuckCampaigns: protectedProcedure.mutation(async ({ ctx }) => {
    return await ctx.services.emailCampaigns.fixStuckCampaigns(ctx.auth.user.organizationId);
  }),

  /**
   * Get email content with signature appended for display
   */
  getEmailWithSignature: protectedProcedure
    .input(getEmailWithSignatureSchema)
    .query(async ({ ctx, input }) => {
      const contentWithSignature = await appendSignatureToEmail(input.structuredContent, {
        donorId: input.donorId,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
      });
      return { structuredContent: contentWithSignature };
    }),

  /**
   * Get plain text email content with signature appended for display
   */
  getPlainTextEmailWithSignature: protectedProcedure
    .input(getPlainTextEmailWithSignatureSchema)
    .query(async ({ ctx, input }) => {
      // Fetch email content from database with authorization check
      const email = await getEmailContentWithAuth(input.emailId, ctx.auth.user.organizationId);

      if (!email || !email.emailContent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Email not found or content is empty',
        });
      }

      const contentWithSignature = await appendSignatureToPlainText(email.emailContent, {
        donorId: email.donorId,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
      });
      return { emailContent: contentWithSignature };
    }),

  /**
   * Export campaign data to CSV format
   */
  exportCampaignData: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await ctx.services.emailCampaigns.exportCampaignData(
        input.sessionId,
        ctx.auth.user.organizationId
      );
    }),
});
