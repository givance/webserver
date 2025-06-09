import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import { z } from "zod";
import { QueryGenerationInput, QueryGenerationResult, getCurrentDate } from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Query generation response schema
const QueryGenerationSchema = z.object({
  rationale: z.string().describe("Brief explanation of why these queries are relevant"),
  query: z.array(z.string()).describe("A list of search queries"),
});

/**
 * Service for generating optimized search queries using AI
 */
export class QueryGenerationService {
  /**
   * Generates optimized search queries for research topics
   * @param input - Query generation parameters
   * @returns Generated queries with rationale
   */
  async generateQueries(input: QueryGenerationInput): Promise<QueryGenerationResult> {
    const { researchTopic, maxQueries, isFollowUp, previousQueries = [] } = input;

    logger.info(
      `[Query Generation] Generating ${
        isFollowUp ? "follow-up" : "initial"
      } queries for research topic: "${researchTopic}" (max: ${maxQueries})`
    );

    try {
      const prompt = this.buildQueryGenerationPrompt(researchTopic, maxQueries, isFollowUp, previousQueries);

      logger.info(`[Query Generation] Sending query generation request to AI model for topic: "${researchTopic}"`);

      const result = await generateObject({
        model: azure(env.MID_MODEL),
        schema: QueryGenerationSchema,
        prompt,
        temperature: 0.7, // Allow some creativity in query generation
      });

      // Convert to ResearchQuery format
      const queries = result.object.query.slice(0, maxQueries).map((query) => ({
        query,
        rationale: result.object.rationale,
      }));

      logger.info(`[Query Generation] Generated ${queries.length} queries: ${queries.map((q) => q.query).join(", ")}`);

      return {
        queries,
        rationale: result.object.rationale,
      };
    } catch (error) {
      logger.error(
        `Failed to generate queries for topic "${researchTopic}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(`Query generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Builds the prompt for query generation
   */
  private buildQueryGenerationPrompt(
    researchTopic: string,
    maxQueries: number,
    isFollowUp: boolean,
    previousQueries: string[]
  ): string {
    const currentDate = getCurrentDate();

    let prompt = `Your goal is to generate sophisticated and diverse web search queries. These queries are intended for an advanced automated web research tool capable of analyzing complex results, following links, and synthesizing information.

Instructions:
- Always prefer a single search query, only add another query if the original question requests multiple aspects or elements and one query is not enough.
- Each query should focus on one specific aspect of the original question.
- Don't produce more than ${maxQueries} queries.
- Queries should be diverse, if the topic is broad, generate more than 1 query.
- Don't generate multiple similar queries, 1 is enough.
- Query should ensure that the most current information is gathered. The current date is ${currentDate}.`;

    if (isFollowUp && previousQueries.length > 0) {
      prompt += `
- This is a follow-up search to address knowledge gaps from previous research.
- Previous queries were: ${previousQueries.join(", ")}
- Generate new queries that complement the previous ones and address different aspects.`;
    }

    prompt += `

Format: 
- Format your response as a JSON object with ALL three of these exact keys:
   - "rationale": Brief explanation of why these queries are relevant
   - "query": A list of search queries

Example:

Topic: What revenue grew more last year apple stock or the number of people buying an iphone
\`\`\`json
{
    "rationale": "To answer this comparative growth question accurately, we need specific data points on Apple's stock performance and iPhone sales metrics. These queries target the precise financial information needed: company revenue trends, product-specific unit sales figures, and stock price movement over the same fiscal period for direct comparison.",
    "query": ["Apple total revenue growth fiscal year 2024", "iPhone unit sales growth fiscal year 2024", "Apple stock price growth fiscal year 2024"],
}
\`\`\`

Context: ${researchTopic}`;

    return prompt;
  }
}
