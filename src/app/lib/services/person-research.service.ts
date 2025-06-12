import { logger } from "@/app/lib/logger";
import { AnswerSynthesisService } from "@/app/lib/services/person-research/answer-synthesis.service";
import { QueryGenerationService } from "@/app/lib/services/person-research/query-generation.service";
import { ReflectionService } from "@/app/lib/services/person-research/reflection.service";
import { PersonResearchDatabaseService } from "@/app/lib/services/person-research/database.service";
import { PersonIdentificationService } from "@/app/lib/services/person-research/person-identification.service";
import { StructuredDataExtractionService } from "@/app/lib/services/person-research/structured-data-extraction.service";
import {
  PersonResearchInput,
  PersonResearchResult,
  ResearchQuery,
  WebSearchResult,
  PersonResearchDBRecord,
  ResearchTokenUsage,
  TokenUsage,
  createEmptyTokenUsage,
  createEmptyResearchTokenUsage,
  addTokenUsage,
  DonorInfo,
  PersonIdentity,
  PersonResearchData,
} from "@/app/lib/services/person-research/types";
import { WebSearchService } from "@/app/lib/services/person-research/web-search.service";
import { getDonorById } from "@/app/lib/data/donors";
import { db } from "@/app/lib/db";
import { donors } from "@/app/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * PersonResearchService - Main service for iterative web research on individuals
 *
 * This service implements a multi-stage pipeline architecture:
 * 1. Person Identification: Extracts and verifies the person's identity
 * 2. Query Generation: Generates optimized search queries from user input
 * 3. Web Research: Executes parallel web searches using Google's Search API with relevance filtering
 * 4. Reflection & Gap Analysis: Analyzes results and identifies knowledge gaps
 * 5. Iterative Refinement: Continues research until sufficient or max loops reached
 * 6. Answer Synthesis: Combines research into comprehensive answer with citations
 */
export class PersonResearchService {
  private readonly MAX_RESEARCH_LOOPS = 2;

  private queryGenerationService = new QueryGenerationService();
  private webSearchService = new WebSearchService();
  private reflectionService = new ReflectionService();
  private answerSynthesisService = new AnswerSynthesisService();
  private databaseService = new PersonResearchDatabaseService();
  private personIdentificationService = new PersonIdentificationService();
  private structuredDataExtractionService = new StructuredDataExtractionService();

  /**
   * Conducts comprehensive research on a person and saves it to the database
   * @param input - Research parameters including topic and context
   * @param donorId - The donor ID to associate the research with
   * @returns Comprehensive research results with citations and database record
   */
  async conductAndSavePersonResearch(
    input: PersonResearchInput,
    donorId: number
  ): Promise<{ result: PersonResearchResult; dbRecord: PersonResearchDBRecord }> {
    // Get donor information for improved person identification
    let donorInfo: DonorInfo | null = null;
    if (donorId && input.organizationId) {
      const donor = await getDonorById(donorId, input.organizationId);
      if (donor) {
        donorInfo = {
          fullName: `${donor.firstName} ${donor.lastName}`.trim(),
          location: donor.address ? `${donor.address}${donor.state ? `, ${donor.state}` : ""}` : undefined,
          notes: donor.notes || undefined,
          email: donor.email || undefined,
          address: donor.address || undefined,
          state: donor.state || undefined,
        };

        logger.info(`Using donor information for enhanced person identification: ${donorInfo.fullName}`);
      }
    }

    // Conduct the research with donor information
    const result = await this.conductPersonResearch(input, donorInfo);

    // Save to database
    const dbRecord = await this.databaseService.savePersonResearch({
      donorId,
      organizationId: input.organizationId,
      userId: input.userId,
      researchResult: result,
      setAsLive: true,
    });

    // Update donor record with high potential flag
    try {
      await db
        .update(donors)
        .set({
          highPotentialDonor: result.structuredData.highPotentialDonor,
          updatedAt: new Date(),
        })
        .where(eq(donors.id, donorId));

      logger.info(`Updated donor ${donorId} with high potential flag: ${result.structuredData.highPotentialDonor}`);
    } catch (error) {
      logger.error(
        `Failed to update donor ${donorId} with research results: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Don't throw error - research was still successful
    }

    logger.info(`Successfully conducted and saved person research for donor ${donorId}, research ID: ${dbRecord.id}`);

    return { result, dbRecord };
  }

  /**
   * Retrieves person research from the database
   * @param donorId - The donor ID
   * @param organizationId - The organization ID
   * @param version - Optional version number (defaults to live version)
   * @returns The research result or null if not found
   */
  async getPersonResearch(
    donorId: number,
    organizationId: string,
    version?: number
  ): Promise<PersonResearchResult | null> {
    const dbRecord = await this.databaseService.getPersonResearch({
      donorId,
      organizationId,
      version,
    });

    if (!dbRecord) {
      return null;
    }

    return dbRecord.researchData;
  }

  /**
   * Gets all research versions for a donor
   * @param donorId - The donor ID
   * @param organizationId - The organization ID
   * @returns Array of research records
   */
  async getAllPersonResearchVersions(donorId: number, organizationId: string): Promise<PersonResearchDBRecord[]> {
    return this.databaseService.getAllPersonResearchVersions(donorId, organizationId);
  }

  /**
   * Sets a specific research version as live
   * @param researchId - The research record ID
   * @param donorId - The donor ID
   * @returns Updated record
   */
  async setResearchAsLive(researchId: number, donorId: number): Promise<PersonResearchDBRecord> {
    return this.databaseService.setResearchAsLive(researchId, donorId);
  }

  /**
   * Conducts comprehensive research on a person
   * @param input - Research parameters including topic and context
   * @param donorInfo - Optional donor information for improved person identification
   * @returns Comprehensive research results with citations
   */
  async conductPersonResearch(input: PersonResearchInput, donorInfo?: DonorInfo | null): Promise<PersonResearchResult> {
    this.validateInput(input);

    const { researchTopic, organizationId, userId } = input;

    logger.info(
      `Starting person research for topic: "${researchTopic}" (organization: ${organizationId}, user: ${userId})`
    );

    // Initialize token usage tracking
    const tokenUsage = createEmptyResearchTokenUsage();

    // Track person identity for filtering relevant content
    let personIdentity: PersonIdentity | undefined = undefined;

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
        ...(donorInfo && { donorInfo }),
      });

      // Accumulate query generation tokens
      tokenUsage.queryGeneration = addTokenUsage(tokenUsage.queryGeneration, initialQueries.tokenUsage);

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
          personIdentity, // Include person identity for filtering if available
        });

        // On first loop, try to extract person identity if we have donor info
        if (currentLoop === 1 && donorInfo && !personIdentity) {
          try {
            // Get some initial search results to help with identification
            const initialSearchResults = searchResults.results.flatMap((r) => r.sources).slice(0, 3); // Just use a few results

            // Extract person identity
            const { identity, tokenUsage: identityTokenUsage } =
              await this.personIdentificationService.extractPersonIdentity(donorInfo, initialSearchResults);

            personIdentity = identity;

            // Add to token usage
            tokenUsage.personIdentification = identityTokenUsage;

            logger.info(
              `[Person Identification] Extracted identity for ${donorInfo.fullName} with ${
                personIdentity.keyIdentifiers.length
              } key identifiers and ${personIdentity.confidence * 100}% confidence`
            );
            logger.info(`Person identity: ${JSON.stringify(personIdentity)}`);
          } catch (error) {
            logger.warn(
              `[Person Identification] Failed to extract identity: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            // Continue without person identity - won't filter results
          }
        }

        // Accumulate web search summary tokens
        tokenUsage.webSearchSummaries = addTokenUsage(tokenUsage.webSearchSummaries, searchResults.totalTokenUsage);

        // Add results to our collection
        allSummaries.push(...searchResults.results);

        const filteredMsg = searchResults.totalFilteredSources
          ? ` (${searchResults.totalFilteredSources} sources filtered out as irrelevant)`
          : "";

        logger.info(
          `[Research Loop ${currentLoop}] Collected ${searchResults.results.length} search results with ${searchResults.totalSources} sources${filteredMsg} (total summaries: ${allSummaries.length})`
        );

        // Stage 3: Reflection & Gap Analysis (except on final loop)
        if (currentLoop < this.MAX_RESEARCH_LOOPS) {
          logger.info(`[Research Loop ${currentLoop}] Analyzing results for knowledge gaps`);

          const reflection = await this.reflectionService.analyzeResults({
            researchTopic,
            summaries: allSummaries,
          });

          // Accumulate reflection tokens
          tokenUsage.reflection = addTokenUsage(tokenUsage.reflection, reflection.tokenUsage);

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
              ...(donorInfo && { donorInfo }),
            });

            // Accumulate additional query generation tokens
            tokenUsage.queryGeneration = addTokenUsage(tokenUsage.queryGeneration, followUpQueries.tokenUsage);

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

      // Accumulate answer synthesis tokens
      tokenUsage.answerSynthesis = addTokenUsage(tokenUsage.answerSynthesis, finalAnswer.tokenUsage);

      // Stage 6: Structured Data Extraction
      logger.info(`Extracting structured data from research results`);

      const structuredDataResult = await this.structuredDataExtractionService.extractStructuredData({
        answer: finalAnswer.answer,
        summaries: allSummaries,
        researchTopic,
      });

      // Accumulate structured data extraction tokens
      tokenUsage.structuredDataExtraction = addTokenUsage(
        tokenUsage.structuredDataExtraction,
        structuredDataResult.tokenUsage
      );

      // Calculate total tokens including all stages
      const baseTokens = addTokenUsage(
        addTokenUsage(
          addTokenUsage(
            addTokenUsage(tokenUsage.queryGeneration, tokenUsage.webSearchSummaries),
            tokenUsage.reflection
          ),
          tokenUsage.answerSynthesis
        ),
        tokenUsage.structuredDataExtraction
      );

      // Add person identification tokens if available
      tokenUsage.total = tokenUsage.personIdentification
        ? addTokenUsage(baseTokens, tokenUsage.personIdentification)
        : baseTokens;

      const result: PersonResearchResult = {
        answer: finalAnswer.answer,
        citations: finalAnswer.citations,
        summaries: allSummaries,
        totalLoops: currentLoop,
        totalSources: allSummaries.reduce((total, summary) => total + summary.sources.length, 0),
        researchTopic,
        timestamp: new Date(),
        tokenUsage,
        personIdentity, // Include the extracted person identity
        structuredData: structuredDataResult.structuredData, // Include the structured data
      };

      // Log comprehensive token usage summary
      logger.info(
        `Person research completed successfully - Topic: "${researchTopic}", Loops: ${currentLoop}, Sources: ${result.totalSources}, Citations: ${finalAnswer.citations.length}`
      );

      const identificationLog = tokenUsage.personIdentification
        ? `, Person Identification: ${tokenUsage.personIdentification.totalTokens} tokens (${tokenUsage.personIdentification.promptTokens} input, ${tokenUsage.personIdentification.completionTokens} output)`
        : "";

      logger.info(
        `Token usage summary for "${researchTopic}": Query Generation: ${tokenUsage.queryGeneration.totalTokens} tokens (${tokenUsage.queryGeneration.promptTokens} input, ${tokenUsage.queryGeneration.completionTokens} output), Web Search Summaries: ${tokenUsage.webSearchSummaries.totalTokens} tokens (${tokenUsage.webSearchSummaries.promptTokens} input, ${tokenUsage.webSearchSummaries.completionTokens} output), Reflection: ${tokenUsage.reflection.totalTokens} tokens (${tokenUsage.reflection.promptTokens} input, ${tokenUsage.reflection.completionTokens} output), Answer Synthesis: ${tokenUsage.answerSynthesis.totalTokens} tokens (${tokenUsage.answerSynthesis.promptTokens} input, ${tokenUsage.answerSynthesis.completionTokens} output), Structured Data Extraction: ${tokenUsage.structuredDataExtraction.totalTokens} tokens (${tokenUsage.structuredDataExtraction.promptTokens} input, ${tokenUsage.structuredDataExtraction.completionTokens} output)${identificationLog}, TOTAL: ${tokenUsage.total.totalTokens} tokens (${tokenUsage.total.promptTokens} input, ${tokenUsage.total.completionTokens} output)`
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
