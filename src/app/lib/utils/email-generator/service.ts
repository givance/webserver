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
  RawCommunicationThread,
} from "./types";
import { buildEmailPrompt } from "./prompt-builder";
import { DonationWithDetails } from "../../data/donations";
import { formatDonationHistoryWithIds } from "./context-formatters";

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
    communicationHistory,
    donationHistory = [],
  } = options;

  // Sort donations and prepare reference contexts
  const sortedDonations = [...donationHistory].sort((a, b) => b.date.getTime() - a.date.getTime());
  const donationContexts: Record<string, string> = {};

  // Pre-build donation contexts
  sortedDonations.forEach((donation, index) => {
    const refId = `donation-${index + 1}`;
    const amount = (donation.amount / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    const date = new Date(donation.date).toLocaleDateString();
    const project = donation.project ? ` to ${donation.project.name}` : "";
    donationContexts[refId] = `Donation on ${date}: ${amount}${project}`;
  });

  const prompt = buildEmailPrompt(
    donor,
    instruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    communicationHistory as RawCommunicationThread[],
    donationHistory
  );

  logger.info(
    `Generating email for donor ${donor.id} (${donor.firstName} ${
      donor.lastName
    }) with instruction: "${instruction}". Donation history count: ${
      donationHistory?.length || 0
    }. Communication history count: ${communicationHistory?.length || 0}.`
  );

  try {
    const { text: aiResponse } = await generateText({
      model: openai(env.MID_MODEL),
      prompt,
    });

    let structuredContent: EmailPiece[];
    try {
      interface AIResponse {
        subject: string;
        content: EmailPiece[];
      }
      const parsedResponse = JSON.parse(aiResponse.trim()) as AIResponse;

      if (
        !parsedResponse ||
        typeof parsedResponse !== "object" ||
        !parsedResponse.subject ||
        !Array.isArray(parsedResponse.content) ||
        !parsedResponse.content.every(
          (item: EmailPiece) =>
            typeof item.piece === "string" &&
            Array.isArray(item.references) &&
            typeof item.addNewlineAfter === "boolean"
        )
      ) {
        throw new Error("AI response is not in the expected JSON format with subject and structured content.");
      }

      // Build reference contexts
      const referenceContexts: Record<string, string> = {
        ...donationContexts, // Include pre-built donation contexts
      };

      // Add communication and summary contexts
      parsedResponse.content.forEach((piece) => {
        piece.references.forEach((ref) => {
          if (ref.startsWith("comm-")) {
            const [_, threadIndex, messageIndex] = ref.split("-").map(Number);
            const thread = communicationHistory[threadIndex - 1];
            if (thread?.content?.[messageIndex - 1]) {
              const message = thread.content[messageIndex - 1];
              referenceContexts[ref] = `Previous message: ${message.content}`;
            }
          } else if (ref.startsWith("summary-paragraph-")) {
            const paragraphIndex = parseInt(ref.split("-")[2]) - 1;
            const paragraphs = organization?.websiteSummary?.split(/\n\s*\n/) || [];
            if (paragraphs[paragraphIndex]) {
              referenceContexts[ref] = `Organization summary: ${paragraphs[paragraphIndex].trim()}`;
            }
          }
        });
      });

      return {
        donorId: donor.id,
        subject: parsedResponse.subject,
        structuredContent: parsedResponse.content,
        referenceContexts,
      };
    } catch (parseError) {
      logger.error("Failed to parse AI response as JSON", {
        donorId: donor.id,
        aiResponse: aiResponse,
        error: parseError instanceof Error ? parseError.message : "Unknown parsing error",
      });
      throw new Error(
        `AI did not return valid JSON. Parse error: ${parseError instanceof Error ? parseError.message : parseError}`
      );
    }
  } catch (error) {
    logger.error("Failed to generate email", {
      donorId: donor.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (error instanceof Error && error.message.startsWith("AI did not return valid JSON")) {
      throw error;
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
  donationHistories: Record<number, DonationWithDetails[]> = {}
): Promise<GeneratedEmail[]> {
  // Update the logger message to use the new formatting
  logger.info(
    `Starting batch generation of emails. Number of donors: ${donors.length}. Instruction: "${instruction}".`
  );

  const emailPromises = donors.map((donor) => {
    // The generateDonorEmail expects GenerateEmailOptions,
    // where communicationHistory is RawCommunicationHistory[] (which we treat as RawCommunicationThread[]).
    const donorCommHistory = communicationHistories[donor.id] || [];

    console.log("Donor communication history:", donorCommHistory);
    console.log("Donor donation history:", donationHistories[donor.id]);

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
