import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import {
  EmailGeneratorTool,
  InstructionRefinementInput,
  InstructionRefinementResult,
  createEmptyTokenUsage,
  TokenUsage,
} from "./types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

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
   * @returns Refined instruction, reasoning, and suggested new memories
   */
  async refineInstruction(input: InstructionRefinementInput): Promise<InstructionRefinementResult> {
    const { userInstruction, previousInstruction, userFeedback, organizationWritingInstructions, chatHistory } = input;

    logger.info("Starting instruction refinement with:", {
      userInstruction,
      previousInstruction: previousInstruction || "none",
      userFeedback: userFeedback || "none",
      chatHistoryLength: chatHistory?.length || 0,
      modelName: env.AZURE_OPENAI_DEPLOYMENT_NAME,
    });

    const prompt = `You are an AI assistant helping to refine instructions for email generation. 
Your task is to analyze the user's instruction and feedback (if any) to create a clear, specific instruction 
that will help generate better personalized emails.

${
  previousInstruction
    ? `Previous instruction: "${previousInstruction}"
IMPORTANT: You MUST incorporate and build upon the previous instruction. Do not discard its requirements.
Your refined instruction should be a combination of both the previous and current instructions.`
    : ""
}
${userFeedback ? `User feedback on previous result: "${userFeedback}"` : ""}

${organizationWritingInstructions ? `Organization writing instructions: "${organizationWritingInstructions}"` : ""}

${
  chatHistory && chatHistory.length > 0
    ? `Full conversation history:
${chatHistory
  .map((msg, index) => `${index + 1}. ${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
  .join("\n")}

IMPORTANT: Consider the ENTIRE conversation history above when refining the instruction. The user's latest message might reference earlier parts of the conversation, clarify previous requests, or build upon earlier instructions. Make sure to incorporate context from the full conversation, not just the most recent message.`
    : ""
}

Current user instruction: "${userInstruction}"

Based on this information, please provide:
1. A refined, specific instruction that combines and builds upon both the previous instruction (if any) and the current instruction
2. A brief explanation of how you combined and enhanced both instructions
3. You should not hallucinate or make up any instruction, all instruction has to come strictly from user instruction, feedback, or organizational memories provided.
4. Any potential new memories that could be useful for future email generation based on this user instruction and / or feedback.

Your refined instruction MUST:
- Maintain all requirements from the previous instruction (if any)
- Add new requirements from the current instruction
- Resolve any conflicts between the two in a sensible way
- Be clear and specific about how to handle different cases
- Not lose any important details from either instruction

For potential memories:
- The potential memories must apply to almost all future email generations, to be saved in the user's memories, unless the user specifically asked to save them in memories.
- You should not repeat anything that is already in the organization writing instructions.
- You should not suggest memories that is already in the existing memories.
- You should not suggest memories that is already in the existing dismissed memories.
- The memory has to be very speicifc, and actionable. For example, if the user say, something like, ask for 1.1x of the past donation, you should suggest a memory like, "ask for 1.1x of the past donation", not "ask fir slightly more money".

Respond in JSON format:
{
  "refinedInstruction": "your refined instruction here",
  "reasoning": "your explanation here",
  "suggestedMemories": ["memory1", "memory2", ...]
}`;

    try {
      logger.info(
        `Sending prompt to OpenAI (promptLength: ${prompt.length}, model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME})`
      );

      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        prompt,
      }).catch((error) => {
        logger.error(
          `OpenAI API call failed: ${error instanceof Error ? error.message : "Unknown error"} (stack: ${
            error instanceof Error ? error.stack : "undefined"
          })`
        );
        console.log(error);
        throw error;
      });

      const { text } = result;

      // Extract token usage information
      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      logger.info(
        `Received response from OpenAI (responseLength: ${text?.length || 0}, firstChars: ${text?.substring(
          0,
          100
        )}...)`
      );

      try {
        const trimmedResponse = text.trim();
        logger.info(
          `Attempting to parse JSON response (length: ${
            trimmedResponse.length
          }, firstChars: ${trimmedResponse.substring(0, 50)}...)`
        );

        const parsedResponse = JSON.parse(trimmedResponse) as InstructionRefinementResult;

        if (!parsedResponse?.refinedInstruction || !parsedResponse?.reasoning) {
          logger.error(
            `Invalid response structure (hasRefinedInstruction: ${!!parsedResponse?.refinedInstruction}, hasReasoning: ${!!parsedResponse?.reasoning})`
          );
          throw new Error("AI response missing required fields");
        }

        // Add token usage to the response
        const responseWithTokenUsage = {
          ...parsedResponse,
          tokenUsage,
        };

        logger.info(
          `Successfully parsed and validated response (refinedInstructionLength: ${
            parsedResponse.refinedInstruction.length
          }, reasoningLength: ${parsedResponse.reasoning.length}, suggestedMemoriesCount: ${
            parsedResponse.suggestedMemories?.length || 0
          })`
        );

        logger.info(
          `Token usage for instruction refinement: ${tokenUsage.totalTokens} tokens (${tokenUsage.promptTokens} input, ${tokenUsage.completionTokens} output)`
        );

        return responseWithTokenUsage;
      } catch (parseError) {
        logger.error(
          `Failed to parse AI response for instruction refinement: ${
            parseError instanceof Error ? parseError.message : "Unknown parsing error"
          } (stack: ${parseError instanceof Error ? parseError.stack : "undefined"})`
        );
        throw new Error(
          `Failed to parse instruction refinement response: ${
            parseError instanceof Error ? parseError.message : parseError
          }`
        );
      }
    } catch (error) {
      logger.error(
        `Failed to refine instruction: ${error instanceof Error ? error.message : "Unknown error"} (stack: ${
          error instanceof Error ? error.stack : "undefined"
        }, type: ${error instanceof Error ? error.constructor.name : typeof error})`
      );
      throw new Error(`Instruction refinement failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
