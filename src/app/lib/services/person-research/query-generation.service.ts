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

    const queryType = isFollowUp ? "follow-up" : "initial";
    const previousContext = isFollowUp
      ? ` (after ${previousQueries.length} previous queries: [${previousQueries.join(", ")}])`
      : "";

    logger.info(
      `Generating ${queryType} queries for topic "${researchTopic}"${previousContext} - max ${maxQueries} queries`
    );

    try {
      const prompt = this.buildQueryGenerationPrompt(researchTopic, maxQueries, isFollowUp, previousQueries);

      logger.debug(
        `Sending query generation request to AI model for ${queryType} queries on topic: "${researchTopic}"`
      );

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

      logger.info(
        `Generated ${queries.length} ${queryType} queries for topic "${researchTopic}": [${queries
          .map((q) => q.query)
          .join(", ")}]`
      );

      return {
        queries,
        rationale: result.object.rationale,
      };
    } catch (error) {
      logger.error(
        `Query generation failed for topic "${researchTopic}": ${
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

    let prompt = `Your goal is to generate sophisticated and diverse web search queries for comprehensive research. These queries will be used by an advanced automated web research tool that crawls webpages and extracts full content.

Instructions:
- Generate ${maxQueries} or fewer high-quality search queries
- Each query should target a specific aspect of the research topic
- Queries should be optimized for web search engines (concise but specific)
- Avoid redundant or overly similar queries
- Focus on finding authoritative, recent, and comprehensive sources
- Current date: ${currentDate}`;

    if (isFollowUp && previousQueries.length > 0) {
      prompt += `

FOLLOW-UP CONTEXT:
- This is a follow-up search to address knowledge gaps from previous research
- Previous queries were: [${previousQueries.join(", ")}]
- Generate NEW queries that complement previous ones and explore different angles
- Avoid duplicating or closely replicating previous query approaches
- Focus on specific gaps or aspects not adequately covered before`;
    } else {
      prompt += `

INITIAL RESEARCH:
- This is the initial research phase for comprehensive topic coverage
- Generate diverse queries that cover different aspects of the topic
- Balance broad overview queries with specific detailed queries`;
    }

    prompt += `

QUERY OPTIMIZATION:
- Make queries specific enough to find relevant content but broad enough to capture comprehensive information
- Include relevant keywords, technical terms, and context where appropriate
- Example transformation: "Tell me about Steve Jobs" → "Steve Jobs Apple founder biography"

Research Topic: ${researchTopic}

Format your response as a JSON object with these exact keys:
- "rationale": Brief explanation of your query selection strategy
- "query": Array of ${maxQueries} or fewer optimized search queries

Example Response:
\`\`\`json
{
    "rationale": "These queries target different aspects: company financial performance, product-specific metrics, and stock market data for comprehensive comparison analysis.",
    "query": ["Apple total revenue growth fiscal year 2024", "iPhone unit sales growth fiscal year 2024", "Apple stock price performance 2024"]
}
\`\`\``;

    return prompt;
  }
}
