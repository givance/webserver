import { logger } from "@/app/lib/logger";
import { AnswerSynthesisService } from "@/app/lib/services/person-research/answer-synthesis.service";
import { QueryGenerationService } from "@/app/lib/services/person-research/query-generation.service";
import { ReflectionService } from "@/app/lib/services/person-research/reflection.service";
import {
  PersonResearchInput,
  PersonResearchResult,
  ResearchQuery,
  WebSearchResult,
} from "@/app/lib/services/person-research/types";
import { WebSearchService } from "@/app/lib/services/person-research/web-search.service";

/**
 * PersonResearchService - Main service for iterative web research on individuals
 *
 * This service implements a multi-stage pipeline architecture:
 * 1. Query Generation: Generates optimized search queries from user input
 * 2. Web Research: Executes parallel web searches using Google's Search API
 * 3. Reflection & Gap Analysis: Analyzes results and identifies knowledge gaps
 * 4. Iterative Refinement: Continues research until sufficient or max loops reached
 * 5. Answer Synthesis: Combines research into comprehensive answer with citations
 */
export class PersonResearchService {
  private readonly MAX_RESEARCH_LOOPS = 2;

  private queryGenerationService = new QueryGenerationService();
  private webSearchService = new WebSearchService();
  private reflectionService = new ReflectionService();
  private answerSynthesisService = new AnswerSynthesisService();

  /**
   * Conducts comprehensive research on a person
   * @param input - Research parameters including topic and context
   * @returns Comprehensive research results with citations
   */
  async conductPersonResearch(input: PersonResearchInput): Promise<PersonResearchResult> {
    this.validateInput(input);

    const { researchTopic, organizationId, userId } = input;

    logger.info(
      `Starting person research for topic: "${researchTopic}" (organization: ${organizationId}, user: ${userId})`
    );

    try {
      const allSummaries: WebSearchResult[] = [];
      let currentLoop = 0;
      let queries: ResearchQuery[] = [];

      // Stage 1: Initial Query Generation
      logger.info(`[Research Loop ${currentLoop + 1}] Generating initial search queries for: "${researchTopic}"`);

      const initialQueries = await this.queryGenerationService.generateQueries({
        researchTopic,
        maxQueries: 3,
        isFollowUp: false,
      });

      queries = initialQueries.queries;
      logger.info(`Generated ${queries.length} initial queries: ${queries.map((q) => q.query).join(", ")}`);

      // Research Loop - Continue until sufficient or max loops reached
      while (currentLoop < this.MAX_RESEARCH_LOOPS) {
        currentLoop++;
        logger.info(`[Research Loop ${currentLoop}] Starting web research with ${queries.length} queries`);

        // Stage 2: Web Research
        const searchResults = await this.webSearchService.conductParallelSearch({
          queries,
          researchTopic,
        });

        // Add results to our collection
        allSummaries.push(...searchResults.results);

        logger.info(
          `[Research Loop ${currentLoop}] Collected ${searchResults.results.length} search results (total: ${allSummaries.length})`
        );

        // Stage 3: Reflection & Gap Analysis (except on final loop)
        if (currentLoop < this.MAX_RESEARCH_LOOPS) {
          logger.info(`[Research Loop ${currentLoop}] Analyzing results for knowledge gaps`);

          const reflection = await this.reflectionService.analyzeResults({
            researchTopic,
            summaries: allSummaries,
          });

          if (reflection.isSufficient) {
            logger.info(`[Research Loop ${currentLoop}] Research deemed sufficient, ending early`);
            break;
          }

          if (reflection.followUpQueries.length > 0) {
            // Stage 4: Generate follow-up queries using the query generation service
            logger.info(
              `[Research Loop ${currentLoop}] Knowledge gap identified: "${reflection.knowledgeGap}", converting ${reflection.followUpQueries.length} follow-up queries to natural search terms`
            );

            const followUpQueries = await this.queryGenerationService.generateQueries({
              researchTopic,
              maxQueries: Math.min(reflection.followUpQueries.length, 3),
              isFollowUp: true,
              previousQueries: allSummaries.map((s) => s.query),
            });

            queries = followUpQueries.queries;
          } else {
            logger.info(`[Research Loop ${currentLoop}] No follow-up queries generated, ending research`);
            break;
          }
        }
      }

      logger.info(`Research completed after ${currentLoop} loops with ${allSummaries.length} total summaries`);

      // Stage 5: Answer Synthesis
      logger.info(`Synthesizing final answer from ${allSummaries.length} research summaries`);

      const finalAnswer = await this.answerSynthesisService.synthesizeAnswer({
        researchTopic,
        summaries: allSummaries,
      });

      const result: PersonResearchResult = {
        answer: finalAnswer.answer,
        citations: finalAnswer.citations,
        summaries: allSummaries,
        totalLoops: currentLoop,
        totalSources: allSummaries.length,
        researchTopic,
        timestamp: new Date(),
      };

      logger.info(
        `Person research completed successfully - Topic: "${researchTopic}", Loops: ${currentLoop}, Sources: ${allSummaries.length}, Citations: ${finalAnswer.citations.length}`
      );

      return result;
    } catch (error) {
      logger.error(
        `Person research failed for topic "${researchTopic}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(`Failed to conduct person research: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Validates research input parameters
   */
  private validateInput(input: PersonResearchInput): void {
    if (!input.researchTopic?.trim()) {
      throw new Error("Research topic is required");
    }

    if (!input.organizationId?.trim()) {
      throw new Error("Organization ID is required");
    }

    if (!input.userId?.trim()) {
      throw new Error("User ID is required");
    }
  }
}
