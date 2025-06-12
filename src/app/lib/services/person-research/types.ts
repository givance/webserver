/**
 * Input for person research service
 */
export interface PersonResearchInput {
  researchTopic: string;
  organizationId: string;
  userId: string;
}

/**
 * Token usage information from AI API calls
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Aggregated token usage for different stages of research
 */
export interface ResearchTokenUsage {
  queryGeneration: TokenUsage;
  webSearchSummaries: TokenUsage;
  reflection: TokenUsage;
  answerSynthesis: TokenUsage;
  personIdentification?: TokenUsage; // Person identification token usage
  structuredDataExtraction: TokenUsage; // NEW: Structured data extraction token usage
  total: TokenUsage;
}

/**
 * Structured data extracted from person research
 */
export interface PersonResearchData {
  inferredAge?: number | null;
  employer?: string | null;
  estimatedIncome?: string | null; // e.g., "$50,000-$75,000", "Not disclosed", etc.
  highPotentialDonor: boolean;
  highPotentialDonorRationale: string;
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
  tokenUsage: ResearchTokenUsage;
  personIdentity?: PersonIdentity; // Optional extracted person identity
  structuredData: PersonResearchData; // NEW: Structured extracted data
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
  donorInfo?: DonorInfo; // Optional donor info for generating specific name-based queries
}

/**
 * Query generation result
 */
export interface QueryGenerationResult {
  queries: ResearchQuery[];
  rationale: string;
  tokenUsage: TokenUsage;
}

/**
 * Input for web search operations
 */
export interface WebSearchInput {
  queries: ResearchQuery[];
  researchTopic: string;
  personIdentity?: PersonIdentity; // Optional person identity for relevance filtering
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
 * Result of a web search including AI-generated summary
 */
export interface WebSearchResult {
  query: string;
  summary: string;
  sources: EnhancedSearchResult[];
  timestamp: Date;
  tokenUsage: TokenUsage;
  filteredSources?: number; // Number of sources filtered out due to lack of relevance
}

/**
 * Result of a batch of web searches
 */
export interface WebSearchBatchResult {
  results: WebSearchResult[];
  totalQueries: number;
  totalSources: number;
  totalCrawledPages: number;
  totalFilteredSources?: number; // Total number of sources filtered out
  totalTokenUsage: TokenUsage;
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
  tokenUsage: TokenUsage;
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
  tokenUsage: TokenUsage;
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

/**
 * Helper function to create empty token usage
 */
export function createEmptyTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

/**
 * Helper function to add token usage together
 */
export function addTokenUsage(usage1: TokenUsage, usage2: TokenUsage): TokenUsage {
  return {
    promptTokens: usage1.promptTokens + usage2.promptTokens,
    completionTokens: usage1.completionTokens + usage2.completionTokens,
    totalTokens: usage1.totalTokens + usage2.totalTokens,
  };
}

/**
 * Helper function to create empty research token usage
 */
export function createEmptyResearchTokenUsage(): ResearchTokenUsage {
  return {
    queryGeneration: createEmptyTokenUsage(),
    webSearchSummaries: createEmptyTokenUsage(),
    reflection: createEmptyTokenUsage(),
    answerSynthesis: createEmptyTokenUsage(),
    personIdentification: createEmptyTokenUsage(), // Initialize with empty usage
    structuredDataExtraction: createEmptyTokenUsage(), // Initialize with empty usage
    total: createEmptyTokenUsage(),
  };
}

/**
 * Donor information used for identity extraction
 */
export interface DonorInfo {
  fullName: string;
  location?: string;
  notes?: string;
  email?: string; // NEW: Email for specific queries
  address?: string; // NEW: Address for specific queries
  state?: string; // NEW: State for specific queries when city not available
}

/**
 * Extracted person identity information
 */
export interface PersonIdentity {
  fullName: string;
  probableAge?: string;
  location?: string;
  profession?: string;
  education?: string;
  organizations?: string;
  keyIdentifiers: string[];
  confidence: number;
  reasoning: string;
  extractedFrom: string;
}

/**
 * Result of verifying a search result for relevance to a person
 */
export interface VerificationResult {
  isRelevant: boolean;
  confidence: number;
  matchingIdentifiers: string[];
  contradictions: string[];
  reasoning: string;
  sourceUrl: string;
  sourceTitle: string;
}
