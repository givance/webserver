/**
 * Input for person research service
 */
export interface PersonResearchInput {
  researchTopic: string;
  organizationId: string;
  userId: string;
}

/**
 * Result from person research service
 */
export interface PersonResearchResult {
  answer: string;
  citations: Citation[];
  summaries: WebSearchResult[];
  totalLoops: number;
  totalSources: number;
  researchTopic: string;
  timestamp: Date;
}

/**
 * Research query with rationale
 */
export interface ResearchQuery {
  query: string;
  rationale: string;
}

/**
 * Query generation input
 */
export interface QueryGenerationInput {
  researchTopic: string;
  maxQueries: number;
  isFollowUp: boolean;
  previousQueries?: string[];
}

/**
 * Query generation result
 */
export interface QueryGenerationResult {
  queries: ResearchQuery[];
  rationale: string;
}

/**
 * Web search input
 */
export interface WebSearchInput {
  queries: ResearchQuery[];
  researchTopic: string;
}

/**
 * Web search result from Google Search API
 */
export interface GoogleSearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  formattedUrl: string;
  htmlTitle?: string;
  htmlSnippet?: string;
  htmlFormattedUrl?: string;
  pagemap?: {
    cse_thumbnail?: Array<{
      src: string;
      width: string;
      height: string;
    }>;
  };
}

/**
 * Crawled content from a webpage
 */
export interface CrawledContent {
  url: string;
  title: string;
  text: string;
  wordCount: number;
  crawlSuccess: boolean;
  errorMessage?: string;
  timestamp: Date;
}

/**
 * Enhanced search result with crawled content
 */
export interface EnhancedSearchResult extends GoogleSearchResult {
  crawledContent?: CrawledContent;
}

/**
 * Processed web search result with summary
 */
export interface WebSearchResult {
  query: string;
  summary: string;
  sources: EnhancedSearchResult[];
  timestamp: Date;
}

/**
 * Web search batch result
 */
export interface WebSearchBatchResult {
  results: WebSearchResult[];
  totalQueries: number;
  totalSources: number;
  totalCrawledPages: number;
}

/**
 * Reflection analysis input
 */
export interface ReflectionInput {
  researchTopic: string;
  summaries: WebSearchResult[];
}

/**
 * Reflection analysis result
 */
export interface ReflectionResult {
  isSufficient: boolean;
  knowledgeGap: string;
  followUpQueries: string[];
}

/**
 * Answer synthesis input
 */
export interface AnswerSynthesisInput {
  researchTopic: string;
  summaries: WebSearchResult[];
}

/**
 * Citation for sources
 */
export interface Citation {
  url: string;
  title: string;
  snippet: string;
  relevance: string;
  wordCount?: number;
}

/**
 * Answer synthesis result
 */
export interface AnswerSynthesisResult {
  answer: string;
  citations: Citation[];
}

/**
 * Google Custom Search API Response
 */
export interface GoogleSearchAPIResponse {
  kind: string;
  url: {
    type: string;
    template: string;
  };
  queries: {
    request: Array<{
      title: string;
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
      inputEncoding: string;
      outputEncoding: string;
      safe: string;
      cx: string;
    }>;
    nextPage?: Array<{
      title: string;
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
      inputEncoding: string;
      outputEncoding: string;
      safe: string;
      cx: string;
    }>;
  };
  context: {
    title: string;
  };
  searchInformation: {
    searchTime: number;
    formattedSearchTime: string;
    totalResults: string;
    formattedTotalResults: string;
  };
  items?: GoogleSearchResult[];
}

/**
 * Current date helper
 */
export function getCurrentDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Database schema for person research
 */
export interface PersonResearchDBRecord {
  id: number;
  donorId: number;
  organizationId: string;
  userId: string | null;
  researchTopic: string;
  researchData: PersonResearchResult; // The entire research result as JSON
  isLive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for saving person research to database
 */
export interface SavePersonResearchInput {
  donorId: number;
  organizationId: string;
  userId: string;
  researchResult: PersonResearchResult;
  setAsLive?: boolean; // Whether to mark this as the live version (default: true)
}

/**
 * Input for retrieving person research from database
 */
export interface GetPersonResearchInput {
  donorId: number;
  organizationId: string;
  version?: number; // If not provided, gets the live version
}
