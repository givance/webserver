import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { logger } from "@/app/lib/logger";
import { getDonorById } from "@/app/lib/data/donors";
import { getOrganizationById } from "@/app/lib/data/organizations";

/**
 * Helper function to generate research topic for a donor
 */
async function generateDonorResearchTopic(donorId: number, organizationId: string): Promise<string> {
  // Get donor information
  const donor = await getDonorById(donorId, organizationId);
  if (!donor) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The donor you're trying to research doesn't exist in your organization.",
    });
  }

  // Get organization information
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Your organization information could not be found.",
    });
  }

  // Build donor name
  const donorName = `${donor.firstName} ${donor.lastName}`.trim();

  // Build address info if available
  const addressParts = [];
  if (donor.address) addressParts.push(donor.address);
  if (donor.state) addressParts.push(donor.state);
  const addressInfo = addressParts.length > 0 ? ` living in ${addressParts.join(", ")}` : "";

  // Build email info if available
  const emailInfo = donor.email ? ` with email ${donor.email}` : "";

  // Include donor notes if available
  const notesInfo = donor.notes ? ` Additional information: ${donor.notes}` : "";

  // Get organization description (prefer short description, fall back to description)
  const orgDescription = organization.shortDescription || organization.description || organization.name;

  // Generate research topic that includes identifying information and contextualizes it for the donation angle
  const researchTopic = `What motivates ${donorName}${addressInfo}${emailInfo} to donate to nonprofits? Analyze their background, interests, values, and philanthropic history. What specific aspects of a ${orgDescription} would appeal to them based on their profile?${notesInfo}`;

  logger.info(`Generated research topic for donor ${donorId}: "${researchTopic}"`);

  return researchTopic;
}

// Input validation schemas
const PersonResearchInputSchema = z.object({
  researchTopic: z
    .string()
    .min(3, "Research topic must be at least 3 characters")
    .max(500, "Research topic must not exceed 500 characters")
    .trim(),
});

const DonorResearchInputSchema = z.object({
  donorId: z.number().positive("Donor ID must be a positive number"),
});

const GetDonorResearchInputSchema = z.object({
  donorId: z.number().positive("Donor ID must be a positive number"),
  version: z.number().positive().optional(),
});

export const personResearchRouter = router({
  /**
   * Conducts comprehensive research on a person using the multi-stage pipeline
   */
  conductResearch: protectedProcedure.input(PersonResearchInputSchema).mutation(async ({ ctx, input }) => {
    const { researchTopic } = input;
    const { user } = ctx.auth;

    logger.info(
      `[Person Research API] Starting research request - Topic: "${researchTopic}", User: ${user.id}, Organization: ${user.organizationId}`
    );

    try {
      // Validate user has organization access
      if (!user.organizationId) {
        logger.warn(`[Person Research API] User ${user.id} attempted research without organization`);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be part of an organization to conduct research.",
        });
      }

      // Log research initiation
      logger.info(
        `[Person Research API] Initiating person research pipeline - Topic: "${researchTopic}", Organization: ${user.organizationId}`
      );

      // Conduct the research using our service
      const result = await ctx.services.personResearch.conductPersonResearch({
        researchTopic,
        organizationId: user.organizationId,
        userId: user.id,
      });

      // Log successful completion
      logger.info(
        `[Person Research API] Research completed successfully - Topic: "${researchTopic}", User: ${user.id}, Loops: ${result.totalLoops}, Sources: ${result.totalSources}, Citations: ${result.citations.length}, Answer Length: ${result.answer.length} chars`
      );

      return {
        success: true,
        data: {
          answer: result.answer,
          citations: result.citations,
          structuredData: result.structuredData, // NEW: Include structured data
          metadata: {
            researchTopic: result.researchTopic,
            totalLoops: result.totalLoops,
            totalSources: result.totalSources,
            timestamp: result.timestamp,
            summaryCount: result.summaries.length,
          },
          // Include summaries for debugging/transparency (optional)
          summaries: result.summaries.map((summary: any) => ({
            query: summary.query,
            summary: summary.summary,
            sourceCount: summary.sources.length,
            timestamp: summary.timestamp,
          })),
        },
      };
    } catch (error) {
      // Log the error with context
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorType = error instanceof Error ? error.constructor.name : typeof error;

      logger.error(
        `[Person Research API] Research failed - Topic: "${researchTopic}", User: ${user.id}, Organization: ${user.organizationId}, Error: ${errorMessage}, Type: ${errorType}`
      );

      // Handle different types of errors
      if (error instanceof TRPCError) {
        throw error;
      }

      // Check for specific error types and provide appropriate messages
      if (errorMessage.includes("Google Search API")) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Search service temporarily unavailable. Please try again later.",
        });
      }

      if (errorMessage.includes("Query generation failed")) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate search queries. Please try rephrasing your research topic.",
        });
      }

      // Generic error for any other failures
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Research request failed. Please try again or contact support if the issue persists.",
      });
    }
  }),

  /**
   * Get research status/health check
   */
  getResearchStatus: protectedProcedure.query(async ({ ctx }) => {
    const { user } = ctx.auth;

    logger.info(`[Person Research API] Status check requested by user ${user.id}`);

    try {
      // Basic health check - we could expand this to check Google API availability
      return {
        available: true,
        maxLoops: 2,
        maxQueriesPerLoop: 3,
        maxResultsPerQuery: 10,
        supportedFeatures: [
          "multi-stage-research",
          "ai-query-generation",
          "parallel-web-search",
          "knowledge-gap-analysis",
          "citation-extraction",
          "answer-synthesis",
        ],
      };
    } catch (error) {
      logger.error(
        `[Person Research API] Status check failed for user ${user.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      return {
        available: false,
        error: "Service temporarily unavailable",
      };
    }
  }),

  /**
   * Conducts comprehensive research on a specific donor
   * Automatically generates research topic based on donor info and organization context
   */
  conductDonorResearch: protectedProcedure.input(DonorResearchInputSchema).mutation(async ({ ctx, input }) => {
    const { donorId } = input;
    const { user } = ctx.auth;

    logger.info(
      `[Donor Research API] Starting donor research - Donor ID: ${donorId}, User: ${user.id}, Organization: ${user.organizationId}`
    );

    try {
      // Validate user has organization access
      if (!user.organizationId) {
        logger.warn(`[Donor Research API] User ${user.id} attempted research without organization`);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Organization membership required for donor research",
        });
      }

      // Generate research topic for the donor
      const researchTopic = await generateDonorResearchTopic(donorId, user.organizationId);

      logger.info(`[Donor Research API] Generated research topic for donor ${donorId}: "${researchTopic}"`);

      // Conduct and save the research
      const { result, dbRecord } = await ctx.services.personResearch.conductAndSavePersonResearch(
        {
          researchTopic,
          organizationId: user.organizationId,
          userId: user.id,
        },
        donorId
      );

      // Log successful completion
      logger.info(
        `[Donor Research API] Donor research completed successfully - Donor: ${donorId}, Research ID: ${dbRecord.id}, Loops: ${result.totalLoops}, Sources: ${result.totalSources}, Citations: ${result.citations.length}`
      );

      return {
        success: true,
        data: {
          researchId: dbRecord.id,
          donorId: donorId,
          answer: result.answer,
          citations: result.citations,
          structuredData: result.structuredData, // NEW: Include structured data
          metadata: {
            researchTopic: result.researchTopic,
            totalLoops: result.totalLoops,
            totalSources: result.totalSources,
            timestamp: result.timestamp,
            summaryCount: result.summaries.length,
            version: dbRecord.version,
            isLive: dbRecord.isLive,
          },
        },
      };
    } catch (error) {
      // Log the error with context
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorType = error instanceof Error ? error.constructor.name : typeof error;

      logger.error(
        `[Donor Research API] Donor research failed - Donor: ${donorId}, User: ${user.id}, Organization: ${user.organizationId}, Error: ${errorMessage}, Type: ${errorType}`
      );

      // Handle different types of errors
      if (error instanceof TRPCError) {
        throw error;
      }

      // Check for specific error types and provide appropriate messages
      if (errorMessage.includes("Google Search API")) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Search service temporarily unavailable. Please try again later.",
        });
      }

      if (errorMessage.includes("Query generation failed")) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate search queries. Please try rephrasing your research topic.",
        });
      }

      // Generic error for any other failures
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Donor research request failed. Please try again or contact support if the issue persists.",
      });
    }
  }),

  /**
   * Retrieves research results for a specific donor
   */
  getDonorResearch: protectedProcedure.input(GetDonorResearchInputSchema).query(async ({ ctx, input }) => {
    const { donorId, version } = input;
    const { user } = ctx.auth;

    logger.info(
      `[Donor Research API] Retrieving donor research - Donor ID: ${donorId}, Version: ${version || "live"}, User: ${
        user.id
      }, Organization: ${user.organizationId}`
    );

    try {
      // Validate user has organization access
      if (!user.organizationId) {
        logger.warn(`[Donor Research API] User ${user.id} attempted to retrieve research without organization`);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Organization membership required for donor research",
        });
      }

      // Verify donor belongs to organization
      const donor = await getDonorById(donorId, user.organizationId);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Donor not found in your organization",
        });
      }

      // Get research result
      const result = await ctx.services.personResearch.getPersonResearch(donorId, user.organizationId, version);

      if (!result) {
        logger.info(
          `[Donor Research API] No research found for donor ${donorId}${
            version ? ` version ${version}` : " (live version)"
          }`
        );
        return null;
      }

      logger.info(
        `[Donor Research API] Successfully retrieved donor research - Donor: ${donorId}, Citations: ${result.citations.length}, Answer Length: ${result.answer.length} chars`
      );

      return {
        answer: result.answer,
        citations: result.citations,
        structuredData: result.structuredData, // NEW: Include structured data
        metadata: {
          researchTopic: result.researchTopic,
          totalLoops: result.totalLoops,
          totalSources: result.totalSources,
          timestamp: result.timestamp,
          summaryCount: result.summaries.length,
        },
      };
    } catch (error) {
      // Log the error with context
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorType = error instanceof Error ? error.constructor.name : typeof error;

      logger.error(
        `[Donor Research API] Failed to retrieve donor research - Donor: ${donorId}, User: ${user.id}, Organization: ${user.organizationId}, Error: ${errorMessage}, Type: ${errorType}`
      );

      // Handle different types of errors
      if (error instanceof TRPCError) {
        throw error;
      }

      // Generic error for any other failures
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve donor research. Please try again or contact support if the issue persists.",
      });
    }
  }),

  /**
   * Gets all research versions for a specific donor
   */
  getAllDonorResearchVersions: protectedProcedure.input(DonorResearchInputSchema).query(async ({ ctx, input }) => {
    const { donorId } = input;
    const { user } = ctx.auth;

    logger.info(
      `[Donor Research API] Retrieving all donor research versions - Donor ID: ${donorId}, User: ${user.id}, Organization: ${user.organizationId}`
    );

    try {
      // Validate user has organization access
      if (!user.organizationId) {
        logger.warn(
          `[Donor Research API] User ${user.id} attempted to retrieve research versions without organization`
        );
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Organization membership required for donor research",
        });
      }

      // Verify donor belongs to organization
      const donor = await getDonorById(donorId, user.organizationId);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Donor not found in your organization",
        });
      }

      // Get all research versions
      const versions = await ctx.services.personResearch.getAllPersonResearchVersions(donorId, user.organizationId);

      logger.info(
        `[Donor Research API] Successfully retrieved ${versions.length} research versions for donor ${donorId}`
      );

      return versions.map((version) => ({
        id: version.id,
        version: version.version,
        isLive: version.isLive,
        researchTopic: version.researchTopic,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        metadata: {
          totalLoops: version.researchData.totalLoops,
          totalSources: version.researchData.totalSources,
          timestamp: version.researchData.timestamp,
          citationCount: version.researchData.citations.length,
          answerLength: version.researchData.answer.length,
        },
      }));
    } catch (error) {
      // Log the error with context
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorType = error instanceof Error ? error.constructor.name : typeof error;

      logger.error(
        `[Donor Research API] Failed to retrieve donor research versions - Donor: ${donorId}, User: ${user.id}, Organization: ${user.organizationId}, Error: ${errorMessage}, Type: ${errorType}`
      );

      // Handle different types of errors
      if (error instanceof TRPCError) {
        throw error;
      }

      // Generic error for any other failures
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Failed to retrieve donor research versions. Please try again or contact support if the issue persists.",
      });
    }
  }),

  /**
   * Starts bulk research for all unresearched donors
   */
  startBulkDonorResearch: protectedProcedure
    .input(
      z.object({
        donorIds: z.array(z.number()).optional(),
        limit: z.number().optional().describe("Maximum number of donors to research"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { donorIds, limit } = input;
      const { user } = ctx.auth;

      logger.info(
        `[Bulk Donor Research API] Starting bulk research - User: ${user.id}, Organization: ${
          user.organizationId
        }, Donor IDs: ${donorIds ? donorIds.length : "all unresearched"}, Limit: ${limit || "none"}`
      );

      try {
        // Validate user has organization access
        if (!user.organizationId) {
          logger.warn(`[Bulk Donor Research API] User ${user.id} attempted bulk research without organization`);
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Organization membership required for bulk donor research",
          });
        }

        // Start the bulk research job
        const result = await ctx.services.bulkDonorResearch.startBulkResearch({
          organizationId: user.organizationId,
          userId: user.id,
          donorIds,
          limit,
        });

        logger.info(
          `[Bulk Donor Research API] Bulk research job started - Job ID: ${result.jobId}, Donors to research: ${result.donorsToResearch}`
        );

        return {
          success: true,
          data: {
            jobId: result.jobId,
            donorsToResearch: result.donorsToResearch,
            message: `Started research for ${result.donorsToResearch} donors`,
          },
        };
      } catch (error) {
        // Log the error with context
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorType = error instanceof Error ? error.constructor.name : typeof error;

        logger.error(
          `[Bulk Donor Research API] Bulk research failed - User: ${user.id}, Organization: ${user.organizationId}, Error: ${errorMessage}, Type: ${errorType}`
        );

        // Handle different types of errors
        if (error instanceof TRPCError) {
          throw error;
        }

        // Generic error for any other failures
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start bulk donor research. Please try again or contact support if the issue persists.",
        });
      }
    }),

  /**
   * Gets research statistics for the organization
   */
  getResearchStatistics: protectedProcedure.query(async ({ ctx }) => {
    const { user } = ctx.auth;

    logger.info(
      `[Research Statistics API] Getting research statistics - User: ${user.id}, Organization: ${user.organizationId}`
    );

    try {
      // Validate user has organization access
      if (!user.organizationId) {
        logger.warn(`[Research Statistics API] User ${user.id} attempted to get stats without organization`);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Organization membership required for research statistics",
        });
      }

      // Get research statistics
      const stats = await ctx.services.bulkDonorResearch.getResearchStatistics(user.organizationId);

      logger.info(
        `[Research Statistics API] Successfully retrieved research statistics - Total: ${stats.totalDonors}, Researched: ${stats.researchedDonors}, Unresearched: ${stats.unresearchedDonors}, Percentage: ${stats.researchPercentage}%`
      );

      return stats;
    } catch (error) {
      // Log the error with context
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorType = error instanceof Error ? error.constructor.name : typeof error;

      logger.error(
        `[Research Statistics API] Failed to get research statistics - User: ${user.id}, Organization: ${user.organizationId}, Error: ${errorMessage}, Type: ${errorType}`
      );

      // Handle different types of errors
      if (error instanceof TRPCError) {
        throw error;
      }

      // Generic error for any other failures
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get research statistics. Please try again or contact support if the issue persists.",
      });
    }
  }),
});
