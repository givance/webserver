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
 * Generates personalized donor emails using chat history context
 *
 * @param donors - List of donors to generate emails for
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
 * @param chatHistory - Optional chat history
 * @param staffName - Optional staff name
 * @returns Object containing generated emails
 */
export async function generateSmartDonorEmails(
  donors: DonorInfo[],
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  staffWritingInstructions?: string,
  communicationHistories: Record<number, RawCommunicationThread[]> = {},
  donationHistories: Record<number, DonationWithDetails[]> = {},
  donorStatistics: Record<number, DonorStatistics> = {},
  personResearchResults: Record<number, PersonResearchResult> = {},
  userMemories: string[] = [],
  organizationMemories: string[] = [],
  currentDate?: string,
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  staffName?: string
): Promise<{
  reasoning: string;
  emails: GeneratedEmail[];
  suggestedMemories?: string[];
  tokenUsage: EmailGenerationTokenUsage;
}> {
  // Ensure chatHistory is an array
  const validChatHistory = Array.isArray(chatHistory) ? chatHistory : [];

  logger.info(`[generateSmartDonorEmails] ENTRY POINT - Starting NEW FORMAT generation for ${donors.length} donors`);
  logger.info(
    `[generateSmartDonorEmails] chatHistory type: ${typeof chatHistory}, isArray: ${Array.isArray(chatHistory)}, chatHistoryLength: ${validChatHistory.length}`
  );

  logger.info(
    `[generateSmartDonorEmails] Starting smart donor email generation for ${donors.length} donors using chat history context`
  );

  // Initialize token usage tracking
  const tokenUsage = createEmptyEmailGenerationTokenUsage();

  // Create the email generation service
  const emailGenerator = new EmailGenerationService();

  // Generate emails using the email generation service
  logger.info(`[generateSmartDonorEmails] Starting email generation stage for ${donors.length} donors`);

  const emails = await emailGenerator.generateEmails(
    donors,
    "", // No longer using refined instruction
    organizationName,
    organization,
    organizationWritingInstructions,
    staffWritingInstructions,
    communicationHistories,
    donationHistories,
    donorStatistics,
    personResearchResults,
    userMemories,
    organizationMemories,
    currentDate,
    staffName
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

  // Calculate total tokens (only email generation now)
  tokenUsage.total = tokenUsage.emailGeneration;

  // Log comprehensive token usage summary
  logger.info(
    `[generateSmartDonorEmails] Smart donor email generation completed successfully - Donors: ${donors.length}`
  );

  logger.info(
    `[generateSmartDonorEmails] Token usage summary for email generation: Email Generation: ${tokenUsage.emailGeneration.totalTokens} tokens (${tokenUsage.emailGeneration.promptTokens} input, ${tokenUsage.emailGeneration.completionTokens} output), TOTAL: ${tokenUsage.total.totalTokens} tokens (${tokenUsage.total.promptTokens} input, ${tokenUsage.total.completionTokens} output)`
  );

  // Return the generated emails
  return {
    reasoning: "",
    emails,
    suggestedMemories: [],
    tokenUsage,
  };
}
