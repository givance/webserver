import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import {
  DonorInfo,
  DonationInfo,
  GenerateEmailOptions,
  GeneratedEmail,
  Organization,
  EmailPiece,
  RawCommunicationThread, // Make sure this matches the structure of items in CommunicationHistory[]
} from "./types";
import { buildEmailPrompt } from "./prompt-builder";

/**
 * Generates a personalized email for a donor using AI, with structured content and references.
 *
 * @param options - Configuration options for email generation.
 * @returns Promise containing the generated email with structured content.
 */
export async function generateDonorEmail(options: GenerateEmailOptions): Promise<GeneratedEmail> {
  const {
    donor,
    instruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    communicationHistory, // This is RawCommunicationHistory[] which should be RawCommunicationThread[]
    donationHistory,
  } = options;

  // The type for communicationHistory in GenerateEmailOptions is RawCommunicationHistory[],
  // which I've aliased from the imported CommunicationHistory.
  // Assuming items in this array match RawCommunicationThread structure.
  // If not, a mapping step might be needed here.
  const prompt = buildEmailPrompt(
    donor,
    instruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    communicationHistory as RawCommunicationThread[], // Cast if necessary, ensure compatibility
    donationHistory
  );

  logger.info(
    `Generating email for donor ${donor.id} (${donor.firstName} ${
      donor.lastName
    }) with instruction: "${instruction}". Donation history count: ${
      donationHistory?.length || 0
    }. Communication history count: ${communicationHistory?.length || 0}.`
  );
  console.log("Prompt being sent to AI:\n", prompt); // For debugging

  try {
    const { text: aiResponse } = await generateText({
      model: openai(env.MID_MODEL), // Ensure MID_MODEL is appropriate for JSON generation
      prompt,
      // Some models/APIs might have a specific parameter for JSON mode, e.g., response_format: { type: "json_object" }
      // The 'ai' SDK might handle this based on model capabilities or require specific prompt engineering.
      // For now, we rely on the prompt instructing JSON output.
    });

    console.log("AI response:\n", aiResponse); // For debugging

    let structuredContent: EmailPiece[];
    try {
      // The AI is expected to return a string that is a valid JSON array.
      structuredContent = JSON.parse(aiResponse.trim());
      // Basic validation
      if (
        !Array.isArray(structuredContent) ||
        !structuredContent.every((item) => typeof item.piece === "string" && Array.isArray(item.references))
      ) {
        throw new Error("AI response is not in the expected JSON format of EmailPiece[].");
      }
    } catch (parseError) {
      logger.error("Failed to parse AI response as JSON", {
        donorId: donor.id,
        aiResponse: aiResponse, // Log the raw response for debugging
        error: parseError instanceof Error ? parseError.message : "Unknown parsing error",
      });
      // Fallback or re-throw: For now, re-throw to indicate failure.
      // Optionally, could attempt to wrap the entire aiResponse as a single piece.
      // structuredContent = [{ piece: aiResponse.trim(), references: [] }];
      // logger.warn("Falling back to treating entire AI response as a single piece of content.", { donorId: donor.id });
      throw new Error(
        `AI did not return valid JSON. Parse error: ${parseError instanceof Error ? parseError.message : parseError}`
      );
    }

    return {
      donorId: donor.id,
      structuredContent,
    };
  } catch (error) {
    logger.error("Failed to generate email", {
      donorId: donor.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Ensure the error is re-thrown so callers can handle it
    if (error instanceof Error && error.message.startsWith("AI did not return valid JSON")) {
      throw error; // rethrow parsing error
    }
    throw new Error(`Email generation failed for donor ${donor.id}: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Generates personalized emails for multiple donors in parallel.
 *
 * @param donors - Array of donor information.
 * @param instruction - Email generation instruction.
 * @param organizationName - Name of the organization.
 * @param organization - Organization details.
 * @param organizationWritingInstructions - Optional writing guidelines.
 * @param communicationHistories - Map of donor IDs to their raw communication histories.
 * @param donationHistories - Map of donor IDs to their donation histories.
 * @returns Promise containing array of generated emails with structured content.
 */
export async function generateDonorEmails(
  donors: DonorInfo[],
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  // Assuming communicationHistories provides RawCommunicationThread[] for each donor
  communicationHistories: Record<number, RawCommunicationThread[]> = {},
  donationHistories: Record<number, DonationInfo[]> = {}
): Promise<GeneratedEmail[]> {
  // Update the logger message to use the new formatting
  logger.info(
    `Starting batch generation of emails. Number of donors: ${donors.length}. Instruction: "${instruction}".`
  );

  const emailPromises = donors.map((donor) => {
    // The generateDonorEmail expects GenerateEmailOptions,
    // where communicationHistory is RawCommunicationHistory[] (which we treat as RawCommunicationThread[]).
    const donorCommHistory = communicationHistories[donor.id] || [];

    return generateDonorEmail({
      donor,
      instruction,
      organizationName,
      organization,
      organizationWritingInstructions,
      communicationHistory: donorCommHistory,
      donationHistory: donationHistories[donor.id] || [],
    }).catch((error) => {
      // Log individual failures but don't let one failure stop all.
      // Return a specific error structure or null for failed emails.
      logger.error(`Failed to generate email for donor ${donor.id} in batch`, {
        donorId: donor.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Decide how to represent this failure in the result array.
      // For now, rethrowing will make Promise.all fail fast.
      // To allow partial success, catch here and return a specific error object or null.
      // For this refactoring, let's stick to failing the whole batch if one fails,
      // matching Promise.all behavior. Or, more robustly, collect results and errors.
      throw error; // Rethrow to be caught by Promise.all or the caller
    });
  });

  try {
    const results = await Promise.all(emailPromises);
    logger.info(`Successfully generated batch of ${results.length} emails.`);
    return results;
  } catch (batchError) {
    logger.error("Error during batch email generation.", {
      error: batchError instanceof Error ? batchError.message : "Unknown batch error",
    });
    // Rethrow or handle as per application requirements for batch jobs
    throw batchError;
  }
}
