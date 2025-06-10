import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import {
  AnswerSynthesisInput,
  AnswerSynthesisResult,
  Citation,
  getCurrentDate,
  TokenUsage,
  createEmptyTokenUsage,
} from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

/**
 * Service for synthesizing final answers with citations from research summaries
 */
export class AnswerSynthesisService {
  /**
   * Synthesizes a comprehensive answer from research summaries
   * @param input - Synthesis input with research topic and summaries
   * @returns Final answer with citations
   */
  async synthesizeAnswer(input: AnswerSynthesisInput): Promise<AnswerSynthesisResult> {
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
      `Synthesizing final answer for topic "${researchTopic}" from ${summaries.length} research summaries: ${totalSources} total sources, ${crawledSources} with crawled content (${totalWords} words)`
    );

    try {
      const prompt = this.buildSynthesisPrompt(researchTopic, summaries);

      const result = await generateText({
        model: azure(env.MID_MODEL),
        prompt,
        temperature: 0.2, // Very low temperature for factual synthesis
      });

      // Capture token usage
      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      const citations = this.extractCitations(summaries);

      logger.info(
        `Generated final answer for topic "${researchTopic}": ${result.text.length} characters, ${
          citations.length
        } citations (${citations.filter((c) => c.wordCount).length} with crawled content), ${
          tokenUsage.totalTokens
        } tokens`
      );

      return {
        answer: result.text,
        citations,
        tokenUsage,
      };
    } catch (error) {
      logger.error(
        `Answer synthesis failed for topic "${researchTopic}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error(`Answer synthesis failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Builds the prompt for answer synthesis
   */
  private buildSynthesisPrompt(researchTopic: string, summaries: any[]): string {
    const currentDate = getCurrentDate();

    const summariesText = summaries
      .map((summary, index) => {
        const sourcesText = summary.sources
          .map((source: any, sourceIndex: number) => {
            let sourceText = `   Source ${sourceIndex + 1}: ${source.title} (${source.link})\n   Snippet: ${
              source.snippet
            }`;

            if (source.crawledContent?.crawlSuccess && source.crawledContent.text) {
              sourceText += `\n   Full Content (${source.crawledContent.wordCount} words): ${source.crawledContent.text}`;
            } else if (source.crawledContent?.errorMessage) {
              sourceText += `\n   Note: Content crawling failed - ${source.crawledContent.errorMessage}`;
            }

            return sourceText;
          })
          .join("\n\n");

        return `Summary ${index + 1} - Query: "${summary.query}"\n${summary.summary}\n\nSources:\n${sourcesText}\n`;
      })
      .join("\n---\n\n");

    return `Generate a high-quality, comprehensive answer based on the provided research summaries and crawled content.

Instructions:
- Current date: ${currentDate}
- You are synthesizing research from multiple sources including full webpage content
- Prioritize information from crawled content when available as it's more comprehensive than snippets
- Generate a thorough, well-structured answer that addresses the research topic comprehensively
- Include specific facts, figures, and details from the sources
- Maintain accuracy to the source material - only use information that's actually present
- Structure the information logically and clearly
- Reference sources appropriately throughout your answer

Research Topic: ${researchTopic}

Research Summaries and Sources:
${summariesText}

Provide a comprehensive, well-structured answer that synthesizes all available information from both research summaries and crawled content. Focus on delivering a thorough response to: "${researchTopic}".`;
  }

  /**
   * Extracts citations from research summaries with enhanced information
   */
  private extractCitations(summaries: any[]): Citation[] {
    const citations: Citation[] = [];

    summaries.forEach((summary) => {
      if (summary.sources && Array.isArray(summary.sources)) {
        summary.sources.forEach((source: any) => {
          const citation: Citation = {
            url: source.link,
            title: source.title,
            snippet: source.snippet,
            relevance: `Related to query: ${summary.query}`,
          };

          // Add word count if crawled content is available
          if (source.crawledContent?.crawlSuccess) {
            citation.wordCount = source.crawledContent.wordCount;
            // Use crawled content as snippet if it's more substantial
            if (source.crawledContent.text && source.crawledContent.text.length > source.snippet.length) {
              citation.snippet =
                source.crawledContent.text.length > 300
                  ? source.crawledContent.text.substring(0, 300) + "..."
                  : source.crawledContent.text;
            }
          }

          citations.push(citation);
        });
      }
    });

    // Remove duplicates based on URL
    const uniqueCitations = citations.filter(
      (citation, index) => citations.findIndex((c) => c.url === citation.url) === index
    );

    const crawledCitations = uniqueCitations.filter((c) => c.wordCount).length;
    const totalWords = uniqueCitations.reduce((sum, c) => sum + (c.wordCount || 0), 0);

    logger.debug(
      `Extracted ${uniqueCitations.length} unique citations from ${summaries.length} summaries: ${crawledCitations} with crawled content (${totalWords} total words)`
    );

    return uniqueCitations;
  }
}
