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

    const totalSources = summaries.reduce((sum, summary) => sum + summary.sources.length, 0);
    const crawledSources = summaries.reduce(
      (sum, summary) => sum + summary.sources.filter((s) => s.crawledContent?.crawlSuccess).length,
      0
    );
    const totalWords = summaries.reduce(
      (sum, summary) =>
        sum + summary.sources.reduce((sourceSum, source) => sourceSum + (source.crawledContent?.wordCount || 0), 0),
      0
    );

    logger.info(
      `Analyzing research sufficiency for topic "${researchTopic}": ${summaries.length} summaries, ${totalSources} sources (${crawledSources} crawled), ${totalWords} words of content`
    );

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
        logger.info(`Research deemed sufficient for topic "${researchTopic}" - no follow-up needed`);
      } else {
        logger.info(
          `Knowledge gap identified for topic "${researchTopic}": "${reflectionResult.knowledgeGap}" - generated ${
            reflectionResult.followUpQueries.length
          } follow-up queries: [${reflectionResult.followUpQueries.join(", ")}]`
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
      .map((summary, index) => {
        let summaryText = `Summary ${index + 1} (Query: "${summary.query}"):\n${summary.summary}`;

        const crawledSources = summary.sources.filter((s: any) => s.crawledContent?.crawlSuccess);
        if (crawledSources.length > 0) {
          const totalWords = crawledSources.reduce(
            (sum: number, s: any) => sum + (s.crawledContent?.wordCount || 0),
            0
          );
          summaryText += `\n[Based on ${summary.sources.length} sources, ${crawledSources.length} with crawled content totaling ${totalWords} words]`;
        } else {
          summaryText += `\n[Based on ${summary.sources.length} sources, no content successfully crawled]`;
        }

        return summaryText;
      })
      .join("\n\n");

    return `You are an expert research assistant analyzing research completeness for the topic: "${researchTopic}".

Instructions:
- Evaluate whether the provided research summaries and crawled content provide sufficient information to comprehensively answer the research topic
- Consider both the breadth and depth of information available
- Identify specific knowledge gaps or areas needing deeper exploration
- Generate focused follow-up queries only if significant gaps exist
- If information is sufficient, mark as complete - avoid unnecessary additional research

Requirements:
- Follow-up queries should be self-contained and include necessary context for web search
- Focus on technical details, recent developments, or specific aspects not adequately covered
- Prioritize quality over quantity - better to have fewer, more targeted follow-up queries

Output Format:
Format your response as a JSON object with these exact keys:
- "is_sufficient": true or false
- "knowledge_gap": Describe what information is missing (empty string if sufficient)
- "follow_up_queries": Array of specific questions to address gaps (empty array if sufficient)

Example:
\`\`\`json
{
    "is_sufficient": false,
    "knowledge_gap": "The research lacks current performance benchmarks and recent implementation examples",
    "follow_up_queries": ["What are the latest performance benchmarks for [specific technology] in 2024?", "Recent real-world implementation examples of [specific technology]"]
}
\`\`\`

Research Topic: ${researchTopic}

Research Summaries:
${summariesText}`;
  }
}
