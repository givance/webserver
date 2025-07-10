import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { createAzure } from '@ai-sdk/azure';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  QueryGenerationInput,
  QueryGenerationResult,
  getCurrentDate,
  TokenUsage,
  createEmptyTokenUsage,
  DonorInfo,
} from './types';

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Query generation response schema
const QueryGenerationSchema = z.object({
  rationale: z.string().describe('Brief explanation of why these queries are relevant'),
  query: z.array(z.string()).describe('A list of search queries'),
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
    const { researchTopic, maxQueries, isFollowUp, previousQueries = [], donorInfo } = input;

    const queryType = isFollowUp ? 'follow-up' : 'initial';
    const previousContext = isFollowUp
      ? ` (after ${previousQueries.length} previous queries: [${previousQueries.join(', ')}])`
      : '';

    logger.info(
      `Generating ${queryType} queries for topic "${researchTopic}"${previousContext} - max ${maxQueries} queries`
    );

    try {
      // Start with specific queries if donor info is available and this is the initial query generation
      const specificQueries: { query: string; rationale: string }[] = [];

      if (!isFollowUp && donorInfo) {
        // Always add full name + location query using state first, then address as fallback
        const location = donorInfo.state || donorInfo.address;
        if (location) {
          specificQueries.push({
            query: `${donorInfo.fullName} ${location}`,
            rationale: 'Direct search using full name and location for precise identification',
          });
        }

        // Always add full name + email query if email is available
        if (donorInfo.email) {
          specificQueries.push({
            query: `${donorInfo.fullName} ${donorInfo.email}`,
            rationale: 'Direct search using full name and email address for precise identification',
          });
        }
      }

      const prompt = this.buildQueryGenerationPrompt(
        researchTopic,
        maxQueries,
        isFollowUp,
        previousQueries
      );

      logger.debug(
        `Sending query generation request to AI model for ${queryType} queries on topic: "${researchTopic}"`
      );

      const result = await generateObject({
        model: azure(env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME),
        schema: QueryGenerationSchema,
        prompt,
        temperature: 0.7, // Allow some creativity in query generation
      });

      // Capture token usage
      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      // Convert AI-generated queries to ResearchQuery format
      const aiQueries = result.object.query.map((query) => ({
        query,
        rationale: result.object.rationale,
      }));

      // Combine specific queries (at the beginning) with AI-generated queries
      const allQueries = [...specificQueries, ...aiQueries];

      // Limit to maxQueries total
      const queries = allQueries.slice(0, maxQueries);

      logger.info(
        `Generated ${queries.length} ${queryType} queries for topic "${researchTopic}": [${queries
          .map((q) => q.query)
          .join(', ')}] (tokens: ${tokenUsage.totalTokens})${
          specificQueries.length > 0
            ? ` (${specificQueries.length} specific name-based queries included)`
            : ''
        }`
      );

      return {
        queries,
        rationale: result.object.rationale,
        tokenUsage,
      };
    } catch (error) {
      logger.error(
        `Query generation failed for topic "${researchTopic}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(
        `Query generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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

    let prompt = `Your goal is to generate natural, concise web search queries that real people would actually use. These queries will be used by an automated web research tool.

Instructions:
- Generate ${maxQueries} or fewer simple, natural search queries
- Write queries like a human would actually search (short and direct)
- Each query should explore a different angle of the research topic
- Keep queries brief - typically 2-5 words unless absolutely necessary to be longer
- Avoid redundant or overly similar queries
- Think about how real people search, not how you think search engines work
- Current date: ${currentDate}

Examples of GOOD vs BAD queries:
- GOOD: "John Smith CEO", BAD: "John Smith chief executive officer biography and leadership profile"
- GOOD: "Tesla earnings 2024", BAD: "Tesla quarterly financial performance and revenue growth 2024"
- GOOD: "climate change causes", BAD: "environmental factors contributing to global climate change phenomenon"`;

    if (isFollowUp && previousQueries.length > 0) {
      prompt += `

FOLLOW-UP CONTEXT:
- You already searched: [${previousQueries.join(', ')}]
- Now generate different, simple queries to find more info
- Don't repeat what you already searched
- Keep it natural and short - just like humans would search for more details`;
    } else {
      prompt += `

INITIAL RESEARCH:
- This is your first search on this topic
- Generate simple queries covering different angles
- Think like a human doing basic research - start with obvious searches`;
    }

    prompt += `

QUERY OPTIMIZATION:
- Use natural language that humans actually type into search boxes
- Prefer common words over technical jargon unless the jargon is essential
- Remember: shorter is almost always better

Research Topic: ${researchTopic}

Format your response as a JSON object with these exact keys:
- "rationale": Brief explanation of your query selection strategy
- "query": Array of ${maxQueries} or fewer natural search queries

Example Response:
\`\`\`json
{
    "rationale": "These queries cover different angles: company overview, recent performance, and stock trends using natural search terms.",
    "query": ["Apple revenue 2024", "iPhone sales 2024", "Apple stock 2024"]
}
\`\`\``;

    return prompt;
  }
}
