import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { OrganizationsService } from "@/app/lib/services/organizations.service";
import type { DonorJourney } from "@/app/lib/data/organizations";

/**
 * Input validation schemas for organization operations
 */
const updateOrganizationSchema = z.object({
  websiteUrl: z.string().url().nullable().optional(),
  websiteSummary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  writingInstructions: z.string().nullable().optional(),
  memory: z.array(z.string()).optional(),
});

const moveMemorySchema = z.object({
  memoryIndex: z.number(),
});

const donorJourneyNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  properties: z
    .object({
      description: z.string(),
      actions: z.array(z.string()).optional(),
    })
    .catchall(z.any()),
});

const donorJourneyEdgeSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.string(),
  target: z.string(),
  properties: z.record(z.string(), z.any()).default({}),
});

const donorJourneySchema = z.object({
  nodes: z.array(donorJourneyNodeSchema),
  edges: z.array(donorJourneyEdgeSchema),
});

const donorJourneyTextSchema = z.string();

/**
 * Organizations router for managing organization data and donor journeys
 * Uses OrganizationsService for all business logic operations
 */
export const organizationsRouter = router({
  /**
   * Get the current organization's details
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.getOrganization(ctx.auth.user.organizationId);
  }),

  /**
   * Update the current organization's details
   * Triggers website crawl if websiteUrl changes
   */
  updateCurrent: protectedProcedure.input(updateOrganizationSchema).mutation(async ({ input, ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.updateOrganizationWithWebsiteCrawl(ctx.auth.user.organizationId, input);
  }),

  /**
   * Generate a short description for the organization using AI
   */
  generateShortDescription: protectedProcedure.mutation(async ({ ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.generateShortDescription(ctx.auth.user.organizationId);
  }),

  /**
   * Move a memory item from user memory to organization memory
   */
  moveMemoryFromUser: protectedProcedure.input(moveMemorySchema).mutation(async ({ input, ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.moveMemoryFromUserToOrganization(
      ctx.auth.user.id,
      ctx.auth.user.organizationId,
      input
    );
  }),

  /**
   * Get the current organization's donor journey
   */
  getDonorJourney: protectedProcedure.query(async ({ ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.getOrganizationDonorJourney(ctx.auth.user.organizationId);
  }),

  /**
   * Update the current organization's donor journey
   */
  updateDonorJourney: protectedProcedure.input(donorJourneySchema).mutation(async ({ input, ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.updateOrganizationDonorJourney(ctx.auth.user.organizationId, input);
  }),

  /**
   * Get the current organization's donor journey text
   */
  getDonorJourneyText: protectedProcedure.query(async ({ ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.getOrganizationDonorJourneyText(ctx.auth.user.organizationId);
  }),

  /**
   * Update the current organization's donor journey text
   */
  updateDonorJourneyText: protectedProcedure.input(donorJourneyTextSchema).mutation(async ({ input, ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.updateOrganizationDonorJourneyText(ctx.auth.user.organizationId, input);
  }),

  /**
   * Process and update the donor journey from text description
   */
  processDonorJourney: protectedProcedure.input(donorJourneyTextSchema).mutation(async ({ input, ctx }) => {
    const organizationsService = new OrganizationsService();
    return await organizationsService.processAndUpdateDonorJourney(ctx.auth.user.organizationId, input);
  }),
});
