import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { EmailGenerationService, type GenerateEmailsInput } from "@/app/lib/services/email-generation.service";
import { EmailCampaignsService } from "@/app/lib/services/email-campaigns.service";
import { EmailSchedulingService } from "@/app/lib/services/email-scheduling.service";
import { AgenticEmailGenerationService } from "@/app/lib/services/agentic-email-generation.service";
import { env } from "@/app/lib/env";

// Input validation schemas
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
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  signature: z.string().optional(),
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

const launchCampaignSchema = z.object({
  campaignName: z.string().min(1).max(255),
  instruction: z.string(),
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
  status: z.enum(["DRAFT", "GENERATING", "READY_TO_SEND", "COMPLETED"]).optional(),
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

const updateCampaignSchema = z.object({
  campaignId: z.number(),
  campaignName: z.string().min(1).max(255).optional(),
  instruction: z.string().min(1).optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  selectedDonorIds: z.array(z.number()).optional(),
  previewDonorIds: z.array(z.number()).optional(),
  refinedInstruction: z.string().optional(),
  templateId: z.number().optional(),
});

const enhanceEmailSchema = z.object({
  emailId: z.number(),
  enhancementInstruction: z.string().min(1).max(500),
  currentSubject: z.string(),
  currentStructuredContent: z.array(
    z.object({
      piece: z.string(),
      references: z.array(z.string()),
      addNewlineAfter: z.boolean(),
    })
  ),
  currentReferenceContexts: z.record(z.string(), z.string()),
});

const regenerateAllEmailsSchema = z.object({
  sessionId: z.number(),
  instruction: z.string(), // Allow empty string to use existing instruction
  chatHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  refinedInstruction: z.string().optional(),
});

const saveDraftSchema = z.object({
  sessionId: z.number().optional(), // Optional for new drafts
  campaignName: z.string().min(1).max(255),
  selectedDonorIds: z.array(z.number()),
  templateId: z.number().optional(),
  instruction: z.string().optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  refinedInstruction: z.string().optional(),
  previewDonorIds: z.array(z.number()).optional(),
});

const saveGeneratedEmailSchema = z.object({
  sessionId: z.number(),
  donorId: z.number(),
  subject: z.string(),
  structuredContent: z.array(
    z.object({
      piece: z.string(),
      references: z.array(z.string()),
      addNewlineAfter: z.boolean(),
    })
  ),
  referenceContexts: z.record(z.string(), z.string()),
  isPreview: z.boolean().optional().default(true),
});

const updateEmailStatusSchema = z.object({
  emailId: z.number(),
  status: z.enum(["PENDING_APPROVAL", "APPROVED"]),
});

/**
 * Router for email campaign management
 * Handles email generation, campaign management, and email operations
 */
export const emailCampaignsRouter = router({
  /**
   * Generates smart donor emails based on instruction and donor data
   * Routes to agentic flow if USE_AGENTIC_FLOW is enabled, otherwise uses direct flow
   */
  generateEmails: protectedProcedure
    .input(generateEmailsSchema)
    .mutation(async ({ ctx, input }: { ctx: any; input: GenerateEmailsInput }) => {
      // Check if agentic flow is enabled
      if (env.USE_AGENTIC_FLOW) {
        // Use agentic flow - start conversation
        const agenticService = new AgenticEmailGenerationService();
        const agenticResult = await agenticService.startAgenticFlow(
          {
            instruction: input.instruction,
            donors: input.donors,
            organizationName: input.organizationName,
            organizationWritingInstructions: input.organizationWritingInstructions,
            currentDate: input.currentDate,
          },
          ctx.auth.user.organizationId,
          ctx.auth.user.id
        );

        // If agentic flow is complete and doesn't need user input, proceed to generation
        if (agenticResult.isComplete && !agenticResult.needsUserInput) {
          // Generate final prompt and execute generation automatically
          const finalPrompt = await agenticService.generateFinalPrompt(agenticResult.sessionId);
          const emailResult = await agenticService.executeEmailGeneration(
            agenticResult.sessionId,
            finalPrompt.finalPrompt
          );
          return emailResult;
        } else {
          // Return agentic conversation state for frontend to handle
          return {
            isAgenticFlow: true,
            ...agenticResult,
          };
        }
      } else {
        // Use traditional direct flow
        const emailService = new EmailGenerationService();
        return await emailService.generateSmartEmails(input, ctx.auth.user.organizationId, ctx.auth.user.id);
      }
    }),

  /**
   * Creates a new draft email generation session (does not trigger generation)
   */
  createSession: protectedProcedure.input(createSessionSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.createSession(input, ctx.auth.user.organizationId, ctx.auth.user.id);
  }),

  /**
   * Launch a draft campaign (transition from DRAFT to GENERATING/READY_TO_SEND)
   */
  launchCampaign: protectedProcedure.input(launchCampaignSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.launchCampaign(input, ctx.auth.user.organizationId, ctx.auth.user.id);
  }),

  /**
   * Gets an email generation session with generated emails
   */
  getSession: protectedProcedure.input(getSessionSchema).query(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.getSession(input.sessionId, ctx.auth.user.organizationId);
  }),

  /**
   * Gets the status of an email generation session
   */
  getSessionStatus: protectedProcedure.input(getSessionStatusSchema).query(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.getSessionStatus(input.sessionId, ctx.auth.user.organizationId);
  }),

  /**
   * Lists campaigns with filtering and pagination
   */
  listCampaigns: protectedProcedure.input(listCampaignsSchema).query(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.listCampaigns(input, ctx.auth.user.organizationId);
  }),

  /**
   * Deletes a campaign and its associated emails
   */
  deleteCampaign: protectedProcedure.input(deleteCampaignSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.deleteCampaign(input.campaignId, ctx.auth.user.organizationId);
  }),

  /**
   * Get email sending status
   */
  getEmailStatus: protectedProcedure.input(getEmailStatusSchema).query(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.getEmailStatus(input.emailId, ctx.auth.user.organizationId);
  }),

  /**
   * Update email content and subject
   */
  updateEmail: protectedProcedure.input(updateEmailSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.updateEmail(input, ctx.auth.user.organizationId);
  }),

  /**
   * Update email approval status
   */
  updateEmailStatus: protectedProcedure.input(updateEmailStatusSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.updateEmailStatus(input.emailId, input.status, ctx.auth.user.organizationId);
  }),

  /**
   * Update campaign data (for editing campaigns)
   */
  updateCampaign: protectedProcedure.input(updateCampaignSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.updateCampaign(input, ctx.auth.user.organizationId);
  }),

  /**
   * Enhance email content using AI
   */
  enhanceEmail: protectedProcedure.input(enhanceEmailSchema).mutation(async ({ ctx, input }) => {
    const emailService = new EmailGenerationService();
    return await emailService.enhanceEmail(input, ctx.auth.user.organizationId, ctx.auth.user.id);
  }),

  /**
   * Regenerate all emails for a campaign with new instructions
   * This will delete all existing emails and regenerate them
   */
  regenerateAllEmails: protectedProcedure.input(regenerateAllEmailsSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.regenerateAllEmails(input, ctx.auth.user.organizationId, ctx.auth.user.id);
  }),

  /**
   * Save campaign as draft - auto-saves campaign data without triggering generation
   */
  saveDraft: protectedProcedure.input(saveDraftSchema).mutation(async ({ ctx, input }) => {
    console.log("[tRPC saveDraft] Mutation called with input:", {
      sessionId: input.sessionId,
      campaignName: input.campaignName,
      selectedDonorCount: input.selectedDonorIds?.length,
      templateId: input.templateId,
      organizationId: ctx.auth.user.organizationId,
      userId: ctx.auth.user.id,
    });

    const campaignsService = new EmailCampaignsService();
    const result = await campaignsService.saveDraft(input, ctx.auth.user.organizationId, ctx.auth.user.id);

    console.log("[tRPC saveDraft] Mutation completed with result:", result);
    return result;
  }),

  /**
   * Save a generated email incrementally with PENDING_APPROVAL status
   */
  saveGeneratedEmail: protectedProcedure.input(saveGeneratedEmailSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.saveGeneratedEmail(input, ctx.auth.user.organizationId);
  }),

  /**
   * Retry a campaign that is stuck in PENDING status
   */
  retryCampaign: protectedProcedure.input(retryCampaignSchema).mutation(async ({ ctx, input }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.retryCampaign(input.campaignId, ctx.auth.user.organizationId, ctx.auth.user.id);
  }),

  /**
   * Schedule email sending for a campaign
   */
  scheduleEmailSend: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingService = new EmailSchedulingService();
      return await schedulingService.scheduleEmailCampaign(
        input.sessionId,
        ctx.auth.user.organizationId,
        ctx.auth.user.id
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
      const schedulingService = new EmailSchedulingService();
      return await schedulingService.getCampaignSchedule(input.sessionId, ctx.auth.user.organizationId);
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
      const schedulingService = new EmailSchedulingService();
      return await schedulingService.pauseCampaign(input.sessionId, ctx.auth.user.organizationId);
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
      const schedulingService = new EmailSchedulingService();
      return await schedulingService.resumeCampaign(input.sessionId, ctx.auth.user.organizationId, ctx.auth.user.id);
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
      const schedulingService = new EmailSchedulingService();
      return await schedulingService.cancelCampaign(input.sessionId, ctx.auth.user.organizationId);
    }),

  /**
   * Get or create email schedule configuration
   */
  getScheduleConfig: protectedProcedure.query(async ({ ctx }) => {
    const schedulingService = new EmailSchedulingService();
    return await schedulingService.getOrCreateScheduleConfig(ctx.auth.user.organizationId);
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
        rescheduleExisting: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedulingService = new EmailSchedulingService();
      return await schedulingService.updateScheduleConfig(ctx.auth.user.organizationId, input);
    }),

  /**
   * Fix stuck campaigns by checking and updating their status
   */
  fixStuckCampaigns: protectedProcedure.mutation(async ({ ctx }) => {
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.fixStuckCampaigns(ctx.auth.user.organizationId);
  }),
});
