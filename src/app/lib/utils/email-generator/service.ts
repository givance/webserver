import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { DonationWithDetails } from "../../data/donations";
import { buildEmailPrompt } from "./prompt-builder";
import {
  DonorInfo,
  EmailGeneratorTool,
  EmailPiece,
  GenerateEmailOptions,
  GeneratedEmail,
  Organization,
  RawCommunicationThread,
} from "./types";

/**
 * Email generation service that implements the EmailGeneratorTool interface.
 * This service takes refined instructions from the instruction agent and generates
 * personalized emails using AI.
 */
export class EmailGenerationService implements EmailGeneratorTool {
  /**
   * Generates personalized emails for multiple donors using refined instructions.
   */
  async generateEmails(
    donors: DonorInfo[],
    refinedInstruction: string,
    organizationName: string,
    organization: Organization | null,
    organizationWritingInstructions?: string,
    communicationHistories: Record<number, RawCommunicationThread[]> = {},
    donationHistories: Record<number, DonationWithDetails[]> = {},
    personalMemories: string[] = [],
    organizationalMemories: string[] = []
  ): Promise<GeneratedEmail[]> {
    logger.info("Starting batch email generation:", {
      donorCount: donors.length,
      refinedInstruction,
      organizationName,
      hasOrganization: !!organization,
      hasWritingInstructions: !!organizationWritingInstructions,
      communicationHistoriesCount: Object.keys(communicationHistories).length,
      donationHistoriesCount: Object.keys(donationHistories).length,
    });

    const emailPromises = donors.map(async (donor) => {
      const donorCommHistory = communicationHistories[donor.id] || [];
      logger.info(`Processing donor ${donor.id}:`, {
        firstName: donor.firstName,
        lastName: donor.lastName,
        commHistoryCount: donorCommHistory.length,
        donationHistoryCount: donationHistories[donor.id]?.length || 0,
      });

      return await this.generateDonorEmail({
        donor,
        instruction: refinedInstruction,
        organizationName,
        organization,
        organizationWritingInstructions,
        communicationHistory: donorCommHistory,
        donationHistory: donationHistories[donor.id] || [],
        personalMemories,
        organizationalMemories,
      }).catch((error) => {
        logger.error(`Failed to generate email for donor ${donor.id}`, {
          donorId: donor.id,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          type: error instanceof Error ? error.constructor.name : typeof error,
        });
        throw error;
      });
    });

    try {
      const results = await Promise.all(emailPromises);
      logger.info("Successfully generated all emails:", {
        totalEmails: results.length,
        donorIds: results.map((r) => r.donorId),
      });
      return results;
    } catch (batchError) {
      logger.error("Error during batch email generation:", {
        error: batchError instanceof Error ? batchError.message : "Unknown batch error",
        stack: batchError instanceof Error ? batchError.stack : undefined,
        type: batchError instanceof Error ? batchError.constructor.name : typeof batchError,
      });
      throw batchError;
    }
  }

  /**
   * Generates a personalized email for a single donor using AI, with structured content and references.
   */
  private async generateDonorEmail(options: GenerateEmailOptions): Promise<GeneratedEmail> {
    const {
      donor,
      instruction,
      organizationName,
      organization,
      organizationWritingInstructions,
      communicationHistory,
      donationHistory = [],
      personalMemories,
      organizationalMemories,
    } = options;

    logger.info(`Starting email generation for donor ${donor.id}:`, {
      instruction,
      organizationName,
      hasOrganization: !!organization,
      hasWritingInstructions: !!organizationWritingInstructions,
      communicationHistoryCount: communicationHistory?.length || 0,
      donationHistoryCount: donationHistory.length,
    });

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
      donationHistory,
      personalMemories,
      organizationalMemories
    );

    console.log(prompt);

    logger.info(`Built email prompt for donor ${donor.id}:`, {
      promptLength: prompt.length,
      donationContextsCount: Object.keys(donationContexts).length,
      model: env.MID_MODEL,
    });

    try {
      logger.info(`Sending prompt to OpenAI for donor ${donor.id}`);
      const { text: aiResponse } = await generateText({
        model: openai(env.MID_MODEL),
        prompt,
      }).catch((error) => {
        logger.error(`OpenAI API call failed for donor ${donor.id}:`, {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          type: error instanceof Error ? error.constructor.name : typeof error,
        });
        throw error;
      });

      logger.info(`Received OpenAI response for donor ${donor.id}:`, {
        responseLength: aiResponse?.length || 0,
        firstFewChars: aiResponse?.substring(0, 100) + "...",
      });

      try {
        const trimmedResponse = aiResponse.trim();
        logger.info(`Parsing JSON response for donor ${donor.id}:`, {
          trimmedLength: trimmedResponse.length,
          firstFewChars: trimmedResponse.substring(0, 50) + "...",
        });

        interface AIResponse {
          subject: string;
          content: EmailPiece[];
        }
        const parsedResponse = JSON.parse(trimmedResponse) as AIResponse;

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
          logger.error(`Invalid response structure for donor ${donor.id}:`, {
            hasResponse: !!parsedResponse,
            isObject: typeof parsedResponse === "object",
            hasSubject: !!parsedResponse?.subject,
            hasContent: Array.isArray(parsedResponse?.content),
            contentLength: parsedResponse?.content?.length,
            response: parsedResponse,
          });
          throw new Error("AI response is not in the expected JSON format with subject and structured content.");
        }

        // Build reference contexts
        const referenceContexts: Record<string, string> = {
          ...donationContexts,
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

        logger.info(`Successfully generated email for donor ${donor.id}:`, {
          subjectLength: parsedResponse.subject.length,
          contentPieces: parsedResponse.content.length,
          referenceContextsCount: Object.keys(referenceContexts).length,
        });

        return {
          donorId: donor.id,
          subject: parsedResponse.subject,
          structuredContent: parsedResponse.content,
          referenceContexts,
        };
      } catch (parseError) {
        logger.error(`Failed to parse AI response for donor ${donor.id}:`, {
          error: parseError instanceof Error ? parseError.message : "Unknown parsing error",
          stack: parseError instanceof Error ? parseError.stack : undefined,
          aiResponse,
        });
        throw new Error(
          `Failed to parse email generation response: ${parseError instanceof Error ? parseError.message : parseError}`
        );
      }
    } catch (error) {
      logger.error(`Failed to generate email for donor ${donor.id}:`, {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : typeof error,
      });
      throw error;
    }
  }
}
