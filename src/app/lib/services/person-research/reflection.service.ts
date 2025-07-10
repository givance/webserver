import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { createAzure } from '@ai-sdk/azure';
import { generateObject } from 'ai';
import { z } from 'zod';
import { ReflectionInput, ReflectionResult, TokenUsage, createEmptyTokenUsage } from './types';

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Reflection response schema
const ReflectionSchema = z.object({
  is_sufficient: z
    .boolean()
    .describe('Whether the information is sufficient to answer the question'),
  knowledge_gap: z
    .string()
    .describe('Description of what information is missing or needs clarification'),
  follow_up_queries: z.array(z.string()).describe('Specific questions to address knowledge gaps'),
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
        sum +
        summary.sources.reduce(
          (sourceSum, source) => sourceSum + (source.crawledContent?.wordCount || 0),
          0
        ),
      0
    );

    logger.info(
      `Analyzing research sufficiency for topic "${researchTopic}": ${summaries.length} summaries, ${totalSources} sources (${crawledSources} crawled), ${totalWords} words of content`
    );

    try {
      const prompt = this.buildReflectionPrompt(researchTopic, summaries);

      const result = await generateObject({
        model: azure(env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME),
        schema: ReflectionSchema,
        prompt,
        temperature: 0.1, // Low temperature for analytical reasoning
      });

      // Capture token usage
      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      const isSufficient = result.object.is_sufficient;
      const knowledgeGap = result.object.knowledge_gap;
      const followUpQueries = result.object.follow_up_queries;

      logger.info(
        `Reflection analysis for topic "${researchTopic}": sufficient=${isSufficient}, gap="${knowledgeGap}", follow-ups=${followUpQueries.length}, tokens=${tokenUsage.totalTokens}`
      );

      return {
        isSufficient,
        knowledgeGap,
        followUpQueries,
        tokenUsage,
      };
    } catch (error) {
      logger.error(
        `Reflection analysis failed for topic "${researchTopic}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(
        `Reflection analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      .join('\n\n');

    return `You are analyzing research completeness for: "${researchTopic}".

Instructions:
- Check if the research answers the question well enough
- If something important is missing, identify what's needed
- Generate simple search terms for missing info - NOT full questions
- Keep follow-up searches short and natural like humans would actually search

Requirements:
- Follow-up queries should be SHORT search terms, not questions
- Think like a human typing into Google - 2-5 words max
- Don't generate formal research questions
- Focus on what's actually missing

Output Format:
\`\`\`json
{
    "is_sufficient": false,
    "knowledge_gap": "Missing info about recent donations or charity work",
    "follow_up_queries": ["Yulong Liu charity", "GreenTally donations", "cancer research donors"]
}
\`\`\`

Research Topic: ${researchTopic}

Research Summaries:
${summariesText}`;
  }
}
