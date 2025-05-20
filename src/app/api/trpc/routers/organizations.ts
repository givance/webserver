import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  getOrganizationById,
  updateOrganization,
  updateDonorJourney,
  getDonorJourney,
  updateDonorJourneyText,
  getDonorJourneyText,
  type DonorJourney,
} from "@/app/lib/data/organizations";
import { tasks } from "@trigger.dev/sdk/v3"; // Import tasks for triggering
import type { crawlAndSummarizeWebsiteTask } from "@/trigger/jobs/crawlAndSummarizeWebsite"; // Type-only import for the task
import pino from "pino"; // Import logger
import { getUserById, updateUserMemory } from "@/app/lib/data/users";
import { DonorJourneyService } from "@/app/lib/services/donor-journey.service";

const logger = pino(); // Initialize logger

// Input validation schemas
const updateOrganizationSchema = z.object({
  websiteUrl: z.string().url().nullable().optional(), // Allow nullable URL
  websiteSummary: z.string().optional(),
  description: z.string().optional(),
  writingInstructions: z.string().optional(),
  memory: z.array(z.string()).optional(), // Array of strings for memory
});

// Donor journey validation schemas
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

export const organizationsRouter = router({
  /**
   * Get the current organization's details
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const organization = await getOrganizationById(ctx.auth.user.organizationId);
    if (!organization) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }
    return organization;
  }),

  /**
   * Update the current organization's details
   * Triggers website crawl if websiteUrl changes.
   */
  updateCurrent: protectedProcedure.input(updateOrganizationSchema).mutation(async ({ input, ctx }) => {
    const organizationId = ctx.auth.user.organizationId;

    // 1. Fetch current organization data
    const currentOrganization = await getOrganizationById(organizationId);
    if (!currentOrganization) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found (pre-update check).",
      });
    }

    const oldUrl = currentOrganization.websiteUrl;
    const newUrl = input.websiteUrl; // Can be string, undefined, or null

    try {
      // 2. Update the organization in the database
      const updated = await updateOrganization(organizationId, input);
      if (!updated) {
        // This case might be redundant if getOrganizationById worked, but good practice
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found (post-update check).",
        });
      }

      // 3. Check if URL changed and trigger task
      if (newUrl !== undefined && newUrl !== oldUrl && newUrl) {
        // URL was provided, it's different from the old one, and it's not null/empty
        logger.info(
          `Website URL changed for org ${organizationId} from "${oldUrl}" to "${newUrl}". Triggering crawl task.`
        );
        try {
          const handle = await tasks.trigger<typeof crawlAndSummarizeWebsiteTask>(
            "crawl-and-summarize-website", // Task ID
            {
              url: newUrl,
              organizationId: organizationId,
            }
          );
          logger.info(`Triggered crawl task for org ${organizationId}. Run ID: ${handle.id}`);
        } catch (triggerError) {
          // Log the error but don't fail the mutation,
          // as the organization update itself was successful.
          logger.error(
            `Failed to trigger crawl task for org ${organizationId} after URL update: ${
              triggerError instanceof Error ? triggerError.message : String(triggerError)
            }`
          );
        }
      } else {
        logger.info(
          `Website URL for org ${organizationId} not updated or no valid new URL provided. Skipping crawl trigger.`
        );
      }

      return updated; // Return the updated organization data
    } catch (error) {
      logger.error(
        `Failed to update organization ${organizationId}: ${error instanceof Error ? error.message : String(error)}`
      );
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update organization",
        cause: error,
      });
    }
  }),

  /**
   * Move a memory item from user memory to organization memory
   */
  moveMemoryFromUser: protectedProcedure
    .input(
      z.object({
        memoryIndex: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Get current user and their memory
        const user = await getUserById(ctx.auth.user.id);
        if (!user || !user.memory) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found or has no memory items",
          });
        }

        // Get the memory item to move
        const memoryItem = user.memory[input.memoryIndex];
        if (!memoryItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Memory item not found",
          });
        }

        // Get current organization and its memory
        const organization = await getOrganizationById(ctx.auth.user.organizationId);
        if (!organization) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Organization not found",
          });
        }

        // Add memory item to organization memory
        const currentOrgMemory = organization.memory || [];
        const updatedOrgMemory = [...currentOrgMemory, memoryItem];
        await updateOrganization(ctx.auth.user.organizationId, { memory: updatedOrgMemory });

        // Remove memory item from user memory
        const updatedUserMemory = user.memory.filter((_, index) => index !== input.memoryIndex);
        await updateUserMemory(user.id, updatedUserMemory);

        return { success: true };
      } catch (error) {
        logger.error(
          `Failed to move memory from user to organization: ${error instanceof Error ? error.message : String(error)}`
        );
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to move memory to organization",
          cause: error,
        });
      }
    }),

  /**
   * Get the current organization's donor journey
   */
  getDonorJourney: protectedProcedure.query(async ({ ctx }) => {
    try {
      const journey = await getDonorJourney(ctx.auth.user.organizationId);
      if (!journey) {
        return { nodes: [], edges: [] } as DonorJourney;
      }
      return journey;
    } catch (error) {
      logger.error(`Failed to get donor journey: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get donor journey",
        cause: error,
      });
    }
  }),

  /**
   * Update the current organization's donor journey
   */
  updateDonorJourney: protectedProcedure.input(donorJourneySchema).mutation(async ({ input, ctx }) => {
    try {
      const updated = await updateDonorJourney(ctx.auth.user.organizationId, input);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }
      return updated;
    } catch (error) {
      logger.error(`Failed to update donor journey: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update donor journey",
        cause: error,
      });
    }
  }),

  /**
   * Get the current organization's donor journey text
   */
  getDonorJourneyText: protectedProcedure.query(async ({ ctx }) => {
    try {
      const text = await getDonorJourneyText(ctx.auth.user.organizationId);
      return text || "";
    } catch (error) {
      logger.error(`Failed to get donor journey text: ${error instanceof Error ? error.message : String(error)}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get donor journey text",
        cause: error,
      });
    }
  }),

  /**
   * Update the current organization's donor journey text
   */
  updateDonorJourneyText: protectedProcedure.input(z.string()).mutation(async ({ input, ctx }) => {
    try {
      const updated = await updateDonorJourneyText(ctx.auth.user.organizationId, input);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }
      return updated;
    } catch (error) {
      logger.error(`Failed to update donor journey text: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update donor journey text",
        cause: error,
      });
    }
  }),

  /**
   * Process and update the donor journey
   */
  processDonorJourney: protectedProcedure.input(z.string()).mutation(async ({ input, ctx }) => {
    try {
      // Process the journey description
      const journeyGraph = await DonorJourneyService.processJourney(input);

      // Save both the text and generated graph
      const updated = await updateDonorJourney(ctx.auth.user.organizationId, journeyGraph);
      await updateDonorJourneyText(ctx.auth.user.organizationId, input);

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      return updated;
    } catch (error) {
      logger.error(`Failed to process donor journey: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to process donor journey",
        cause: error,
      });
    }
  }),
});
