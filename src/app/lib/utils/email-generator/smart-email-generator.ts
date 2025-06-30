import { DonationWithDetails } from "../../data/donations";
import { logger } from "../../logger";
import { PersonResearchResult } from "../../services/person-research/types";
import { EmailGenerationService } from "./service";
import {
  DonorInfo,
  DonorStatistics,
  EmailGenerationTokenUsage,
  Organization,
  RawCommunicationThread,
  TokenUsage,
  addTokenUsage,
  createEmptyEmailGenerationTokenUsage,
  GeneratedEmail,
} from "./types";

/**
 * Generates personalized donor emails using a two-agent system:
 * 1. An instruction refinement agent that improves the user's instructions
 * 2. An email generation service that uses the refined instructions to create emails
 *
 * @param donors - List of donors to generate emails for
 * @param userInstruction - Original instruction from the user
 * @param organizationName - Name of the organization
 * @param organization - Organization details
 * @param organizationWritingInstructions - Optional writing guidelines
 * @param communicationHistories - Optional map of donor communication histories
 * @param donationHistories - Optional map of donor donation histories
 * @param donorStatistics - Optional map of comprehensive donor statistics
 * @param personResearchResults - Optional map of person research results
 * @param userMemories - User's personal memories
 * @param organizationMemories - Organization-wide memories
 * @param currentDate - Current date for time-sensitive content
 * @param previousInstruction - Previous refined instruction to build upon
 * @param chatHistory - Optional chat history
 * @returns Object containing refined instruction, reasoning, and generated emails
 */
export async function generateSmartDonorEmails(
  donors: DonorInfo[],
  userInstruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  staffWritingInstructions?: string, // New parameter for staff-specific instructions
  communicationHistories: Record<number, RawCommunicationThread[]> = {},
  donationHistories: Record<number, DonationWithDetails[]> = {},
  donorStatistics: Record<number, DonorStatistics> = {},
  personResearchResults: Record<number, PersonResearchResult> = {},
  userMemories: string[] = [],
  organizationMemories: string[] = [],
  currentDate?: string,
  previousInstruction?: string,
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{
  refinedInstruction: string;
  reasoning: string;
  emails: GeneratedEmail[];
  suggestedMemories?: string[];
  tokenUsage: EmailGenerationTokenUsage;
}> {
  // Extract and concatenate all user messages from chat history to form the complete user instruction
  let completeUserInstruction = userInstruction;

  // Ensure chatHistory is an array
  const validChatHistory = Array.isArray(chatHistory) ? chatHistory : [];

  logger.info(`[generateSmartDonorEmails] ENTRY POINT - Starting NEW FORMAT generation for ${donors.length} donors`);
  logger.info(
    `[generateSmartDonorEmails] chatHistory type: ${typeof chatHistory}, isArray: ${Array.isArray(chatHistory)}`
  );
  logger.info(`[generateSmartDonorEmails] userInstruction: "${userInstruction}"`);

  if (validChatHistory.length > 0) {
    const userMessages = validChatHistory.filter((msg) => msg.role === "user").map((msg) => msg.content);
    if (userMessages.length > 0) {
      completeUserInstruction = userMessages.join(" ");
      logger.info(
        `[generateSmartDonorEmails] Concatenated ${userMessages.length} user messages from chat history to form complete instruction`
      );
    }
  }

  logger.info(
    `[generateSmartDonorEmails] Starting smart donor email generation for ${
      donors.length
    } donors with instruction: "${completeUserInstruction}" (previousInstruction: ${
      previousInstruction ? `"${previousInstruction}"` : "none"
    }, chatHistoryLength: ${validChatHistory.length})`
  );

  // Initialize token usage tracking
  const tokenUsage = createEmptyEmailGenerationTokenUsage();

  // Create the email generation service
  const emailGenerator = new EmailGenerationService();

  // Then, use the refined instruction to generate emails using the second agent
  logger.info(`[generateSmartDonorEmails] Starting email generation stage for ${donors.length} donors`);
  // Determine which writing instructions to use - staff overrides organizational

  logger.info(`[generateSmartDonorEmails] completeUserInstruction: "${completeUserInstruction}"`);
  logger.info(`[generateSmartDonorEmails] previousInstruction: "${previousInstruction}"`);

  const emails = await emailGenerator.generateEmails(
    donors,
    "",
    organizationName,
    organization,
    organizationWritingInstructions, // Use effective writing instructions
    staffWritingInstructions,
    communicationHistories,
    donationHistories,
    donorStatistics, // Pass donor statistics
    personResearchResults, // Pass person research results
    userMemories,
    organizationMemories,
    currentDate,
    completeUserInstruction // Pass the complete user instruction
  );

  logger.info(`[generateSmartDonorEmails] Generated ${emails.length} emails, checking format...`);

  // Log first email to verify format
  if (emails.length > 0) {
    const firstEmail = emails[0];
    logger.info(
      `[generateSmartDonorEmails] First email format check - donorId: ${
        firstEmail.donorId
      }, hasEmailContent: ${!!firstEmail.emailContent}, hasReasoning: ${!!firstEmail.reasoning}, hasResponse: ${!!firstEmail.response}, hasStructuredContent: ${!!firstEmail.structuredContent}, structuredContentLength: ${
        firstEmail.structuredContent?.length || 0
      }, responseLength: ${firstEmail.response?.length || 0}`
    );
  }

  // Accumulate email generation tokens from all individual emails
  emails.forEach((email) => {
    tokenUsage.emailGeneration = addTokenUsage(tokenUsage.emailGeneration, email.tokenUsage);
  });

  // Calculate total tokens
  tokenUsage.total = addTokenUsage(tokenUsage.instructionRefinement, tokenUsage.emailGeneration);

  // Log comprehensive token usage summary
  logger.info(
    `[generateSmartDonorEmails] Smart donor email generation completed successfully - Donors: ${donors.length}, Instruction: "${completeUserInstruction}"`
  );

  logger.info(
    `[generateSmartDonorEmails] Token usage summary for email generation: Instruction Refinement: ${tokenUsage.instructionRefinement.totalTokens} tokens (${tokenUsage.instructionRefinement.promptTokens} input, ${tokenUsage.instructionRefinement.completionTokens} output), Email Generation: ${tokenUsage.emailGeneration.totalTokens} tokens (${tokenUsage.emailGeneration.promptTokens} input, ${tokenUsage.emailGeneration.completionTokens} output), TOTAL: ${tokenUsage.total.totalTokens} tokens (${tokenUsage.total.promptTokens} input, ${tokenUsage.total.completionTokens} output)`
  );

  // Return both the refinement information and the generated emails
  return {
    refinedInstruction: "",
    reasoning: "",
    emails,
    suggestedMemories: [],
    tokenUsage,
  };
}
