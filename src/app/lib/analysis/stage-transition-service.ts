import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { buildStageTransitionPrompt } from "./prompt-builder";
import type { StageTransitionInput, StageTransitionOutput, LLMStageTransitionResponse } from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

export class StageTransitionService {
  /**
   * Determines if a donor can transition to a new stage and which stage that would be.
   * @param input - The input data for stage transition analysis.
   * @returns Information about the potential transition.
   */
  async classifyStageTransition(input: StageTransitionInput): Promise<StageTransitionOutput> {
    const { donorInfo, currentStageId, donorJourneyGraph, communicationHistory, donationHistory } = input;

    logger.info(
      `Starting stage transition analysis for donor ${donorInfo.id} (name: ${donorInfo.name}, currentStage: ${currentStageId})`
    );

    const prompt = buildStageTransitionPrompt(
      donorInfo,
      currentStageId,
      donorJourneyGraph,
      communicationHistory,
      donationHistory
    );

    logger.info(
      `Built stage transition prompt for donor ${donorInfo.id} (length: ${prompt.length}, model: ${env.MID_MODEL})`
    );

    try {
      logger.info(`Sending stage transition prompt to AI for donor ${donorInfo.id}`);
      const { text: aiResponse } = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        prompt,
      });

      logger.info(`prompt for stage transition of donor ${donorInfo.id}: ${prompt}`);
      logger.info(`aiResponse for stage transition of donor ${donorInfo.id}: ${aiResponse}`);

      const responseLength = aiResponse?.length || 0;
      logger.info(
        `Received AI response for stage transition of donor ${
          donorInfo.id
        } (length: ${responseLength}, first 100 chars: ${aiResponse?.substring(0, 100) || ""})`
      );
      const trimmedResponse = aiResponse.trim();
      const parsedResponse = JSON.parse(trimmedResponse) as LLMStageTransitionResponse;

      if (!parsedResponse || typeof parsedResponse.canTransition !== "boolean") {
        logger.error(
          `Invalid stage transition response structure for donor ${donorInfo.id}. Response: ${JSON.stringify(
            parsedResponse
          )}`
        );
        throw new Error("AI response for stage transition is not in the expected JSON format.");
      }
      if (parsedResponse.canTransition && typeof parsedResponse.nextStageId !== "string") {
        logger.error(
          `Invalid nextStageId in stage transition response for donor ${
            donorInfo.id
          } when canTransition is true. Response: ${JSON.stringify(parsedResponse)}`
        );
        throw new Error("Invalid nextStageId when canTransition is true.");
      }

      logger.info(
        `Successfully analyzed stage transition for donor ${donorInfo.id}. Can transition: ${
          parsedResponse.canTransition
        }, Next stage: ${parsedResponse.nextStageId || "N/A"}. Reasoning: ${parsedResponse.reasoning || "N/A"}`
      );

      return {
        donorId: donorInfo.id,
        canTransition: parsedResponse.canTransition,
        nextStageId: parsedResponse.nextStageId,
        reasoning: parsedResponse.reasoning,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `Failed to analyze stage transition for donor ${donorInfo.id}. Error: ${errorMessage}, Stack: ${
          error instanceof Error ? error.stack : "N/A"
        }`
      );
      throw new Error(`AI stage transition analysis failed for donor ${donorInfo.id}: ${errorMessage}`);
    }
  }
}
