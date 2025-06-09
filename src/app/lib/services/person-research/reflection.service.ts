import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import { z } from "zod";
import { ReflectionInput, ReflectionResult } from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Reflection response schema
const ReflectionSchema = z.object({
  is_sufficient: z.boolean().describe("Whether the information is sufficient to answer the question"),
  knowledge_gap: z.string().describe("Description of what information is missing or needs clarification"),
  follow_up_queries: z.array(z.string()).describe("Specific questions to address knowledge gaps"),
});

/**
 * Service for analyzing research results and identifying knowledge gaps
 */
export class ReflectionService {
  /**
   * Analyzes research summaries to determine if more research is needed
   * @param input - Reflection input with research topic and summaries
   * @returns Analysis result with gap identification and follow-up queries
   */
  async analyzeResults(input: ReflectionInput): Promise<ReflectionResult> {
    const { researchTopic, summaries } = input;

    logger.info(`Analyzing ${summaries.length} research summaries for topic: "${researchTopic}"`);

    try {
      const prompt = this.buildReflectionPrompt(researchTopic, summaries);

      const result = await generateObject({
        model: azure(env.MID_MODEL),
        schema: ReflectionSchema,
        prompt,
        temperature: 0.3, // Lower temperature for analytical tasks
      });

      const reflectionResult: ReflectionResult = {
        isSufficient: result.object.is_sufficient,
        knowledgeGap: result.object.knowledge_gap,
        followUpQueries: result.object.follow_up_queries,
      };

      if (reflectionResult.isSufficient) {
        logger.info(`Research deemed sufficient for topic: "${researchTopic}"`);
      } else {
        logger.info(
          `Knowledge gap identified for topic "${researchTopic}": "${reflectionResult.knowledgeGap}" - ${reflectionResult.followUpQueries.length} follow-up queries generated`
        );
      }

      return reflectionResult;
    } catch (error) {
      logger.error(
        `Reflection analysis failed for topic "${researchTopic}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(`Reflection analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Builds the prompt for reflection analysis
   */
  private buildReflectionPrompt(researchTopic: string, summaries: any[]): string {
    const summariesText = summaries
      .map((summary, index) => `Summary ${index + 1} (Query: "${summary.query}"):\n${summary.summary}\n`)
      .join("\n");

    return `You are an expert research assistant analyzing summaries about "${researchTopic}".

Instructions:
- Identify knowledge gaps or areas that need deeper exploration and generate a follow-up query. (1 or multiple).
- If provided summaries are sufficient to answer the user's question, don't generate a follow-up query.
- If there is a knowledge gap, generate a follow-up query that would help expand your understanding.
- Focus on technical details, implementation specifics, or emerging trends that weren't fully covered.

Requirements:
- Ensure the follow-up query is self-contained and includes necessary context for web search.

Output Format:
- Format your response as a JSON object with these exact keys:
   - "is_sufficient": true or false
   - "knowledge_gap": Describe what information is missing or needs clarification
   - "follow_up_queries": Write a specific question to address this gap

Example:
\`\`\`json
{
    "is_sufficient": true, // or false
    "knowledge_gap": "The summary lacks information about performance metrics and benchmarks", // "" if is_sufficient is true
    "follow_up_queries": ["What are typical performance benchmarks and metrics used to evaluate [specific technology]?"] // [] if is_sufficient is true
}
\`\`\`

Reflect carefully on the Summaries to identify knowledge gaps and produce a follow-up query. Then, produce your output following this JSON format:

Summaries:
${summariesText}`;
  }
}
