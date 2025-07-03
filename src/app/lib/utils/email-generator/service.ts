import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import { z } from "zod";
import { DonationWithDetails } from "../../data/donations";
import { PersonResearchResult } from "../../services/person-research/types";
import { formatDonorName } from "../donor-name-formatter";
import {
  DonorInfo,
  DonorStatistics,
  EmailGeneratorTool,
  EmailPiece,
  GenerateEmailOptions,
  GeneratedEmail,
  Organization,
  RawCommunicationThread,
  TokenUsage,
  createEmptyTokenUsage,
} from "./types";

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
    userMemories: string[] = [],
    organizationMemories: string[] = [],
    currentDate?: string,
    originalInstruction?: string,
    staffName?: string
  ): Promise<GeneratedEmail[]> {
    logger.info(
      `[EmailGenerationService.generateEmails] ENTRY POINT - Starting generation for ${donors.length} donors`
    );
    logger.info(`[EmailGenerationService.generateEmails] Using NEW FORMAT generation path`);

    const generatedEmails: GeneratedEmail[] = [];

    // Generate emails for all donors concurrently
    const emailPromises = donors.map((donor) => {
      logger.info(
        `[EmailGenerationService.generateEmails] Starting generation for donor ${donor.id} (${formatDonorName(donor)})`
      );

      return this.generateDonorEmail({
        donor,
        instruction: originalInstruction || refinedInstruction, // Use original instruction if available, otherwise use refined
        organizationName,
        organization,
        organizationWritingInstructions,
        personalWritingInstructions,
        communicationHistory: communicationHistories[donor.id] || [],
        donationHistory: donationHistories[donor.id] || [],
        donorStatistics: donorStatistics[donor.id],
        personResearch: personResearchResults[donor.id],
        personalMemories: userMemories,
        organizationalMemories: organizationMemories,
        currentDate,
        originalInstruction,
        staffName,
      });
    });

    const emails = await Promise.all(emailPromises);
    generatedEmails.push(...emails);

    logger.info(`[EmailGenerationService.generateEmails] Generated ${generatedEmails.length} emails`);

    // Log format verification for first email
    if (generatedEmails.length > 0) {
      const firstEmail = generatedEmails[0];
      logger.info(
        `[EmailGenerationService.generateEmails] First email verification - donorId: ${
          firstEmail.donorId
        }, hasEmailContent: ${!!firstEmail.emailContent}, hasReasoning: ${!!firstEmail.reasoning}, emailContentLength: ${
          firstEmail.emailContent?.length || 0
        }, reasoningLength: ${firstEmail.reasoning?.length || 0}`
      );
      logger.info(
        `[EmailGenerationService.generateEmails] First email legacy fields - hasStructuredContent: ${!!firstEmail.structuredContent}, structuredContentLength: ${
          firstEmail.structuredContent?.length || 0
        }, hasReferenceContexts: ${!!firstEmail.referenceContexts}`
      );
    }

    return generatedEmails;
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
      staffName,
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

    // Build a new prompt for the new format (subject, reasoning, emailContent)
    const newFormatPrompt = await this.buildNewFormatPrompt(
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
      donationContexts,
      currentDate,
      originalInstruction,
      staffName
    );

    logger.info(
      `[EmailGenerationService.generateDonorEmail] Built NEW FORMAT prompt for donor ${donor.id}: promptLength=${
        newFormatPrompt.length
      }, donationContextsCount=${Object.keys(donationContexts).length}`
    );

    try {
      // Define the new schema for the expected response
      const emailSchema = z.object({
        subject: z.string().min(1).max(100).describe("A compelling subject line for the email (1-100 characters)"),
        reasoning: z
          .string()
          .min(1)
          .describe(
            "Explanation of why this email was crafted this way, including strategy and personalization choices"
          ),
        emailContent: z
          .string()
          .min(1)
          .describe("Complete plain text email content without any structured pieces, reference markers, or signature"),
        response: z
          .string()
          .min(1)
          .describe(
            "A concise summary for the user highlighting what was accomplished, key donor insights utilized, and any important context that influenced the email"
          ),
      });

      logger.info(
        `[EmailGenerationService.generateDonorEmail] NEW SCHEMA DEFINED - Using schema with fields: subject, reasoning, emailContent, response`
      );

      let validatedResponse: z.infer<typeof emailSchema> | undefined;
      let attempt = 1;
      const maxAttempts = 2;

      while (attempt <= maxAttempts) {
        logger.info(
          `[EmailGenerationService.generateDonorEmail] AI REQUEST ATTEMPT ${attempt}/${maxAttempts} for donor ${donor.id}`
        );
        logger.info(`[EmailGenerationService.generateDonorEmail] AI REQUEST PROMPT: ${newFormatPrompt}`);

        try {
          const result = await generateObject({
            model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
            schema: emailSchema,
            prompt: newFormatPrompt,
            temperature: 0.7,
          });

          logger.info(
            `[EmailGenerationService.generateDonorEmail] AI RESPONSE RAW for donor ${donor.id}:`,
            JSON.stringify(result.object, null, 2)
          );
          logger.info(
            `[EmailGenerationService.generateDonorEmail] AI RESPONSE ANALYSIS - hasSubject: ${!!result.object
              .subject}, hasReasoning: ${!!result.object.reasoning}, hasEmailContent: ${!!result.object
              .emailContent}, hasResponse: ${!!result.object.response}`
          );
          logger.info(
            `[EmailGenerationService.generateDonorEmail] AI RESPONSE FIELD LENGTHS - subject: ${
              result.object.subject?.length || 0
            }, reasoning: ${result.object.reasoning?.length || 0}, emailContent: ${
              result.object.emailContent?.length || 0
            }, response: ${result.object.response?.length || 0}`
          );

          // Validate the response
          validatedResponse = emailSchema.parse(result.object);
          logger.info(
            `[EmailGenerationService.generateDonorEmail] AI RESPONSE VALIDATION SUCCESS for donor ${donor.id} on attempt ${attempt}`
          );

          // Extract token usage information
          const tokenUsage: TokenUsage = {
            promptTokens: result.usage?.promptTokens || 0,
            completionTokens: result.usage?.completionTokens || 0,
            totalTokens: result.usage?.totalTokens || 0,
          };

          logger.info(
            `[EmailGenerationService.generateDonorEmail] TOKEN USAGE for donor ${donor.id}: ${tokenUsage.totalTokens} tokens (${tokenUsage.promptTokens} input, ${tokenUsage.completionTokens} output)`
          );

          // Store token usage for later use
          (validatedResponse as any).tokenUsage = tokenUsage;
          break;
        } catch (error: any) {
          logger.error(
            `[EmailGenerationService.generateDonorEmail] AI REQUEST/VALIDATION FAILED for donor ${
              donor.id
            } on attempt ${attempt}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
          if (attempt === maxAttempts) {
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
        }", reasoning="${validatedResponse.reasoning.substring(0, 100)}...", emailContentLength=${
          validatedResponse.emailContent.length
        }`
      );

      logger.info(
        `[EmailGenerationService.generateDonorEmail] NEW FORMAT EMAIL GENERATED: ${JSON.stringify(
          validatedResponse,
          null,
          2
        )}`
      );

      // Build basic reference contexts for legacy compatibility only
      const referenceContexts: Record<string, string> = {
        "email-content": "Generated email content",
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

      // Create legacy structured format ONLY for backward compatibility in the response
      // This will NOT be saved to database - only used for components that still expect it
      const legacyStructuredContent: EmailPiece[] = [
        {
          piece: validatedResponse.emailContent,
          references: ["email-content"],
          addNewlineAfter: false,
        },
      ];

      logger.info(
        `Successfully generated email for donor ${donor.id}: subject="${validatedResponse.subject}", emailContentLength=${validatedResponse.emailContent.length}, reasoningLength=${validatedResponse.reasoning.length}, responseLength=${validatedResponse.response.length}`
      );

      // Debug log to verify response field
      logger.info(
        `[DEBUG-RESPONSE] About to return email for donor ${
          donor.id
        } with response: "${validatedResponse.response.substring(0, 100)}..."`
      );

      return {
        donorId: donor.id,
        subject: validatedResponse.subject,
        // NEW FORMAT FIELDS (primary) - these will be saved to database
        emailContent: validatedResponse.emailContent,
        reasoning: validatedResponse.reasoning,
        response: validatedResponse.response,
        // LEGACY FORMAT FIELDS (compatibility only) - for components that still expect them
        structuredContent: legacyStructuredContent,
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

  private async buildNewFormatPrompt(
    donor: DonorInfo,
    instruction: string,
    organizationName: string,
    organization: Organization | null,
    organizationWritingInstructions?: string,
    personalWritingInstructions?: string,
    communicationHistory: RawCommunicationThread[] = [],
    donationHistory: DonationWithDetails[] = [],
    donorStatistics?: DonorStatistics,
    personResearch?: PersonResearchResult,
    personalMemories: string[] = [],
    organizationalMemories: string[] = [],
    donationContexts: Record<string, string> = {},
    currentDate?: string,
    originalInstruction?: string,
    staffName?: string
  ): Promise<string> {
    // Build system prompt for new format
    const systemPrompt = `You are an expert fundraising copywriter specializing in donor reengagement emails for ${organizationName}.

ORGANIZATION CONTEXT:
${organization?.description ? `Organization Description: ${organization.description}` : ""}
${organization?.rawWebsiteSummary ? `Organization Website Summary: ${organization.rawWebsiteSummary}` : ""}
${staffName ? `Email is being sent by: ${staffName}` : ""}
${organizationWritingInstructions ? `Organization Writing Guidelines: ${organizationWritingInstructions}` : ""}
${personalWritingInstructions ? `Personal Writing Guidelines: ${personalWritingInstructions}` : ""}

${personalMemories.length > 0 ? `Personal Memories:\n${personalMemories.join("\n")}\n` : ""}
${organizationalMemories.length > 0 ? `Organization Memories:\n${organizationalMemories.join("\n")}\n` : ""}

CURRENT DATE: ${currentDate || new Date().toLocaleDateString()}

TASK: You must generate a personalized donor reengagement email with the following structure:
1. **subject**: A compelling subject line (50 characters max)
2. **reasoning**: Technical explanation of your email strategy and personalization tactics (e.g., "Referenced recent donation to create connection, used urgency based on campaign deadline")
3. **emailContent**: The complete email content as plain text (120-150 words)
4. **response**: User-facing summary describing what was delivered (e.g., "Created a warm re-engagement email for Sarah highlighting her $500 Education Fund contribution. The email emphasizes her impact on student scholarships and invites continued support.")

IMPORTANT: The reasoning explains WHY you made certain choices. The response tells the USER WHAT you delivered and key donor context used.

REQUIREMENTS:
- Write for a mid-level donor ($250-$999) who hasn't donated in 12-48 months
- Tone: Warm, personal, confident
- Use specific donation amounts and dates from the history when available
- Reference their impact using past donation history
- DO NOT include any signature, closing, or sign-off - this is added automatically
- DO NOT use reference markers, footnotes, or bracketed placeholders
- Be specific and avoid general statements

Wher writing, if there are conflicts in the instructions, you should prioritize as below:
* The user message later, after this system message.
* The notes for each donor.
* The personal writing instructions.
* The organization writing instructions.`;

    // Build donor context
    let donorContext = "";

    // Task section
    if (originalInstruction && originalInstruction.trim() !== instruction.trim()) {
      donorContext += `ORIGINAL USER INSTRUCTION: ${originalInstruction}\nREFINED INSTRUCTION: ${instruction}\n\n`;
    } else {
      donorContext += `TASK: ${instruction}\n\n`;
    }

    // Donor basic info
    donorContext += `DONOR: ${formatDonorName(donor)} (${donor.email})\n`;
    if (donor.notes) {
      donorContext += `User Notes about this Donor: ${JSON.stringify(donor.notes)}\n`;
    }

    // Donation contexts
    if (Object.keys(donationContexts).length > 0) {
      donorContext += "\nDONATION INFORMATION:\n";
      Object.entries(donationContexts).forEach(([key, value]) => {
        donorContext += `- ${value}\n`;
      });
    }

    // Communication history if available
    if (communicationHistory.length > 0) {
      donorContext += "\nPAST COMMUNICATIONS:\n";
      communicationHistory.forEach((thread, index) => {
        if (thread.content && thread.content.length > 0) {
          donorContext += `Communication ${index + 1}: ${thread.content[0].content.substring(0, 200)}...\n`;
        }
      });
    }

    return `${systemPrompt}\n\n${donorContext}`;
  }
}
