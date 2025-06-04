import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { buildStageClassificationPrompt } from "./prompt-builder";
import type { StageClassificationInput, StageClassificationOutput, LLMStageClassificationResponse } from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

export class StageClassificationService {
  /**
   * Classifies a donor into a specific stage of the donor journey using AI.
   * @param input - The input data for stage classification.
   * @returns The classified stage information.
   */
  async classifyStage(input: StageClassificationInput): Promise<StageClassificationOutput> {
    const { donorInfo, donorJourneyGraph, communicationHistory, donationHistory } = input;

    logger.info(`Starting stage classification for donor ${donorInfo.id} (name: ${donorInfo.name})`);

    const prompt = buildStageClassificationPrompt(donorInfo, donorJourneyGraph, communicationHistory, donationHistory);

    logger.info(
      `Built stage classification prompt for donor ${donorInfo.id} (length: ${prompt.length}, model: ${env.MID_MODEL})`
    );

    try {
      logger.info(`Sending stage classification prompt to AI for donor ${donorInfo.id}`);
      const { text: aiResponse } = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        prompt,
        // Consider adding system prompt if needed, or specific temperature/maxTokens
      });

      const responseLength = aiResponse?.length || 0;
      logger.info(
        `Received AI response for stage classification of donor ${
          donorInfo.id
        } (length: ${responseLength}, first 100 chars: ${aiResponse?.substring(0, 100) || ""})`
      );
      const trimmedResponse = aiResponse.trim();
      const parsedResponse = JSON.parse(trimmedResponse) as LLMStageClassificationResponse;

      if (!parsedResponse || typeof parsedResponse.stageId !== "string") {
        logger.error(
          `Invalid stage classification response structure for donor ${donorInfo.id}. Response: ${JSON.stringify(
            parsedResponse
          )}`
        );
        throw new Error("AI response for stage classification is not in the expected JSON format.");
      }

      logger.info(
        `Successfully classified stage for donor ${donorInfo.id} to stage ${parsedResponse.stageId}. Reasoning: ${
          parsedResponse.reasoning || "N/A"
        }`
      );

      return {
        donorId: donorInfo.id,
        classifiedStageId: parsedResponse.stageId,
        reasoning: parsedResponse.reasoning,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `Failed to classify stage for donor ${donorInfo.id}. Error: ${errorMessage}, Stack: ${
          error instanceof Error ? error.stack : "N/A"
        }`
      );
      throw new Error(`AI stage classification failed for donor ${donorInfo.id}: ${errorMessage}`);
    }
  }
}
