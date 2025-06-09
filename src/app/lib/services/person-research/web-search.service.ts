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
  EnhancedSearchResult,
  getCurrentDate,
} from "./types";
import { WebCrawlerService } from "./web-crawler.service";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

/**
 * Service for conducting web searches using Google Custom Search API with content crawling
 */
export class WebSearchService {
  private readonly GOOGLE_SEARCH_API_URL = "https://www.googleapis.com/customsearch/v1";
  private readonly MAX_RESULTS_PER_QUERY = 6; // Reduced to focus on quality over quantity
  private readonly MAX_CRAWL_URLS = 4; // Limit concurrent crawling
  private readonly webCrawler: WebCrawlerService;

  constructor() {
    this.webCrawler = new WebCrawlerService();
  }

  /**
   * Conducts parallel web searches for multiple queries with content crawling
   * @param input - Search input with queries and research topic
   * @returns Batch results with summaries and citations
   */
  async conductParallelSearch(input: WebSearchInput): Promise<WebSearchBatchResult> {
    const { queries, researchTopic } = input;

    logger.info(
      `Starting parallel search for topic "${researchTopic}" with ${queries.length} queries: [${queries
        .map((q) => q.query)
        .join(", ")}]`
    );

    try {
      // Execute all searches in parallel
      const searchPromises = queries.map(async (queryObj) => {
        try {
          const searchResults = await this.executeGoogleSearch(queryObj.query);
          const enhancedResults = await this.enhanceWithCrawledContent(searchResults, queryObj.query);
          const summary = await this.generateSearchSummary(enhancedResults, queryObj.query, researchTopic);

          const successfulCrawls = enhancedResults.filter((r) => r.crawledContent?.crawlSuccess).length;
          logger.debug(
            `Query "${queryObj.query}" completed: ${enhancedResults.length} results, ${successfulCrawls} successfully crawled`
          );

          return {
            query: queryObj.query,
            summary,
            sources: enhancedResults,
            timestamp: new Date(),
          } as WebSearchResult;
        } catch (error) {
          logger.error(
            `Search failed for query "${queryObj.query}": ${error instanceof Error ? error.message : String(error)}`
          );
          return {
            query: queryObj.query,
            summary: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            sources: [],
            timestamp: new Date(),
          } as WebSearchResult;
        }
      });

      const results = await Promise.all(searchPromises);
      const successfulResults = results.filter((result) => result.sources.length > 0);
      const failedResults = results.filter((result) => result.sources.length === 0);
      const totalSources = successfulResults.reduce((sum, result) => sum + result.sources.length, 0);
      const totalCrawledPages = successfulResults.reduce(
        (sum, result) => sum + result.sources.filter((s) => s.crawledContent?.crawlSuccess).length,
        0
      );

      logger.info(
        `Parallel search completed for "${researchTopic}": ${successfulResults.length}/${queries.length} successful queries, ${failedResults.length} failed, ${totalSources} total sources, ${totalCrawledPages} pages crawled`
      );

      return {
        results,
        totalQueries: queries.length,
        totalSources,
        totalCrawledPages,
      };
    } catch (error) {
      logger.error(
        `Parallel search failed for topic "${researchTopic}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(`Web search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Executes a single Google search using Custom Search API
   * @param query - Search query
   * @returns Array of search results
   */
  private async executeGoogleSearch(query: string): Promise<GoogleSearchResult[]> {
    logger.debug(`Executing Google search for query: "${query}"`);

    const searchParams = new URLSearchParams({
      key: env.GOOGLE_SEARCH_API_KEY,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID || "017576662512468239146:omuauf_lfve",
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

      logger.debug(`Google search found ${data.items.length} results for query: "${query}"`);
      return data.items;
    } catch (error) {
      logger.error(
        `Google search failed for query "${query}": ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Enhances search results with crawled content
   * @param searchResults - Raw search results from Google
   * @param query - Original search query for context
   * @returns Enhanced search results with crawled content
   */
  private async enhanceWithCrawledContent(
    searchResults: GoogleSearchResult[],
    query: string
  ): Promise<EnhancedSearchResult[]> {
    if (searchResults.length === 0) {
      return [];
    }

    logger.debug(`Enhancing ${searchResults.length} search results with crawled content for query: "${query}"`);

    // Limit crawling to prevent overwhelming target sites
    const urlsToCrawl = searchResults.slice(0, this.MAX_CRAWL_URLS).map((result) => result.link);

    const crawledContent = await this.webCrawler.crawlUrls(urlsToCrawl);
    const crawledContentMap = new Map(crawledContent.map((content) => [content.url, content]));

    const enhancedResults: EnhancedSearchResult[] = searchResults.map((result) => ({
      ...result,
      crawledContent: crawledContentMap.get(result.link),
    }));

    const successfulCrawls = enhancedResults.filter((r) => r.crawledContent?.crawlSuccess).length;
    const totalWords = enhancedResults
      .filter((r) => r.crawledContent?.crawlSuccess)
      .reduce((sum, r) => sum + (r.crawledContent?.wordCount || 0), 0);

    logger.debug(
      `Content enhancement completed for query "${query}": ${successfulCrawls}/${Math.min(
        searchResults.length,
        this.MAX_CRAWL_URLS
      )} pages crawled, ${totalWords} total words extracted`
    );

    return enhancedResults;
  }

  /**
   * Generates a summary of search results using AI with crawled content
   * @param searchResults - Enhanced search results with crawled content
   * @param query - Original search query
   * @param researchTopic - Overall research topic for context
   * @returns AI-generated summary
   */
  private async generateSearchSummary(
    searchResults: EnhancedSearchResult[],
    query: string,
    researchTopic: string
  ): Promise<string> {
    if (searchResults.length === 0) {
      return "No search results were found for this query.";
    }

    const crawledResults = searchResults.filter((result) => result.crawledContent?.crawlSuccess);
    const totalWords = crawledResults.reduce((sum, result) => sum + (result.crawledContent?.wordCount || 0), 0);

    logger.debug(
      `Generating summary for query "${query}": ${searchResults.length} total results, ${crawledResults.length} with crawled content (${totalWords} words)`
    );

    try {
      const prompt = this.buildSummaryPrompt(searchResults, query, researchTopic);

      const result = await generateText({
        model: azure(env.MID_MODEL),
        prompt,
        temperature: 0.3,
      });

      logger.debug(`Generated summary for query "${query}": ${result.text.length} characters`);
      return result.text;
    } catch (error) {
      logger.error(
        `Summary generation failed for query "${query}": ${error instanceof Error ? error.message : String(error)}`
      );
      return this.generateBasicSummary(searchResults, query);
    }
  }

  /**
   * Builds the prompt for AI summarization with crawled content
   */
  private buildSummaryPrompt(searchResults: EnhancedSearchResult[], query: string, researchTopic: string): string {
    const currentDate = getCurrentDate();

    const searchResultsText = searchResults
      .map((result, index) => {
        let resultText = `[${index + 1}] ${result.title}\nURL: ${result.link}\nSnippet: ${result.snippet}`;

        if (result.crawledContent?.crawlSuccess && result.crawledContent.text) {
          resultText += `\nFull Content (${result.crawledContent.wordCount} words):\n${result.crawledContent.text}`;
        } else if (result.crawledContent?.errorMessage) {
          resultText += `\nCrawl Error: ${result.crawledContent.errorMessage}`;
        }

        return resultText + "\n";
      })
      .join("\n---\n\n");

    return `You are conducting research on "${researchTopic}" using web search results and crawled content.

Instructions:
- Current date: ${currentDate}
- Prioritize information from crawled content over search snippets when available
- Synthesize comprehensive information from both search snippets and full webpage content
- Only include verifiable information from the provided sources
- Focus on details most relevant to the research topic
- Maintain accuracy and cite specific information appropriately

Research Topic: ${researchTopic}
Search Query: ${query}

Search Results and Content:
${searchResultsText}

Provide a comprehensive, well-structured summary that synthesizes all available information from both search snippets and crawled content. Focus on information that directly addresses the research topic "${researchTopic}".`;
  }

  /**
   * Generates a basic summary when AI summarization fails
   */
  private generateBasicSummary(searchResults: EnhancedSearchResult[], query: string): string {
    const topResults = searchResults.slice(0, 3);
    const summaryParts = topResults.map((result, index) => {
      let summary = `${index + 1}. ${result.title}: ${result.snippet}`;
      if (result.crawledContent?.crawlSuccess && result.crawledContent.text) {
        const truncatedContent =
          result.crawledContent.text.length > 200
            ? result.crawledContent.text.substring(0, 200) + "..."
            : result.crawledContent.text;
        summary += `\n   Additional content: ${truncatedContent}`;
      }
      return summary;
    });

    return `Search results for "${query}":\n\n${summaryParts.join("\n\n")}`;
  }
}
