import {
  getOrganizationById,
  updateOrganization,
  updateDonorJourney,
  getDonorJourney,
  updateDonorJourneyText,
  getDonorJourneyText,
  type DonorJourney,
} from '@/app/lib/data/organizations';
import { getUserById, updateUserMemory } from '@/app/lib/data/users';
import { DonorJourneyService } from './donor-journey.service';
import { tasks } from '@trigger.dev/sdk/v3';
import type { crawlAndSummarizeWebsiteTask } from '@/trigger/jobs/crawlAndSummarizeWebsite';
import { logger } from '@/app/lib/logger';
import { env } from '@/app/lib/env';
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import {
  createNotFoundError,
  createValidationError,
  ErrorHandler,
} from '@/app/lib/utils/error-handler';
import { FeatureFlagService } from '@/app/lib/feature-flags/service';
import { FeatureFlagManager } from '@/app/lib/feature-flags/types';

/**
 * Input types for organization operations
 */
export interface UpdateOrganizationInput {
  websiteUrl?: string | null;
  websiteSummary?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  writingInstructions?: string | null;
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
    return await ErrorHandler.wrapOperation(async () => {
      const organization = await getOrganizationById(organizationId);
      if (!organization) {
        throw createNotFoundError('Organization', organizationId);
      }
      return organization;
    });
  }

  /**
   * Retrieves an organization with feature flags
   * @param organizationId - The organization ID
   * @returns The organization data with feature flags
   * @throws TRPCError if organization not found
   */
  async getOrganizationWithFeatureFlags(organizationId: string) {
    return await ErrorHandler.wrapOperation(async () => {
      const organization = await getOrganizationById(organizationId);
      if (!organization) {
        throw createNotFoundError('Organization', organizationId);
      }

      // Get feature flags for the organization
      const featureFlagManager = await FeatureFlagService.getFeatureFlags(organizationId);
      const featureFlags = featureFlagManager.getAllFlags();

      return {
        ...organization,
        featureFlags,
      };
    });
  }

  /**
   * Updates an organization and triggers website crawl if URL changes
   * @param organizationId - The organization ID
   * @param input - The update data
   * @returns The updated organization
   */
  async updateOrganizationWithWebsiteCrawl(organizationId: string, input: UpdateOrganizationInput) {
    // Fetch current organization data
    const currentOrganization = await getOrganizationById(organizationId);
    if (!currentOrganization) {
      throw createNotFoundError('Organization', organizationId);
    }

    const oldUrl = currentOrganization.websiteUrl;
    const newUrl = input.websiteUrl;

    // Update the organization in the database
    const updated = await updateOrganization(organizationId, input);
    if (!updated) {
      throw createNotFoundError('Organization', organizationId);
    }

    // Website crawling is disabled - skip crawl trigger
    logger.info(
      `Website crawling is disabled. Skipping crawl trigger for organization ${organizationId}.`
    );

    logger.info(`Successfully updated organization ${organizationId}`);
    return updated;
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
      const handle = await tasks.trigger<typeof crawlAndSummarizeWebsiteTask>(
        'crawl-and-summarize-website',
        {
          url: newUrl,
          organizationId: organizationId,
        }
      );
      logger.info(`Triggered crawl task for organization ${organizationId}. Run ID: ${handle.id}`);
    } catch (triggerError) {
      // Log the error but don't fail the operation, as the organization update was successful
      logger.error(
        `Failed to trigger crawl task for organization ${organizationId} after URL update: ${
          triggerError instanceof Error ? triggerError.message : 'Unknown error'
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
  async moveMemoryFromUserToOrganization(
    userId: string,
    organizationId: string,
    input: MoveMemoryInput
  ) {
    // Get current user and their memory
    const user = await getUserById(userId);
    if (!user || !user.memory) {
      throw createNotFoundError('User', userId);
    }

    // Get the memory item to move
    const memoryItem = user.memory[input.memoryIndex];
    if (!memoryItem) {
      throw createValidationError('Memory item not found');
    }

    // Get current organization and its memory
    const organization = await getOrganizationById(organizationId);
    if (!organization) {
      throw createNotFoundError('Organization', organizationId);
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
  }

  /**
   * Retrieves the donor journey for an organization
   * @param organizationId - The organization ID
   * @returns The donor journey or empty journey if not found
   */
  async getOrganizationDonorJourney(organizationId: string): Promise<DonorJourney> {
    const journey = await getDonorJourney(organizationId);
    if (!journey) {
      logger.info(
        `No donor journey found for organization ${organizationId}, returning empty journey`
      );
      return { nodes: [], edges: [] } as DonorJourney;
    }
    return journey;
  }

  /**
   * Updates the donor journey for an organization
   * @param organizationId - The organization ID
   * @param journey - The donor journey data
   * @returns The updated organization
   */
  async updateOrganizationDonorJourney(organizationId: string, journey: DonorJourney) {
    return await ErrorHandler.wrapOperation(async () => {
      const updated = await updateDonorJourney(organizationId, journey);
      if (!updated) {
        throw createNotFoundError('Organization', organizationId);
      }
      logger.info(`Successfully updated donor journey for organization ${organizationId}`);
      return updated;
    });
  }

  /**
   * Retrieves the donor journey text for an organization
   * @param organizationId - The organization ID
   * @returns The donor journey text or empty string if not found
   */
  async getOrganizationDonorJourneyText(organizationId: string): Promise<string> {
    const text = await getDonorJourneyText(organizationId);
    return text || '';
  }

  /**
   * Updates the donor journey text for an organization
   * @param organizationId - The organization ID
   * @param text - The donor journey text
   * @returns The updated organization
   */
  async updateOrganizationDonorJourneyText(organizationId: string, text: string) {
    const updated = await updateDonorJourneyText(organizationId, text);
    if (!updated) {
      throw new Error(`Organization with ID ${organizationId} not found`);
    }
    logger.info(`Successfully updated donor journey text for organization ${organizationId}`);
    return updated;
  }

  /**
   * Processes donor journey text and updates both text and graph
   * @param organizationId - The organization ID
   * @param journeyText - The donor journey description text
   * @returns The updated organization with processed journey
   */
  async processAndUpdateDonorJourney(organizationId: string, journeyText: string) {
    return await ErrorHandler.wrapOperation(async () => {
      // Process the journey description using the DonorJourneyService
      const journeyGraph = await DonorJourneyService.processJourney(journeyText);

      // Save both the text and generated graph
      const updated = await updateDonorJourney(organizationId, journeyGraph);
      await updateDonorJourneyText(organizationId, journeyText);

      if (!updated) {
        throw createNotFoundError('Organization', organizationId);
      }

      logger.info(
        `Successfully processed and updated donor journey for organization ${organizationId} with ${journeyGraph.nodes.length} nodes and ${journeyGraph.edges.length} edges`
      );
      return updated;
    });
  }

  /**
   * Retrieves the feature flags for an organization
   * @param organizationId - The organization ID
   * @returns The feature flag manager instance
   */
  async getOrganizationFeatureFlags(organizationId: string): Promise<FeatureFlagManager> {
    return await FeatureFlagService.getFeatureFlags(organizationId);
  }

  /**
   * Generates a short description for the organization using AI
   * @param organizationId - The organization ID
   * @returns The generated short description
   */
  async generateShortDescription(organizationId: string): Promise<string> {
    const organization = await getOrganizationById(organizationId);
    if (!organization) {
      throw createNotFoundError('Organization', organizationId);
    }

    const azure = createAzure({
      resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
      apiKey: env.AZURE_OPENAI_API_KEY,
    });

    const systemPrompt = `You are a professional copywriter specialized in creating compelling, concise organization descriptions.
Your task is to create a short, engaging paragraph (2-4 sentences, maximum 150 words) that captures the essence of the organization.

Guidelines:
- Focus on the organization's mission, impact, and value proposition
- Use clear, accessible language that resonates with potential donors
- Highlight what makes the organization unique or compelling
- Avoid jargon and overly technical language
- Make it suitable for use in marketing materials, websites, and donor communications`;

    const contextParts: string[] = [];

    if (organization.description) {
      contextParts.push(`Organization Description: ${organization.description}`);
    }

    // Website summary is disabled - skip including it
    // if (organization.websiteSummary) {
    //   contextParts.push(`Website Summary: ${organization.websiteSummary}`);
    // }

    if (organization.name) {
      contextParts.push(`Organization Name: ${organization.name}`);
    }

    if (contextParts.length === 0) {
      throw new Error(
        'Cannot generate short description: no organization metadata available (description, website summary, or name)'
      );
    }

    const prompt = `Based on the following organization information, create a compelling short description:

${contextParts.join('\n\n')}

Generate a short, engaging description that would work well for marketing materials and donor communications.`;

    const { text } = await generateText({
      model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
      prompt,
      system: systemPrompt,
      maxTokens: 200,
      temperature: 0.7,
    });

    logger.info(`Generated short description for organization ${organizationId}: "${text}"`);
    return text.trim();
  }
}
