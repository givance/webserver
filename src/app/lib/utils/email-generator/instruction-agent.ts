import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { EmailGeneratorTool, InstructionRefinementInput, InstructionRefinementResult } from "./types";

/**
 * Refines user instructions for email generation based on feedback and previous instructions.
 * This agent acts as an intermediary between the user and the email generation system,
 * improving instructions based on user feedback and context.
 */
export class InstructionRefinementAgent {
  constructor(private emailGenerator: EmailGeneratorTool) {}

  /**
   * Processes user input and feedback to generate refined instructions for email generation.
   *
   * @param input - Contains user instruction, previous instruction (if any), and feedback (if any)
   * @returns Refined instruction and reasoning for the refinement
   */
  async refineInstruction(input: InstructionRefinementInput): Promise<InstructionRefinementResult> {
    const { userInstruction, previousInstruction, userFeedback } = input;

    logger.info("Starting instruction refinement with:", {
      userInstruction,
      previousInstruction: previousInstruction || "none",
      userFeedback: userFeedback || "none",
      modelName: env.MID_MODEL,
    });

    const prompt = `You are an AI assistant helping to refine instructions for email generation. 
Your task is to analyze the user's instruction and feedback (if any) to create a clear, specific instruction 
that will help generate better personalized emails.

${previousInstruction ? `Previous instruction: "${previousInstruction}"` : ""}
${userFeedback ? `User feedback on previous result: "${userFeedback}"` : ""}
Current user instruction: "${userInstruction}"

Based on this information, please provide:
1. A refined, specific instruction that will help generate better emails
2. A brief explanation of your refinements

Respond in JSON format:
{
  "refinedInstruction": "your refined instruction here",
  "reasoning": "your explanation here"
}`;

    try {
      logger.info("Sending prompt to OpenAI:", {
        promptLength: prompt.length,
        model: env.MID_MODEL,
      });

      const { text: aiResponse } = await generateText({
        model: openai(env.MID_MODEL),
        prompt,
      }).catch((error) => {
        logger.error("OpenAI API call failed:", {
          error: error instanceof Error ? error.message : "Unknown error",
          errorObject: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
        console.log(error);
        throw error;
      });

      logger.info("Received response from OpenAI:", {
        responseLength: aiResponse?.length || 0,
        response: aiResponse?.substring(0, 100) + "...", // Log first 100 chars
      });

      try {
        const trimmedResponse = aiResponse.trim();
        logger.info("Attempting to parse JSON response:", {
          trimmedLength: trimmedResponse.length,
          firstFewChars: trimmedResponse.substring(0, 50) + "...",
        });

        const parsedResponse = JSON.parse(trimmedResponse) as InstructionRefinementResult;

        if (!parsedResponse?.refinedInstruction || !parsedResponse?.reasoning) {
          logger.error("Invalid response structure:", {
            hasRefinedInstruction: !!parsedResponse?.refinedInstruction,
            hasReasoning: !!parsedResponse?.reasoning,
            parsedResponse,
          });
          throw new Error("AI response missing required fields");
        }

        logger.info("Successfully parsed and validated response:", {
          refinedInstructionLength: parsedResponse.refinedInstruction.length,
          reasoningLength: parsedResponse.reasoning.length,
        });

        return parsedResponse;
      } catch (parseError) {
        logger.error("Failed to parse AI response for instruction refinement", {
          aiResponse,
          error: parseError instanceof Error ? parseError.message : "Unknown parsing error",
          stack: parseError instanceof Error ? parseError.stack : undefined,
        });
        throw new Error(
          `Failed to parse instruction refinement response: ${
            parseError instanceof Error ? parseError.message : parseError
          }`
        );
      }
    } catch (error) {
      logger.error("Failed to refine instruction", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : typeof error,
      });
      throw new Error(`Instruction refinement failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
