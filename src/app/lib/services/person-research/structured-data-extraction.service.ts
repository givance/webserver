import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { logger } from "@/app/lib/logger";
import { PersonResearchData, TokenUsage, WebSearchResult } from "./types";
import { z } from "zod";

// Zod schema for PersonResearchData
const PersonResearchDataSchema = z.object({
  inferredAge: z.number().nullable(),
  employer: z.string().nullable(),
  estimatedIncome: z.string().nullable(),
  highPotentialDonor: z.boolean(),
  highPotentialDonorRationale: z.string(),
});

/**
 * Service for extracting structured data from person research results
 */
export class StructuredDataExtractionService {
  /**
   * Extracts structured data from research summaries and answer
   */
  async extractStructuredData(params: {
    answer: string;
    summaries: WebSearchResult[];
    researchTopic: string;
  }): Promise<{ structuredData: PersonResearchData; tokenUsage: TokenUsage }> {
    const { answer, summaries, researchTopic } = params;

    logger.info("Extracting structured data from person research results");

    try {
      // Combine all summary text for analysis
      const allSummaryText = summaries
        .map((summary) => {
          const sourcesText = summary.sources.map((source) => `- ${source.title}: ${source.snippet}`).join("\n");
          return `Query: ${summary.query}\nSummary: ${summary.summary}\nSources:\n${sourcesText}`;
        })
        .join("\n\n");

      const prompt = `You are an expert analyst tasked with extracting structured data about a person from research results.

Research Topic: ${researchTopic}

Research Answer:
${answer}

Research Summaries and Sources:
${allSummaryText}

Based on the research above, extract the following structured information:

1. **Inferred Age**: Extract the person's age or estimate it based on graduation years, career timeline, etc. Return as a number (e.g., 45) or null if not determinable.

2. **Employer**: Current employer or most recent employer mentioned. Return the company/organization name or null if not found.

3. **Estimated Income**: Estimate income range based on job title, company, location, industry standards. Use ranges like "$50,000-$75,000", "$100,000-$150,000", "Over $200,000", or "Not disclosed" if insufficient data.

4. **High Potential Donor**: Assess if this person is likely to be a high-value donor based on:
   - Financial capacity (income, wealth indicators, investments)
   - Previous charitable giving history
   - Professional status/network
   - Community involvement
   - Lifestyle indicators
   Return true or false.

5. **High Potential Donor Rationale**: Provide a detailed explanation (2-3 sentences) for why you assessed them as high or low potential, citing specific evidence from the research.

Be conservative in your assessments and clearly indicate when information is inferred vs. explicitly stated.`;

      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: PersonResearchDataSchema,
        prompt,
        temperature: 0.1, // Low temperature for consistent structured extraction
      });

      // Extract structured data from the result
      const structuredData: PersonResearchData = {
        inferredAge: result.object.inferredAge,
        employer: result.object.employer,
        estimatedIncome: result.object.estimatedIncome,
        highPotentialDonor: result.object.highPotentialDonor,
        highPotentialDonorRationale: result.object.highPotentialDonorRationale,
      };

      const tokenUsage: TokenUsage = {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      };

      logger.info(
        `Structured data extraction completed - Age: ${structuredData.inferredAge}, Employer: ${structuredData.employer}, High Potential: ${structuredData.highPotentialDonor}`
      );

      return { structuredData, tokenUsage };
    } catch (error) {
      logger.error(`Structured data extraction failed: ${error instanceof Error ? error.message : String(error)}`);

      // Return safe defaults on error
      const defaultData: PersonResearchData = {
        inferredAge: null,
        employer: null,
        estimatedIncome: null,
        highPotentialDonor: false,
        highPotentialDonorRationale: "Unable to assess due to data extraction error.",
      };

      const defaultTokenUsage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      return { structuredData: defaultData, tokenUsage: defaultTokenUsage };
    }
  }
}
