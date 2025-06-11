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
  TokenUsage,
  createEmptyTokenUsage,
  addTokenUsage,
  PersonIdentity,
} from "./types";
import { WebCrawlerService } from "./web-crawler.service";
import { PersonIdentificationService } from "./person-identification.service";

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
  private readonly personIdentificationService: PersonIdentificationService;

  constructor() {
    this.webCrawler = new WebCrawlerService();
    this.personIdentificationService = new PersonIdentificationService();
  }

  /**
   * Executes parallel web searches and generates summaries for multiple queries
   * @param input - Web search input with queries and research topic
   * @returns Batch result with summaries for all queries
   */
  async conductParallelSearch(input: WebSearchInput): Promise<WebSearchBatchResult> {
    const { queries, researchTopic, personIdentity } = input;

    logger.info(
      `Starting parallel search for topic "${researchTopic}" with ${queries.length} queries: [${queries
        .map((q) => q.query)
        .join(", ")}]`
    );

    let totalTokenUsage = createEmptyTokenUsage();

    try {
      // Execute all searches in parallel
      const searchPromises = queries.map(async (queryObj) => {
        try {
          const searchResults = await this.executeGoogleSearch(queryObj.query);
          const enhancedResults = await this.enhanceWithCrawledContent(searchResults, queryObj.query);

          // Filter results if we have a person identity to verify against
          const filteredResults = personIdentity
            ? await this.filterResultsByRelevance(enhancedResults, personIdentity)
            : enhancedResults;

          const summaryResult = await this.generateSearchSummary(filteredResults, queryObj.query, researchTopic);

          // Add token usage from filtering process if applicable
          if (personIdentity) {
            totalTokenUsage = addTokenUsage(
              totalTokenUsage,
              summaryResult.filteringTokenUsage || createEmptyTokenUsage()
            );
          }

          const successfulCrawls = filteredResults.filter((r) => r.crawledContent?.crawlSuccess).length;
          logger.debug(
            `Query "${queryObj.query}" completed: ${filteredResults.length}/${enhancedResults.length} relevant results, ${successfulCrawls} successfully crawled, ${summaryResult.tokenUsage.totalTokens} tokens`
          );

          return {
            query: queryObj.query,
            summary: summaryResult.summary,
            sources: filteredResults,
            timestamp: new Date(),
            tokenUsage: summaryResult.tokenUsage,
            filteredSources: enhancedResults.length - filteredResults.length,
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
            tokenUsage: createEmptyTokenUsage(),
            filteredSources: 0,
          } as WebSearchResult;
        }
      });

      const results = await Promise.all(searchPromises);
      const successfulResults = results.filter((result) => result.sources.length > 0);
      const failedResults = results.filter((result) => result.sources.length === 0);
      const totalSources = successfulResults.reduce((sum, result) => sum + result.sources.length, 0);
      const totalFilteredSources = results.reduce((sum, result) => sum + (result.filteredSources || 0), 0);
      const totalCrawledPages = successfulResults.reduce(
        (sum, result) => sum + result.sources.filter((s) => s.crawledContent?.crawlSuccess).length,
        0
      );

      // Aggregate token usage
      totalTokenUsage = results.reduce((sum, result) => addTokenUsage(sum, result.tokenUsage), totalTokenUsage);

      logger.info(
        `Parallel search completed for "${researchTopic}": ${successfulResults.length}/${queries.length} successful queries, ${failedResults.length} failed, ${totalSources} total sources (${totalFilteredSources} filtered out), ${totalCrawledPages} pages crawled, ${totalTokenUsage.totalTokens} total tokens`
      );

      return {
        results,
        totalQueries: queries.length,
        totalSources,
        totalCrawledPages,
        totalFilteredSources,
        totalTokenUsage,
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
   * Filters search results by relevance to the person identity
   * @param enhancedResults - Search results with crawled content
   * @param personIdentity - Person identity to verify against
   * @returns Filtered search results containing only relevant content
   */
  private async filterResultsByRelevance(
    enhancedResults: EnhancedSearchResult[],
    personIdentity: PersonIdentity
  ): Promise<EnhancedSearchResult[]> {
    if (!personIdentity || personIdentity.confidence < 0.3) {
      logger.debug(
        `Skipping content filtering - insufficient identity information (confidence: ${
          personIdentity?.confidence || 0
        })`
      );
      return enhancedResults;
    }

    logger.debug(`Filtering ${enhancedResults.length} search results for relevance to ${personIdentity.fullName}`);

    let filteringTokenUsage = createEmptyTokenUsage();
    const relevantResults: EnhancedSearchResult[] = [];
    const filterPromises = enhancedResults.map(async (result) => {
      // Skip verification if no crawled content - will rely on just title/snippet
      if (!result.crawledContent?.crawlSuccess) {
        return { result, isRelevant: true, tokenUsage: createEmptyTokenUsage() };
      }

      try {
        const { verification, tokenUsage } = await this.personIdentificationService.verifySearchResultRelevance(
          personIdentity,
          result
        );

        return {
          result,
          isRelevant: verification.isRelevant && verification.confidence >= 0.5,
          tokenUsage,
        };
      } catch (error) {
        logger.warn(
          `Failed to verify relevance for ${result.title} - including by default: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return { result, isRelevant: true, tokenUsage: createEmptyTokenUsage() };
      }
    });

    const filterResults = await Promise.all(filterPromises);

    for (const { result, isRelevant, tokenUsage } of filterResults) {
      if (isRelevant) {
        relevantResults.push(result);
      }
      filteringTokenUsage = addTokenUsage(filteringTokenUsage, tokenUsage);
    }

    const filteredCount = enhancedResults.length - relevantResults.length;
    logger.info(
      `Content filtering complete: ${relevantResults.length}/${enhancedResults.length} results kept, ${filteredCount} filtered out (${filteringTokenUsage.totalTokens} tokens used)`
    );

    return relevantResults;
  }

  /**
   * Generates a summary of search results using AI with crawled content
   * @param searchResults - Enhanced search results with crawled content
   * @param query - Original search query
   * @param researchTopic - Overall research topic for context
   * @returns AI-generated summary with token usage
   */
  private async generateSearchSummary(
    searchResults: EnhancedSearchResult[],
    query: string,
    researchTopic: string
  ): Promise<{ summary: string; tokenUsage: TokenUsage; filteringTokenUsage?: TokenUsage }> {
    if (searchResults.length === 0) {
      return {
        summary: "No search results were found for this query.",
        tokenUsage: createEmptyTokenUsage(),
      };
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

      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      logger.debug(
        `Generated summary for query "${query}": ${result.text.length} characters, ${tokenUsage.totalTokens} tokens`
      );

      return {
        summary: result.text,
        tokenUsage,
      };
    } catch (error) {
      logger.error(
        `Summary generation failed for query "${query}": ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        summary: this.generateBasicSummary(searchResults, query),
        tokenUsage: createEmptyTokenUsage(),
      };
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
