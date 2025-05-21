import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { buildActionPredictionPrompt } from "./prompt-builder";
import type {
  ActionPredictionInput,
  ActionPredictionOutput,
  LLMActionPredictionResponse,
  PredictedAction,
} from "./types";

export class ActionPredictionService {
  /**
   * Predicts suitable next actions for a donor based on their current stage and history.
   * @param input - The input data for action prediction.
   * @returns A list of predicted actions.
   */
  async predictActions(input: ActionPredictionInput): Promise<ActionPredictionOutput> {
    const { donorInfo, currentStageId, donorJourneyGraph, communicationHistory, donationHistory } = input;

    logger.info(
      `Starting action prediction for donor ${donorInfo.id} (name: ${donorInfo.name}, currentStage: ${currentStageId})`
    );

    const prompt = buildActionPredictionPrompt(
      donorInfo,
      currentStageId,
      donorJourneyGraph,
      communicationHistory,
      donationHistory
    );

    logger.info(
      `Built action prediction prompt for donor ${donorInfo.id} (length: ${prompt.length}, model: ${env.MID_MODEL})`
    );

    try {
      logger.info(`Sending action prediction prompt to AI for donor ${donorInfo.id}`);
      const { text: aiResponse } = await generateText({
        model: openai(env.MID_MODEL), // Or a more capable model if needed for complex action generation
        prompt,
      });

      logger.info(`Action prediction prompt for donor ${donorInfo.id}: ${prompt}`);
      logger.info(`aiResponse for action prediction of donor ${donorInfo.id}: ${aiResponse}`);

      const responseLength = aiResponse?.length || 0;
      logger.info(
        `Received AI response for action prediction of donor ${
          donorInfo.id
        } (length: ${responseLength}, first 100 chars: ${aiResponse?.substring(0, 100) || ""})`
      );
      const trimmedResponse = aiResponse.trim();
      const parsedResponse = JSON.parse(trimmedResponse) as LLMActionPredictionResponse;

      if (!parsedResponse || !Array.isArray(parsedResponse.actions)) {
        logger.error(
          `Invalid action prediction response structure for donor ${donorInfo.id}. Response: ${JSON.stringify(
            parsedResponse
          )}`
        );
        throw new Error(
          "AI response for action prediction is not in the expected JSON format (missing actions array)."
        );
      }

      parsedResponse.actions.forEach((action: PredictedAction, index: number) => {
        if (
          !action ||
          typeof action.type !== "string" ||
          typeof action.description !== "string" ||
          typeof action.explanation !== "string" ||
          typeof action.instruction !== "string"
        ) {
          logger.error(
            `Invalid structure for action item at index ${index} for donor ${donorInfo.id}. Action: ${JSON.stringify(
              action
            )}`
          );
          throw new Error(`Invalid action item structure at index ${index} in AI response.`);
        }
      });

      logger.info(
        `Successfully predicted ${parsedResponse.actions.length} actions for donor ${
          donorInfo.id
        }. Actions: ${JSON.stringify(parsedResponse.actions)}`
      );

      return {
        donorId: donorInfo.id,
        predictedActions: parsedResponse.actions,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `Failed to predict actions for donor ${donorInfo.id}. Error: ${errorMessage}, Stack: ${
          error instanceof Error ? error.stack : "N/A"
        }`
      );
      throw new Error(`AI action prediction failed for donor ${donorInfo.id}: ${errorMessage}`);
    }
  }
}
