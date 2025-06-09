import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import {
  WebSearchInput,
  WebSearchBatchResult,
  GoogleSearchAPIResponse,
  GoogleSearchResult,
  WebSearchResult,
  getCurrentDate,
} from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

/**
 * Service for conducting web searches using Google Custom Search API
 */
export class WebSearchService {
  private readonly GOOGLE_SEARCH_API_URL = "https://www.googleapis.com/customsearch/v1";
  private readonly MAX_RESULTS_PER_QUERY = 10;

  /**
   * Conducts parallel web searches for multiple queries
   * @param input - Search input with queries and research topic
   * @returns Batch results with summaries and citations
   */
  async conductParallelSearch(input: WebSearchInput): Promise<WebSearchBatchResult> {
    const { queries, researchTopic } = input;

    logger.info(`Conducting parallel search for ${queries.length} queries on topic: "${researchTopic}"`);

    try {
      // Execute all searches in parallel
      const searchPromises = queries.map(async (queryObj) => {
        try {
          const searchResults = await this.executeGoogleSearch(queryObj.query);
          const summary = await this.generateSearchSummary(searchResults, queryObj.query, researchTopic);

          return {
            query: queryObj.query,
            summary,
            sources: searchResults,
            timestamp: new Date(),
          } as WebSearchResult;
        } catch (error) {
          logger.error(
            `Search failed for query "${queryObj.query}": ${error instanceof Error ? error.message : String(error)}`
          );
          // Return empty result for failed searches to not break the batch
          return {
            query: queryObj.query,
            summary: `Search failed for this query: ${error instanceof Error ? error.message : "Unknown error"}`,
            sources: [],
            timestamp: new Date(),
          } as WebSearchResult;
        }
      });

      const results = await Promise.all(searchPromises);
      const successfulResults = results.filter((result) => result.sources.length > 0);
      const failedResults = results.filter((result) => result.sources.length === 0);
      const totalSources = successfulResults.reduce((sum, result) => sum + result.sources.length, 0);

      logger.info(
        `[Web Search] Completed parallel search - ${successfulResults.length}/${queries.length} successful queries, ${failedResults.length} failed, ${totalSources} total sources found for topic: "${researchTopic}"`
      );

      return {
        results,
        totalQueries: queries.length,
        totalSources,
      };
    } catch (error) {
      logger.error(`Parallel search failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Web search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Executes a single Google search using Custom Search API
   * @param query - Search query
   * @returns Array of search results
   */
  private async executeGoogleSearch(query: string): Promise<GoogleSearchResult[]> {
    logger.info(`Executing Google search for: "${query}"`);

    const searchParams = new URLSearchParams({
      key: env.GOOGLE_SEARCH_API_KEY,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID || "017576662512468239146:omuauf_lfve", // Default public search engine
      q: query,
      num: this.MAX_RESULTS_PER_QUERY.toString(),
    });

    const searchUrl = `${this.GOOGLE_SEARCH_API_URL}?${searchParams.toString()}`;

    try {
      const response = await fetch(searchUrl);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Search API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: GoogleSearchAPIResponse = await response.json();

      if (!data.items || data.items.length === 0) {
        logger.warn(`No search results found for query: "${query}"`);
        return [];
      }

      logger.info(`Found ${data.items.length} results for query: "${query}"`);
      return data.items;
    } catch (error) {
      logger.error(
        `Google search execution failed for query "${query}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Generates a summary of search results using AI
   * @param searchResults - Raw search results from Google
   * @param query - Original search query
   * @param researchTopic - Overall research topic for context
   * @returns AI-generated summary
   */
  private async generateSearchSummary(
    searchResults: GoogleSearchResult[],
    query: string,
    researchTopic: string
  ): Promise<string> {
    if (searchResults.length === 0) {
      return "No search results were found for this query.";
    }

    logger.info(`Generating summary for ${searchResults.length} search results from query: "${query}"`);

    try {
      const prompt = this.buildSummaryPrompt(searchResults, query, researchTopic);

      const result = await generateText({
        model: azure(env.MID_MODEL),
        prompt,
        temperature: 0.3, // Lower temperature for factual summaries
      });

      logger.info(`Generated summary for query "${query}" (${result.text.length} characters)`);
      return result.text;
    } catch (error) {
      logger.error(
        `Summary generation failed for query "${query}": ${error instanceof Error ? error.message : String(error)}`
      );
      // Return a basic summary if AI summarization fails
      return this.generateBasicSummary(searchResults, query);
    }
  }

  /**
   * Builds the prompt for AI summarization
   */
  private buildSummaryPrompt(searchResults: GoogleSearchResult[], query: string, researchTopic: string): string {
    const currentDate = getCurrentDate();

    const searchResultsText = searchResults
      .map((result, index) => `[${index + 1}] ${result.title}\n${result.snippet}\nSource: ${result.link}\n`)
      .join("\n");

    return `Conduct targeted Google Searches to gather the most recent, credible information on "${researchTopic}" and synthesize it into a verifiable text artifact.

Instructions:
- Query should ensure that the most current information is gathered. The current date is ${currentDate}.
- Conduct multiple, diverse searches to gather comprehensive information.
- Consolidate key findings while meticulously tracking the source(s) for each specific piece of information.
- The output should be a well-written summary or report based on your search findings. 
- Only include the information found in the search results, don't make up any information.

Research Topic:
${researchTopic}

Search Query:
${query}

Search Results:
${searchResultsText}

Please provide a comprehensive summary of the key findings from these search results, focusing on information relevant to the research topic "${researchTopic}". Include specific details and maintain accuracy to the source material.`;
  }

  /**
   * Generates a basic summary when AI summarization fails
   */
  private generateBasicSummary(searchResults: GoogleSearchResult[], query: string): string {
    const topResults = searchResults.slice(0, 3);
    const summaryParts = topResults.map((result, index) => `${index + 1}. ${result.title}: ${result.snippet}`);

    return `Search results for "${query}":\n\n${summaryParts.join("\n\n")}`;
  }
}
