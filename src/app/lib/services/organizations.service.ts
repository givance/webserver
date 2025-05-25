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
import { getUserById, updateUserMemory } from "@/app/lib/data/users";
import { DonorJourneyService } from "./donor-journey.service";
import { tasks } from "@trigger.dev/sdk/v3";
import type { crawlAndSummarizeWebsiteTask } from "@/trigger/jobs/crawlAndSummarizeWebsite";
import { logger } from "@/app/lib/logger";
import { ErrorHandler, wrapDatabaseOperation } from "@/app/lib/utils/error-handler";

/**
 * Input types for organization operations
 */
export interface UpdateOrganizationInput {
  websiteUrl?: string | null;
  websiteSummary?: string;
  description?: string;
  writingInstructions?: string;
  memory?: string[];
}

export interface MoveMemoryInput {
  memoryIndex: number;
}

/**
 * Service for handling organization operations
 * Encapsulates business logic for organization management, website crawling, and memory operations
 */
export class OrganizationsService {
  /**
   * Retrieves an organization by ID with error handling
   * @param organizationId - The organization ID
   * @returns The organization data
   * @throws TRPCError if organization not found
   */
  async getOrganization(organizationId: string) {
    return await wrapDatabaseOperation(
      async () => {
        const organization = await getOrganizationById(organizationId);
        if (!organization) {
          throw ErrorHandler.handleNotFoundError("Organization", organizationId, {
            organizationId,
            operation: "getOrganization",
          });
        }
        return organization;
      },
      { organizationId, operation: "getOrganization" },
      "Failed to retrieve organization"
    );
  }

  /**
   * Updates an organization and triggers website crawl if URL changes
   * @param organizationId - The organization ID
   * @param input - The update data
   * @returns The updated organization
   */
  async updateOrganizationWithWebsiteCrawl(organizationId: string, input: UpdateOrganizationInput) {
    return await wrapDatabaseOperation(
      async () => {
        // Fetch current organization data
        const currentOrganization = await getOrganizationById(organizationId);
        if (!currentOrganization) {
          throw ErrorHandler.handleNotFoundError("Organization", organizationId, {
            organizationId,
            operation: "updateOrganizationWithWebsiteCrawl",
          });
        }

        const oldUrl = currentOrganization.websiteUrl;
        const newUrl = input.websiteUrl;

        // Update the organization in the database
        const updated = await updateOrganization(organizationId, input);
        if (!updated) {
          throw ErrorHandler.handleNotFoundError("Organization", organizationId, {
            organizationId,
            operation: "updateOrganizationWithWebsiteCrawl",
            additionalData: { step: "post-update" },
          });
        }

        // Check if URL changed and trigger crawl task
        if (newUrl !== undefined && newUrl !== oldUrl && newUrl) {
          await this.triggerWebsiteCrawl(organizationId, newUrl, oldUrl);
        } else {
          logger.info(
            `Website URL for organization ${organizationId} not updated or no valid new URL provided. Skipping crawl trigger.`
          );
        }

        logger.info(`Successfully updated organization ${organizationId}`);
        return updated;
      },
      { organizationId, operation: "updateOrganizationWithWebsiteCrawl" },
      "Failed to update organization"
    );
  }

  /**
   * Triggers website crawl task when URL changes
   * @param organizationId - The organization ID
   * @param newUrl - The new website URL
   * @param oldUrl - The previous website URL
   */
  private async triggerWebsiteCrawl(organizationId: string, newUrl: string, oldUrl: string | null) {
    logger.info(
      `Website URL changed for organization ${organizationId} from "${oldUrl}" to "${newUrl}". Triggering crawl task.`
    );

    try {
      const handle = await tasks.trigger<typeof crawlAndSummarizeWebsiteTask>("crawl-and-summarize-website", {
        url: newUrl,
        organizationId: organizationId,
      });
      logger.info(`Triggered crawl task for organization ${organizationId}. Run ID: ${handle.id}`);
    } catch (triggerError) {
      // Log the error but don't fail the operation, as the organization update was successful
      logger.error(
        `Failed to trigger crawl task for organization ${organizationId} after URL update: ${
          triggerError instanceof Error ? triggerError.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Moves a memory item from user memory to organization memory
   * @param userId - The user ID
   * @param organizationId - The organization ID
   * @param input - The memory move parameters
   * @returns Success confirmation
   */
  async moveMemoryFromUserToOrganization(userId: string, organizationId: string, input: MoveMemoryInput) {
    return await wrapDatabaseOperation(
      async () => {
        // Get current user and their memory
        const user = await getUserById(userId);
        if (!user || !user.memory) {
          throw ErrorHandler.createError("NOT_FOUND", "User not found or has no memory items", {
            userId,
            organizationId,
            operation: "moveMemoryFromUserToOrganization",
          });
        }

        // Get the memory item to move
        const memoryItem = user.memory[input.memoryIndex];
        if (!memoryItem) {
          throw ErrorHandler.createError("NOT_FOUND", "Memory item not found", {
            userId,
            organizationId,
            operation: "moveMemoryFromUserToOrganization",
            additionalData: { memoryIndex: input.memoryIndex, totalMemoryItems: user.memory.length },
          });
        }

        // Get current organization and its memory
        const organization = await getOrganizationById(organizationId);
        if (!organization) {
          throw ErrorHandler.handleNotFoundError("Organization", organizationId, {
            userId,
            organizationId,
            operation: "moveMemoryFromUserToOrganization",
          });
        }

        // Add memory item to organization memory
        const currentOrgMemory = organization.memory || [];
        const updatedOrgMemory = [...currentOrgMemory, memoryItem];
        await updateOrganization(organizationId, { memory: updatedOrgMemory });

        // Remove memory item from user memory
        const updatedUserMemory = user.memory.filter((_, index) => index !== input.memoryIndex);
        await updateUserMemory(userId, updatedUserMemory);

        logger.info(
          `Successfully moved memory item from user ${userId} to organization ${organizationId} (item: "${memoryItem}")`
        );
        return { success: true };
      },
      { userId, organizationId, operation: "moveMemoryFromUserToOrganization" },
      "Failed to move memory to organization"
    );
  }

  /**
   * Retrieves the donor journey for an organization
   * @param organizationId - The organization ID
   * @returns The donor journey or empty journey if not found
   */
  async getOrganizationDonorJourney(organizationId: string): Promise<DonorJourney> {
    return await wrapDatabaseOperation(
      async () => {
        const journey = await getDonorJourney(organizationId);
        if (!journey) {
          logger.info(`No donor journey found for organization ${organizationId}, returning empty journey`);
          return { nodes: [], edges: [] } as DonorJourney;
        }
        return journey;
      },
      { organizationId, operation: "getOrganizationDonorJourney" },
      "Failed to get donor journey"
    );
  }

  /**
   * Updates the donor journey for an organization
   * @param organizationId - The organization ID
   * @param journey - The donor journey data
   * @returns The updated organization
   */
  async updateOrganizationDonorJourney(organizationId: string, journey: DonorJourney) {
    return await wrapDatabaseOperation(
      async () => {
        const updated = await updateDonorJourney(organizationId, journey);
        if (!updated) {
          throw ErrorHandler.handleNotFoundError("Organization", organizationId, {
            organizationId,
            operation: "updateOrganizationDonorJourney",
          });
        }
        logger.info(`Successfully updated donor journey for organization ${organizationId}`);
        return updated;
      },
      { organizationId, operation: "updateOrganizationDonorJourney" },
      "Failed to update donor journey"
    );
  }

  /**
   * Retrieves the donor journey text for an organization
   * @param organizationId - The organization ID
   * @returns The donor journey text or empty string if not found
   */
  async getOrganizationDonorJourneyText(organizationId: string): Promise<string> {
    return await wrapDatabaseOperation(
      async () => {
        const text = await getDonorJourneyText(organizationId);
        return text || "";
      },
      { organizationId, operation: "getOrganizationDonorJourneyText" },
      "Failed to get donor journey text"
    );
  }

  /**
   * Updates the donor journey text for an organization
   * @param organizationId - The organization ID
   * @param text - The donor journey text
   * @returns The updated organization
   */
  async updateOrganizationDonorJourneyText(organizationId: string, text: string) {
    return await wrapDatabaseOperation(
      async () => {
        const updated = await updateDonorJourneyText(organizationId, text);
        if (!updated) {
          throw ErrorHandler.handleNotFoundError("Organization", organizationId, {
            organizationId,
            operation: "updateOrganizationDonorJourneyText",
          });
        }
        logger.info(`Successfully updated donor journey text for organization ${organizationId}`);
        return updated;
      },
      { organizationId, operation: "updateOrganizationDonorJourneyText" },
      "Failed to update donor journey text"
    );
  }

  /**
   * Processes donor journey text and updates both text and graph
   * @param organizationId - The organization ID
   * @param journeyText - The donor journey description text
   * @returns The updated organization with processed journey
   */
  async processAndUpdateDonorJourney(organizationId: string, journeyText: string) {
    return await wrapDatabaseOperation(
      async () => {
        // Process the journey description using the DonorJourneyService
        const journeyGraph = await DonorJourneyService.processJourney(journeyText);

        // Save both the text and generated graph
        const updated = await updateDonorJourney(organizationId, journeyGraph);
        await updateDonorJourneyText(organizationId, journeyText);

        if (!updated) {
          throw ErrorHandler.handleNotFoundError("Organization", organizationId, {
            organizationId,
            operation: "processAndUpdateDonorJourney",
          });
        }

        logger.info(
          `Successfully processed and updated donor journey for organization ${organizationId} with ${journeyGraph.nodes.length} nodes and ${journeyGraph.edges.length} edges`
        );
        return updated;
      },
      { organizationId, operation: "processAndUpdateDonorJourney" },
      "Failed to process donor journey"
    );
  }
}
