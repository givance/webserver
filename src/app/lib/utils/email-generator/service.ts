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
    donationHistories: Record<number, DonationWithDetails[]> = {}
  ): Promise<GeneratedEmail[]> {
    logger.info(
      `Starting batch generation of emails. Number of donors: ${donors.length}. Refined instruction: "${refinedInstruction}".`
    );

    const emailPromises = donors.map(async (donor) => {
      const donorCommHistory = communicationHistories[donor.id] || [];

      return await this.generateDonorEmail({
        donor,
        instruction: refinedInstruction,
        organizationName,
        organization,
        organizationWritingInstructions,
        communicationHistory: donorCommHistory,
        donationHistory: donationHistories[donor.id] || [],
      }).catch((error) => {
        logger.error(`Failed to generate email for donor ${donor.id} in batch`, {
          donorId: donor.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
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
      }) with refined instruction: "${instruction}". Donation history count: ${
        donationHistory?.length || 0
      }. Communication history count: ${communicationHistory?.length || 0}.`
    );

    try {
      const { text: aiResponse } = await generateText({
        model: openai(env.MID_MODEL),
        prompt,
      });

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
      throw new Error(
        `Email generation failed for donor ${donor.id}: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}
