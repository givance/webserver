import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { AnswerSynthesisInput, AnswerSynthesisResult, Citation, getCurrentDate } from "./types";

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

    logger.info(`Synthesizing final answer from ${summaries.length} research summaries for topic: "${researchTopic}"`);

    try {
      const prompt = this.buildSynthesisPrompt(researchTopic, summaries);

      const result = await generateText({
        model: azure(env.MID_MODEL),
        prompt,
        temperature: 0.2, // Very low temperature for factual synthesis
      });

      const citations = this.extractCitations(summaries);

      logger.info(
        `Generated final answer for topic "${researchTopic}" (${result.text.length} characters, ${citations.length} citations)`
      );

      return {
        answer: result.text,
        citations,
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
          .map(
            (source: any, sourceIndex: number) =>
              `   Source ${sourceIndex + 1}: ${source.title} (${source.link})\n   ${source.snippet}`
          )
          .join("\n");

        return `Summary ${index + 1} - Query: "${summary.query}"\n${summary.summary}\n\nSources:\n${sourcesText}\n`;
      })
      .join("\n---\n\n");

    return `Generate a high-quality answer to the user's question based on the provided summaries.

Instructions:
- The current date is ${currentDate}.
- You are the final step of a multi-step research process, don't mention that you are the final step. 
- You have access to all the information gathered from the previous steps.
- You have access to the user's question.
- Generate a high-quality answer to the user's question based on the provided summaries and the user's question.
- you MUST include all the citations from the summaries in the answer correctly.

User Context:
- ${researchTopic}

Summaries:
${summariesText}

Please provide a comprehensive, well-structured answer that synthesizes the information from all summaries. Ensure that you:
1. Address the research topic directly and completely
2. Include specific facts, figures, and details from the sources
3. Maintain accuracy to the source material
4. Structure the information logically
5. Reference the sources appropriately throughout your answer

Your answer should be informative, detailed, and directly address the research question about "${researchTopic}".`;
  }

  /**
   * Extracts citations from research summaries
   */
  private extractCitations(summaries: any[]): Citation[] {
    const citations: Citation[] = [];

    summaries.forEach((summary) => {
      if (summary.sources && Array.isArray(summary.sources)) {
        summary.sources.forEach((source: any) => {
          citations.push({
            url: source.link,
            title: source.title,
            snippet: source.snippet,
            relevance: `Related to: ${summary.query}`,
          });
        });
      }
    });

    // Remove duplicates based on URL
    const uniqueCitations = citations.filter(
      (citation, index) => citations.findIndex((c) => c.url === citation.url) === index
    );

    logger.info(`Extracted ${uniqueCitations.length} unique citations from ${summaries.length} summaries`);

    return uniqueCitations;
  }
}
