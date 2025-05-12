import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getOrganizationById, updateOrganization } from "@/app/lib/data/organizations";
import { tasks } from "@trigger.dev/sdk/v3"; // Import tasks for triggering
import type { crawlAndSummarizeWebsiteTask } from "@/trigger/jobs/crawlAndSummarizeWebsite"; // Type-only import for the task
import pino from "pino"; // Import logger

const logger = pino(); // Initialize logger

// Input validation schemas
const updateOrganizationSchema = z.object({
  websiteUrl: z.string().url().nullable().optional(), // Allow nullable URL
  websiteSummary: z.string().optional(),
  description: z.string().optional(),
  writingInstructions: z.string().optional(),
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
});
