import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import { z } from "zod";
import { DonationWithDetails } from "../../data/donations";
import { formatDonorName } from "../donor-name-formatter";
import { buildStructuredEmailPrompt } from "./prompt-builder-structured";
import {
  DonorInfo,
  DonorStatistics,
  EmailGeneratorTool,
  GenerateEmailOptions,
  GeneratedEmail,
  Organization,
  RawCommunicationThread,
  TokenUsage,
  createEmptyTokenUsage,
} from "./types";
import { PersonResearchResult } from "../../services/person-research/types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

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
    personalWritingInstructions?: string,
    communicationHistories: Record<number, RawCommunicationThread[]> = {},
    donationHistories: Record<number, DonationWithDetails[]> = {},
    donorStatistics: Record<number, DonorStatistics> = {},
    personResearchResults: Record<number, PersonResearchResult> = {},
    personalMemories: string[] = [],
    organizationalMemories: string[] = [],
    currentDate?: string,
    emailSignature?: string,
    originalInstruction?: string
  ): Promise<GeneratedEmail[]> {
    logger.info(
      `Starting batch email generation for ${
        donors.length
      } donors (refinedInstruction: ${refinedInstruction}, organizationName: ${organizationName}, hasOrganization: ${!!organization}, hasWritingInstructions: ${!!organizationWritingInstructions}, communicationHistoriesCount: ${
        Object.keys(communicationHistories).length
      }, donationHistoriesCount: ${Object.keys(donationHistories).length}, donorStatisticsCount: ${
        Object.keys(donorStatistics).length
      }, currentDate: ${currentDate || "not provided"}, hasOriginalInstruction: ${!!originalInstruction})`
    );

    const promises = donors.map((donor) =>
      this.generateDonorEmail({
        donor,
        instruction: refinedInstruction,
        organizationName,
        organization,
        organizationWritingInstructions,
        personalWritingInstructions,
        communicationHistory: communicationHistories[donor.id] || [],
        donationHistory: donationHistories[donor.id] || [],
        donorStatistics: donorStatistics[donor.id],
        personResearch: personResearchResults[donor.id],
        personalMemories,
        organizationalMemories,
        currentDate,
        originalInstruction,
      })
    );

    const results = await Promise.allSettled(promises);

    const successfulEmails: GeneratedEmail[] = [];
    const errors: string[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successfulEmails.push(result.value);
      } else {
        const donor = donors[index];
        const errorMessage = `Failed to generate email for donor ${donor.id} (${formatDonorName(donor)}): ${
          result.reason
        }`;
        errors.push(errorMessage);
        logger.error(errorMessage);
      }
    });

    logger.info(
      `Batch email generation completed: ${successfulEmails.length} successful, ${errors.length} failed out of ${donors.length} total donors`
    );

    if (errors.length > 0) {
      logger.error(`Errors during batch generation: ${errors.join("; ")}`);
    }

    return successfulEmails;
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
      personalWritingInstructions,
      communicationHistory,
      donationHistory = [],
      donorStatistics,
      personResearch,
      personalMemories,
      organizationalMemories,
      currentDate,
      originalInstruction,
    } = options;

    // Sort donations and prepare reference contexts
    const sortedDonations = [...donationHistory].sort((a, b) => b.date.getTime() - a.date.getTime());
    const donationContexts: Record<string, string> = {};

    // Build single donation context containing all donations
    if (sortedDonations.length > 0) {
      const donationDetails = sortedDonations
        .map((donation, index) => {
          const amount = (donation.amount / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          });
          const date = new Date(donation.date).toLocaleDateString();
          const project = donation.project ? ` to ${donation.project.name}` : "";
          return `${index + 1}. ${amount} on ${date}${project}`;
        })
        .join("\n");

      donationContexts["donation-context"] = `Complete donation history:\n${donationDetails}`;
    }

    // Add donor statistics contexts if available
    if (donorStatistics) {
      const totalAmount = (donorStatistics.totalAmount / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
      donationContexts["total-donations"] = `Total donations: ${donorStatistics.totalDonations}`;
      donationContexts["total-amount"] = `Total donated: ${totalAmount}`;

      if (donorStatistics.firstDonation) {
        const firstAmount = (donorStatistics.firstDonation.amount / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        });
        const firstDate = new Date(donorStatistics.firstDonation.date).toLocaleDateString();
        donationContexts["first-donation"] = `First donation: ${firstAmount} on ${firstDate}`;
      }

      if (donorStatistics.lastDonation) {
        const lastAmount = (donorStatistics.lastDonation.amount / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        });
        const lastDate = new Date(donorStatistics.lastDonation.date).toLocaleDateString();
        donationContexts["last-donation"] = `Most recent donation: ${lastAmount} on ${lastDate}`;
      }

      // Add project-specific donation amounts
      donorStatistics.donationsByProject.forEach((project, index) => {
        const projectAmount = (project.totalAmount / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        });
        const projectName = project.projectName || "General Fund";
        donationContexts[`project-total-${index + 1}`] = `${projectName}: ${projectAmount} total`;
      });
    }

    const promptParts = buildStructuredEmailPrompt(
      donor,
      instruction,
      organizationName,
      organization,
      organizationWritingInstructions,
      personalWritingInstructions,
      communicationHistory as RawCommunicationThread[],
      donationHistory,
      donorStatistics,
      personResearch,
      personalMemories,
      organizationalMemories,
      currentDate,
      originalInstruction
    );

    // Combine the system prompt and donor context for the AI call
    const prompt = `${promptParts.systemPrompt}\n\n${promptParts.donorContext}`;

    logger.info(
      `Built email prompt for donor ${donor.id}: systemPromptLength=${
        promptParts.systemPrompt.length
      }, donorContextLength=${promptParts.donorContext.length}, totalPromptLength=${
        prompt.length
      }, donationContextsCount=${Object.keys(donationContexts).length}, model=${env.MID_MODEL}`
    );

    try {
      // Define the schema for the expected response
      const emailSchema = z.object({
        subject: z.string().min(1).max(100).describe("A compelling subject line for the email (1-100 characters)"),
        content: z
          .array(
            z.object({
              piece: z
                .string()
                .min(1)
                .describe(
                  "A clean string segment of the email (sentence or paragraph) without any reference markers, footnote numbers, or bracketed placeholders"
                ),
              references: z
                .array(z.string())
                .describe("Array of context IDs that informed this piece (e.g., ['donation-context', 'comm-01-02'])"),
              addNewlineAfter: z
                .boolean()
                .describe("Whether a newline should be added after this piece for formatting"),
            })
          )
          .min(1)
          .describe("Array of email content pieces with references (at least 1 piece required)"),
      });

      let validatedResponse;
      let attempt = 1;
      const maxAttempts = 2;

      while (attempt <= maxAttempts) {
        try {
          logger.info(`Attempt ${attempt}/${maxAttempts} for donor ${donor.id}`);

          const result = await generateObject({
            model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
            messages: [
              { role: "system", content: promptParts.systemPrompt },
              { role: "user", content: promptParts.donorContext },
            ],
            schema: emailSchema,
            schemaName: "EmailResponse",
            schemaDescription: "A personalized donor email with subject and structured content pieces",
            temperature: 0.7,
          });

          logger.info(
            `Email prompt: ${JSON.stringify([
              { role: "system", content: promptParts.systemPrompt },
              { role: "user", content: promptParts.donorContext },
            ])}`
          );
          logger.info(`Email response: ${result.object}`);

          validatedResponse = result.object;

          const openaiMetadata = result.providerMetadata?.openai;
          console.log(openaiMetadata);

          // Extract token usage information
          const tokenUsage: TokenUsage = {
            promptTokens: result.usage?.promptTokens || 0,
            completionTokens: result.usage?.completionTokens || 0,
            totalTokens: result.usage?.totalTokens || 0,
          };

          logger.info(`Successfully generated object for donor ${donor.id} on attempt ${attempt}`);
          logger.info(
            `Token usage for donor ${donor.id} email generation: ${tokenUsage.totalTokens} tokens (${tokenUsage.promptTokens} input, ${tokenUsage.completionTokens} output)`
          );

          // Store token usage for later use
          (validatedResponse as any).tokenUsage = tokenUsage;
          break;
        } catch (error: any) {
          logger.error(
            `OpenAI generateObject call failed for donor ${donor.id} (attempt ${attempt}/${maxAttempts}): error="${
              error instanceof Error ? error.message : "Unknown error"
            }", type=${error instanceof Error ? error.constructor.name : typeof error}, errorName=${
              error?.name
            }, errorCode=${error?.code}`
          );

          if (attempt === maxAttempts) {
            logger.error(
              `All attempts failed for donor ${donor.id}. Prompt details: promptLength=${
                prompt.length
              }, donorName="${formatDonorName(donor)}", promptPreview="${prompt.substring(0, 500)}..."`
            );
            throw error;
          }

          attempt++;
          // Brief delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!validatedResponse) {
        throw new Error(`Failed to generate valid response for donor ${donor.id} after ${maxAttempts} attempts`);
      }

      logger.info(
        `Successfully received and validated OpenAI response for donor ${donor.id}: subject="${
          validatedResponse.subject
        }", subjectLength=${validatedResponse.subject.length}, contentPieces=${
          validatedResponse.content.length
        }, allReferences=[${validatedResponse.content.flatMap((p) => p.references).join(", ")}]`
      );

      // Build reference contexts
      const referenceContexts: Record<string, string> = {
        ...donationContexts,
      };

      // Add person research reference contexts if available
      if (personResearch) {
        referenceContexts["research-answer"] = `Person research: ${personResearch.answer}`;

        personResearch.citations.forEach((citation, index) => {
          const citationId = `research-citation-${index + 1}`;
          referenceContexts[citationId] = `Research source: ${citation.title} - ${citation.snippet}`;
        });
      }

      // Add communication and summary contexts
      validatedResponse.content.forEach((piece) => {
        piece.references.forEach((ref) => {
          if (ref.startsWith("comm-")) {
            const [_, threadIndex, messageIndex] = ref.split("-").map(Number);
            const thread = communicationHistory[threadIndex - 1];
            if (thread?.content?.[messageIndex - 1]) {
              const message = thread.content[messageIndex - 1];
              referenceContexts[ref] = `Previous message: ${message.content}`;
            }
          }
          // Website summary is disabled - skip summary-paragraph references
          // else if (ref.startsWith("summary-paragraph-")) {
          //   const paragraphIndex = parseInt(ref.split("-")[2]) - 1;
          //   const paragraphs = organization?.websiteSummary?.split(/\n\s*\n/) || [];
          //   if (paragraphs[paragraphIndex]) {
          //     referenceContexts[ref] = `Organization summary: ${paragraphs[paragraphIndex].trim()}`;
          //   }
          // }
        });
      });

      logger.info(
        `Successfully generated email for donor ${donor.id}: subjectLength=${
          validatedResponse.subject.length
        }, contentPieces=${validatedResponse.content.length}, referenceContextsCount=${
          Object.keys(referenceContexts).length
        }`
      );

      return {
        donorId: donor.id,
        subject: validatedResponse.subject,
        structuredContent: validatedResponse.content,
        referenceContexts,
        tokenUsage: (validatedResponse as any).tokenUsage || createEmptyTokenUsage(),
      };
    } catch (error: any) {
      logger.error(
        `Failed to generate email for donor ${donor.id}: error="${
          error instanceof Error ? error.message : "Unknown error"
        }", type=${error instanceof Error ? error.constructor.name : typeof error}`
      );
      throw error;
    }
  }
}
