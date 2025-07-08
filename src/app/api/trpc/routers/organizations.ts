import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import type { DonorJourney } from '@/app/lib/data/organizations';
import { createTRPCError, ERROR_MESSAGES } from '../trpc';
import { urlSchema, descriptionSchema } from '@/app/lib/validation/schemas';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Donor journey node schema
 */
const donorJourneyNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  properties: z
    .object({
      description: z.string(),
      actions: z.array(z.string()).optional(),
    })
    .catchall(z.any()),
});

/**
 * Donor journey edge schema
 */
const donorJourneyEdgeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  properties: z.record(z.string(), z.any()).default({}),
});

/**
 * Complete donor journey schema
 */
const donorJourneySchema = z.object({
  nodes: z.array(donorJourneyNodeSchema),
  edges: z.array(donorJourneyEdgeSchema),
});

/**
 * Organization response schema
 */
const organizationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  websiteUrl: z.string().nullable(),
  websiteSummary: z.string().nullable(),
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  writingInstructions: z.string().nullable(),
  memory: z.array(z.string()),
  donorJourney: donorJourneySchema.nullable(),
  donorJourneyText: z.string().nullable(),
  createdAt: z.string(), // ISO string
  updatedAt: z.string(), // ISO string
});

// Input schemas
const updateOrganizationSchema = z.object({
  websiteUrl: urlSchema.nullable().optional(),
  websiteSummary: z.string().max(5000).nullable().optional(),
  description: descriptionSchema.max(5000).nullable().optional(),
  shortDescription: z.string().max(500).nullable().optional(),
  writingInstructions: z.string().max(5000).nullable().optional(),
  memory: z.array(z.string().max(1000)).max(100).optional(),
});

const moveMemorySchema = z.object({
  memoryIndex: z.number().int().min(0),
});

const donorJourneyTextSchema = z.string().min(1).max(10000);

// Output schemas
const generateDescriptionResponseSchema = z.object({
  shortDescription: z.string(),
});

const moveMemoryResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const processDonorJourneyResponseSchema = z.object({
  success: z.boolean(),
  donorJourney: donorJourneySchema,
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Serialize organization dates to ISO strings
 */
const serializeOrganization = (org: any): z.infer<typeof organizationResponseSchema> => ({
  ...org,
  createdAt: org.createdAt instanceof Date ? org.createdAt.toISOString() : org.createdAt,
  updatedAt: org.updatedAt instanceof Date ? org.updatedAt.toISOString() : org.updatedAt,
});

// ============================================================================
// Router Definition
// ============================================================================

export const organizationsRouter = router({
  /**
   * Get the current organization's details
   *
   * @returns Organization data including donor journey
   *
   * @throws {TRPCError} NOT_FOUND if organization doesn't exist
   * @throws {TRPCError} UNAUTHORIZED if user has no organization
   */
  getCurrent: protectedProcedure.output(organizationResponseSchema).query(async ({ ctx }) => {
    if (!ctx.auth.user?.organizationId) {
      throw createTRPCError({
        code: 'UNAUTHORIZED',
        message: ERROR_MESSAGES.UNAUTHORIZED,
      });
    }

    const org = await ctx.services.organizations.getOrganization(ctx.auth.user.organizationId);

    return serializeOrganization(org);
  }),

  /**
   * Update the current organization's details
   *
   * @param websiteUrl - Organization website URL
   * @param websiteSummary - AI-generated website summary
   * @param description - Full organization description
   * @param shortDescription - Brief organization description
   * @param writingInstructions - Instructions for AI email generation
   * @param memory - Organization memory items
   *
   * @returns Updated organization data
   *
   * @throws {TRPCError} NOT_FOUND if organization doesn't exist
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if update fails
   *
   * @note Triggers website crawl if websiteUrl changes
   */
  updateCurrent: protectedProcedure
    .input(updateOrganizationSchema)
    .output(organizationResponseSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      const org = await ctx.services.organizations.updateOrganizationWithWebsiteCrawl(
        ctx.auth.user.organizationId,
        input
      );

      return serializeOrganization(org);
    }),

  /**
   * Generate a short description for the organization using AI
   *
   * @returns Generated short description
   *
   * @throws {TRPCError} NOT_FOUND if organization doesn't exist
   * @throws {TRPCError} BAD_REQUEST if organization lacks required data
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if AI generation fails
   */
  generateShortDescription: protectedProcedure
    .output(generateDescriptionResponseSchema)
    .mutation(async ({ ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      const shortDescription = await ctx.services.organizations.generateShortDescription(
        ctx.auth.user.organizationId
      );

      return { shortDescription };
    }),

  /**
   * Move a memory item from user memory to organization memory
   *
   * @param memoryIndex - Index of memory item to move
   *
   * @returns Success status and message
   *
   * @throws {TRPCError} BAD_REQUEST if memory index is invalid
   * @throws {TRPCError} NOT_FOUND if user or organization doesn't exist
   */
  moveMemoryFromUser: protectedProcedure
    .input(moveMemorySchema)
    .output(moveMemoryResponseSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      const result = await ctx.services.organizations.moveMemoryFromUserToOrganization(
        ctx.auth.user.id,
        ctx.auth.user.organizationId,
        input
      );

      return {
        ...result,
        message: 'Memory item moved successfully',
      };
    }),

  /**
   * Get the current organization's donor journey
   *
   * @returns Donor journey graph structure or null
   *
   * @throws {TRPCError} NOT_FOUND if organization doesn't exist
   */
  getDonorJourney: protectedProcedure
    .output(donorJourneySchema.nullable())
    .query(async ({ ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      return await ctx.services.organizations.getOrganizationDonorJourney(
        ctx.auth.user.organizationId
      );
    }),

  /**
   * Update the current organization's donor journey
   *
   * @param nodes - Array of journey nodes
   * @param edges - Array of journey edges
   *
   * @returns Updated donor journey
   *
   * @throws {TRPCError} BAD_REQUEST if journey structure is invalid
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if update fails
   */
  updateDonorJourney: protectedProcedure
    .input(donorJourneySchema)
    .output(donorJourneySchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      const org = await ctx.services.organizations.updateOrganizationDonorJourney(
        ctx.auth.user.organizationId,
        input
      );

      // Return just the donor journey
      return input; // The service saves the journey but we return what was sent
    }),

  /**
   * Get the current organization's donor journey text description
   *
   * @returns Text description or null
   *
   * @throws {TRPCError} NOT_FOUND if organization doesn't exist
   */
  getDonorJourneyText: protectedProcedure.output(z.string().nullable()).query(async ({ ctx }) => {
    if (!ctx.auth.user?.organizationId) {
      throw createTRPCError({
        code: 'UNAUTHORIZED',
        message: ERROR_MESSAGES.UNAUTHORIZED,
      });
    }

    return await ctx.services.organizations.getOrganizationDonorJourneyText(
      ctx.auth.user.organizationId
    );
  }),

  /**
   * Update the current organization's donor journey text description
   *
   * @param input - Text description of donor journey
   *
   * @returns Success status
   *
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if update fails
   */
  updateDonorJourneyText: protectedProcedure
    .input(donorJourneyTextSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      await ctx.services.organizations.updateOrganizationDonorJourneyText(
        ctx.auth.user.organizationId,
        input
      );

      return { success: true };
    }),

  /**
   * Process and update the donor journey from text description
   *
   * @param input - Text description to process into journey graph
   *
   * @returns Processed donor journey graph
   *
   * @throws {TRPCError} BAD_REQUEST if text cannot be processed
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if AI processing fails
   */
  processDonorJourney: protectedProcedure
    .input(donorJourneyTextSchema)
    .output(processDonorJourneyResponseSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.auth.user?.organizationId) {
        throw createTRPCError({
          code: 'UNAUTHORIZED',
          message: ERROR_MESSAGES.UNAUTHORIZED,
        });
      }

      const org = await ctx.services.organizations.processAndUpdateDonorJourney(
        ctx.auth.user.organizationId,
        input
      );

      if (!org?.donorJourney) {
        throw createTRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process donor journey',
        });
      }

      return {
        success: true,
        donorJourney: org.donorJourney as z.infer<typeof donorJourneySchema>,
      };
    }),
});
