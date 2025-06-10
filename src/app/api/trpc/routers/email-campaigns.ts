import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { EmailGenerationService, type GenerateEmailsInput } from "@/app/lib/services/email-generation.service";
import { EmailCampaignsService } from "@/app/lib/services/email-campaigns.service";

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

/**
 * Router for email campaign management
 * Handles email generation, campaign management, and email operations
 */
export const emailCampaignsRouter = router({
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
    const campaignsService = new EmailCampaignsService();
    return await campaignsService.createSession(input, ctx.auth.user.organizationId, ctx.auth.user.id);
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
});
