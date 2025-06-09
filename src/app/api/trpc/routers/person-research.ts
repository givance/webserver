import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { PersonResearchService } from "@/app/lib/services/person-research.service";
import { logger } from "@/app/lib/logger";

const personResearchService = new PersonResearchService();

// Input validation schema
const PersonResearchInputSchema = z.object({
  researchTopic: z
    .string()
    .min(3, "Research topic must be at least 3 characters")
    .max(500, "Research topic must not exceed 500 characters")
    .trim(),
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
          message: "Organization membership required for person research",
        });
      }

      // Log research initiation
      logger.info(
        `[Person Research API] Initiating person research pipeline - Topic: "${researchTopic}", Organization: ${user.organizationId}`
      );

      // Conduct the research using our service
      const result = await personResearchService.conductPersonResearch({
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
});
