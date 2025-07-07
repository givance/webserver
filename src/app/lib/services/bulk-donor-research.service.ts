import { TRPCError } from '@trpc/server';
import { logger } from '@/app/lib/logger';
import { bulkDonorResearchTask } from '@/trigger/jobs/bulkDonorResearch';
import { getUnresearchedDonorsCount as getUnresearchedDonorsCountData } from '@/app/lib/data/donors';

export interface StartBulkResearchInput {
  organizationId: string;
  userId: string;
  donorIds?: number[]; // Optional: if provided, research only these donors
  limit?: number; // Optional: maximum number of donors to research
}

export interface BulkResearchJobResult {
  jobId: string;
  donorsToResearch: number;
}

export interface UnresearchedDonorsCount {
  totalDonors: number;
  unresearchedDonors: number;
  researchedDonors: number;
}

/**
 * Service for handling bulk donor research operations
 */
export class BulkDonorResearchService {
  /**
   * Starts bulk research for unresearched donors
   * @param input - Research parameters
   * @returns Job information
   */
  async startBulkResearch(input: StartBulkResearchInput): Promise<BulkResearchJobResult> {
    const { organizationId, userId, donorIds, limit } = input;

    try {
      // Get count of donors that need research
      const donorsToResearchCount = await this.getUnresearchedDonorsCount(organizationId, donorIds);

      if (donorsToResearchCount.unresearchedDonors === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No donors found that need research',
        });
      }

      // Apply limit if specified
      const actualDonorsToResearch = limit
        ? Math.min(limit, donorsToResearchCount.unresearchedDonors)
        : donorsToResearchCount.unresearchedDonors;

      logger.info(
        `Starting bulk donor research for organization ${organizationId} - ${actualDonorsToResearch} donors to research${
          limit ? ` (limited from ${donorsToResearchCount.unresearchedDonors})` : ''
        }`
      );

      // Trigger the background job
      const job = await bulkDonorResearchTask.trigger({
        organizationId,
        userId,
        donorIds,
        limit,
      });

      logger.info(`Bulk donor research job ${job.id} started for organization ${organizationId}`);

      return {
        jobId: job.id,
        donorsToResearch: actualDonorsToResearch,
      };
    } catch (error) {
      logger.error(
        `Failed to start bulk donor research: ${error instanceof Error ? error.message : String(error)}`
      );

      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start bulk donor research',
      });
    }
  }

  /**
   * Gets the count of unresearched donors in an organization
   * @param organizationId - The organization ID
   * @param donorIds - Optional specific donor IDs to check
   * @returns Donor count information
   */
  async getUnresearchedDonorsCount(
    organizationId: string,
    donorIds?: number[]
  ): Promise<UnresearchedDonorsCount> {
    try {
      return await getUnresearchedDonorsCountData(organizationId, donorIds);
    } catch (error) {
      logger.error(
        `Failed to get unresearched donors count: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get donor research statistics',
      });
    }
  }

  /**
   * Gets research statistics for an organization
   * @param organizationId - The organization ID
   * @returns Research statistics
   */
  async getResearchStatistics(organizationId: string): Promise<{
    totalDonors: number;
    researchedDonors: number;
    unresearchedDonors: number;
    researchPercentage: number;
  }> {
    const counts = await this.getUnresearchedDonorsCount(organizationId);
    const researchPercentage =
      counts.totalDonors > 0 ? Math.round((counts.researchedDonors / counts.totalDonors) * 100) : 0;

    return {
      ...counts,
      researchPercentage,
    };
  }
}
