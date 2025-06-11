import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import { z } from "zod";
import {
  TokenUsage,
  createEmptyTokenUsage,
  DonorInfo,
  EnhancedSearchResult,
  PersonIdentity,
  VerificationResult,
} from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Schema for person identity extraction
const PersonIdentitySchema = z.object({
  fullName: z.string().describe("The person's full name"),
  probableAge: z.string().optional().describe("Estimated age range or exact age if known"),
  location: z.string().optional().describe("Current location, city, state, or country if known"),
  profession: z.string().optional().describe("Current or primary profession or industry"),
  education: z.string().optional().describe("Educational background if known"),
  organizations: z.string().optional().describe("Organizations, companies, or institutions they're affiliated with"),
  keyIdentifiers: z.array(z.string()).describe("Unique identifying information that can distinguish this person"),
  confidence: z.number().min(0).max(1).describe("Confidence score from 0-1 on the extracted identity information"),
  reasoning: z.string().describe("Reasoning behind the identity extraction and confidence score"),
});

// Schema for content verification
const VerificationSchema = z.object({
  isRelevant: z.boolean().describe("Whether this content is about the same person we're researching"),
  confidence: z.number().min(0).max(1).describe("Confidence score from 0-1"),
  matchingIdentifiers: z.array(z.string()).describe("Identifiers that match between the person and content"),
  contradictions: z
    .array(z.string())
    .describe("Any contradicting information that suggests this is a different person"),
  reasoning: z.string().describe("Detailed reasoning explaining why this content is or isn't about the same person"),
});

/**
 * Service for identifying person details and verifying search results are about the same person
 */
export class PersonIdentificationService {
  /**
   * Extracts identity information from donor data and initial research
   * @param donorInfo - Basic donor information
   * @param initialSearchResults - Initial search results that may contain identity information
   * @returns Extracted identity information with token usage
   */
  async extractPersonIdentity(
    donorInfo: DonorInfo,
    initialSearchResults: EnhancedSearchResult[] = []
  ): Promise<{ identity: PersonIdentity; tokenUsage: TokenUsage }> {
    logger.info(`Extracting identity information for person: ${donorInfo.fullName}`);

    try {
      const prompt = this.buildIdentityExtractionPrompt(donorInfo, initialSearchResults);

      const result = await generateObject({
        model: azure(env.MID_MODEL),
        schema: PersonIdentitySchema,
        prompt,
        temperature: 0.2, // Lower temperature for factual extraction
      });

      // Capture token usage
      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      const identity: PersonIdentity = {
        ...result.object,
        extractedFrom: initialSearchResults.length > 0 ? "donor data and initial search" : "donor data only",
      };

      logger.info(
        `Extracted identity for ${donorInfo.fullName} with ${identity.keyIdentifiers.length} key identifiers and ${
          result.object.confidence * 100
        }% confidence (${tokenUsage.totalTokens} tokens used)`
      );

      return { identity, tokenUsage };
    } catch (error) {
      logger.error(
        `Identity extraction failed for ${donorInfo.fullName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Return basic identity with low confidence if extraction fails
      return {
        identity: {
          fullName: donorInfo.fullName,
          location: donorInfo.location,
          keyIdentifiers: [],
          confidence: 0.1,
          reasoning: "Failed to extract detailed identity information",
          extractedFrom: "donor data only (extraction failed)",
        },
        tokenUsage: createEmptyTokenUsage(),
      };
    }
  }

  /**
   * Verifies if a search result is about the same person
   * @param identity - Extracted person identity
   * @param searchResult - Search result to verify
   * @returns Verification result with token usage
   */
  async verifySearchResultRelevance(
    identity: PersonIdentity,
    searchResult: EnhancedSearchResult
  ): Promise<{ verification: VerificationResult; tokenUsage: TokenUsage }> {
    const resultIdentifier = `${searchResult.title} (${searchResult.link})`;
    logger.debug(`Verifying relevance of search result: ${resultIdentifier}`);

    try {
      const prompt = this.buildVerificationPrompt(identity, searchResult);

      const result = await generateObject({
        model: azure(env.MID_MODEL),
        schema: VerificationSchema,
        prompt,
        temperature: 0.1, // Very low temperature for factual verification
      });

      // Capture token usage
      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      const verification: VerificationResult = {
        ...result.object,
        sourceUrl: searchResult.link,
        sourceTitle: searchResult.title,
      };

      logger.debug(
        `Verification result for ${resultIdentifier}: ${verification.isRelevant ? "RELEVANT" : "NOT RELEVANT"} with ${
          verification.confidence * 100
        }% confidence (${tokenUsage.totalTokens} tokens used)`
      );

      return { verification, tokenUsage };
    } catch (error) {
      logger.error(
        `Verification failed for ${searchResult.title}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Default to excluding the content if verification fails
      return {
        verification: {
          isRelevant: false,
          confidence: 0.5,
          matchingIdentifiers: [],
          contradictions: ["Verification failed due to error"],
          reasoning: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          sourceUrl: searchResult.link,
          sourceTitle: searchResult.title,
        },
        tokenUsage: createEmptyTokenUsage(),
      };
    }
  }

  /**
   * Builds prompt for extracting person identity
   */
  private buildIdentityExtractionPrompt(
    donorInfo: DonorInfo,
    initialSearchResults: EnhancedSearchResult[] = []
  ): string {
    let prompt = `Extract key identity information about a specific person based on the provided data. Your goal is to create a clear identity profile that can be used to verify if future search results are about the same person.

DONOR INFORMATION:
- Full Name: ${donorInfo.fullName}
${donorInfo.location ? `- Location: ${donorInfo.location}` : ""}
${donorInfo.notes ? `- Additional Notes: ${donorInfo.notes}` : ""}

TASK:
1. Extract specific identity details from the provided information
2. Generate a list of "key identifiers" that uniquely identify this person
3. These identifiers should help distinguish this person from others with similar names
4. Rate your confidence in the extracted identity information

IMPORTANT:
- Key identifiers should be specific facts that can distinguish this person from others with the same name
- Examples: specific job title + company, specific city + profession, specific organization affiliation, etc.
- Be realistic about your confidence level based on how much information is available
`;

    // Add search results if available
    if (initialSearchResults.length > 0) {
      prompt += `\nINITIAL SEARCH RESULTS:`;

      initialSearchResults.forEach((result, index) => {
        prompt += `\n\nResult ${index + 1}: ${result.title} (${result.link})
- Snippet: ${result.snippet}`;

        // Add crawled content if available
        if (result.crawledContent?.crawlSuccess && result.crawledContent.text) {
          prompt += `\n- Full Content: ${result.crawledContent.text.substring(0, 1000)}${
            result.crawledContent.text.length > 1000 ? "..." : ""
          }`;
        }
      });
    }

    return prompt;
  }

  /**
   * Builds prompt for verifying if search result is about the same person
   */
  private buildVerificationPrompt(identity: PersonIdentity, searchResult: EnhancedSearchResult): string {
    let prompt = `Determine if the following search result is about the same person whose identity information is provided below.

PERSON IDENTITY:
- Full Name: ${identity.fullName}
${identity.probableAge ? `- Probable Age: ${identity.probableAge}` : ""}
${identity.location ? `- Location: ${identity.location}` : ""}
${identity.profession ? `- Profession: ${identity.profession}` : ""}
${identity.education ? `- Education: ${identity.education}` : ""}
${identity.organizations ? `- Organizations: ${identity.organizations}` : ""}

KEY IDENTIFIERS (unique characteristics of this person):
${identity.keyIdentifiers.map((id: string) => `- ${id}`).join("\n")}

SEARCH RESULT TO VERIFY:
- Title: ${searchResult.title}
- URL: ${searchResult.link}
- Snippet: ${searchResult.snippet}`;

    // Add crawled content if available
    if (searchResult.crawledContent?.crawlSuccess && searchResult.crawledContent.text) {
      prompt += `\n\nFULL PAGE CONTENT:
${searchResult.crawledContent.text.substring(0, 2500)}${searchResult.crawledContent.text.length > 2500 ? "..." : ""}`;
    }

    prompt += `\n\nTASK:
1. Analyze the search result content carefully
2. Determine if this content is about the SAME person described in the identity information
3. Look for matching identifiers that confirm it's the same person
4. Note any contradictions that suggest it's a different person with the same/similar name
5. Provide your reasoning in detail
6. Be especially cautious with common names where multiple different people might appear in search results

EVALUATION CRITERIA:
- If the search result lacks sufficient information to make a determination, lean toward NOT RELEVANT
- If there are clear contradictions (different location, age, profession, etc.), mark as NOT RELEVANT
- If multiple identifiers match and there are no contradictions, mark as RELEVANT
- Set confidence based on how clear the match or mismatch is`;

    return prompt;
  }
}
