import { TRPCError } from "@trpc/server";
import { eq, and, notExists, count } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { donors, personResearch } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { bulkDonorResearchTask } from "@/trigger/jobs/bulkDonorResearch";

export interface StartBulkResearchInput {
  organizationId: string;
  userId: string;
  donorIds?: number[]; // Optional: if provided, research only these donors
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
    const { organizationId, userId, donorIds } = input;

    try {
      // Get count of donors that need research
      const donorsToResearchCount = await this.getUnresearchedDonorsCount(organizationId, donorIds);

      if (donorsToResearchCount.unresearchedDonors === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No donors found that need research",
        });
      }

      logger.info(
        `Starting bulk donor research for organization ${organizationId} - ${donorsToResearchCount.unresearchedDonors} donors to research`
      );

      // Trigger the background job
      const job = await bulkDonorResearchTask.trigger({
        organizationId,
        userId,
        donorIds,
      });

      logger.info(`Bulk donor research job ${job.id} started for organization ${organizationId}`);

      return {
        jobId: job.id,
        donorsToResearch: donorsToResearchCount.unresearchedDonors,
      };
    } catch (error) {
      logger.error(`Failed to start bulk donor research: ${error instanceof Error ? error.message : String(error)}`);

      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to start bulk donor research",
      });
    }
  }

  /**
   * Gets the count of unresearched donors in an organization
   * @param organizationId - The organization ID
   * @param donorIds - Optional specific donor IDs to check
   * @returns Donor count information
   */
  async getUnresearchedDonorsCount(organizationId: string, donorIds?: number[]): Promise<UnresearchedDonorsCount> {
    try {
      let totalDonorsQuery;
      let unresearchedDonorsQuery;

      // If specific donor IDs are provided, filter by them
      if (donorIds && donorIds.length > 0) {
        const { inArray } = await import("drizzle-orm");

        totalDonorsQuery = db
          .select({ count: count() })
          .from(donors)
          .where(and(eq(donors.organizationId, organizationId), inArray(donors.id, donorIds)));

        unresearchedDonorsQuery = db
          .select({ count: count() })
          .from(donors)
          .where(
            and(
              eq(donors.organizationId, organizationId),
              inArray(donors.id, donorIds),
              notExists(db.select().from(personResearch).where(eq(personResearch.donorId, donors.id)))
            )
          );
      } else {
        totalDonorsQuery = db.select({ count: count() }).from(donors).where(eq(donors.organizationId, organizationId));

        unresearchedDonorsQuery = db
          .select({ count: count() })
          .from(donors)
          .where(
            and(
              eq(donors.organizationId, organizationId),
              notExists(db.select().from(personResearch).where(eq(personResearch.donorId, donors.id)))
            )
          );
      }

      const [totalResult, unresearchedResult] = await Promise.all([totalDonorsQuery, unresearchedDonorsQuery]);

      const totalDonors = totalResult[0]?.count || 0;
      const unresearchedDonors = unresearchedResult[0]?.count || 0;
      const researchedDonors = totalDonors - unresearchedDonors;

      return {
        totalDonors,
        unresearchedDonors,
        researchedDonors,
      };
    } catch (error) {
      logger.error(
        `Failed to get unresearched donors count: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get donor research statistics",
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
