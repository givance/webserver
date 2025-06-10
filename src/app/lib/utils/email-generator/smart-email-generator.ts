import { DonationWithDetails } from "../../data/donations";
import { EmailGenerationService } from "./service";
import { InstructionRefinementAgent } from "./instruction-agent";
import {
  DonorInfo,
  Organization,
  RawCommunicationThread,
  DonorStatistics,
  TokenUsage,
  EmailGenerationTokenUsage,
  createEmptyEmailGenerationTokenUsage,
  addTokenUsage,
} from "./types";
import { getOrganizationMemories } from "../../data/organizations";
import { getUserMemories } from "../../data/users";
import { logger } from "../../logger";

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
 * @param userMemories - User's personal memories
 * @param organizationMemories - Organization-wide memories
 * @param currentDate - Current date for time-sensitive content
 * @param emailSignature - Optional email signature
 * @returns Object containing refined instruction, reasoning, and generated emails
 */
export async function generateSmartDonorEmails(
  donors: DonorInfo[],
  userInstruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  communicationHistories: Record<number, RawCommunicationThread[]> = {},
  donationHistories: Record<number, DonationWithDetails[]> = {},
  donorStatistics: Record<number, DonorStatistics> = {},
  userMemories: string[] = [],
  organizationMemories: string[] = [],
  currentDate?: string,
  emailSignature?: string
): Promise<{
  refinedInstruction: string;
  reasoning: string;
  emails: Array<{
    donorId: number;
    subject: string;
    structuredContent: Array<{
      piece: string;
      references: string[];
      addNewlineAfter: boolean;
    }>;
    referenceContexts: Record<string, string>;
    tokenUsage: TokenUsage;
  }>;
  suggestedMemories?: string[];
  tokenUsage: EmailGenerationTokenUsage;
}> {
  logger.info(
    `Starting smart donor email generation for ${donors.length} donors with instruction: "${userInstruction}"`
  );

  // Initialize token usage tracking
  const tokenUsage = createEmptyEmailGenerationTokenUsage();

  // Create the email generation service
  const emailGenerator = new EmailGenerationService();

  // Create the instruction refinement agent with the email generator
  const instructionAgent = new InstructionRefinementAgent(emailGenerator);

  // First, refine the instruction using the first agent
  logger.info("Starting instruction refinement stage");
  const refinementResult = await instructionAgent.refineInstruction({
    userInstruction,
    organizationWritingInstructions,
    userMemories,
    organizationMemories,
    dismissedMemories: [], // Empty array for dismissed memories since they're not needed here
  });

  // Accumulate instruction refinement tokens
  tokenUsage.instructionRefinement = addTokenUsage(tokenUsage.instructionRefinement, refinementResult.tokenUsage);

  logger.info(`Instruction refinement completed. Refined instruction: "${refinementResult.refinedInstruction}"`);

  // Then, use the refined instruction to generate emails using the second agent
  logger.info(`Starting email generation stage for ${donors.length} donors`);
  const emails = await emailGenerator.generateEmails(
    donors,
    refinementResult.refinedInstruction,
    organizationName,
    organization,
    organizationWritingInstructions,
    communicationHistories,
    donationHistories,
    donorStatistics, // Pass donor statistics
    userMemories,
    organizationMemories,
    currentDate,
    emailSignature
  );

  // Accumulate email generation tokens from all individual emails
  emails.forEach((email) => {
    tokenUsage.emailGeneration = addTokenUsage(tokenUsage.emailGeneration, email.tokenUsage);
  });

  // Calculate total tokens
  tokenUsage.total = addTokenUsage(tokenUsage.instructionRefinement, tokenUsage.emailGeneration);

  // Log comprehensive token usage summary
  logger.info(
    `Smart donor email generation completed successfully - Donors: ${donors.length}, Instruction: "${userInstruction}"`
  );

  logger.info(
    `Token usage summary for email generation: Instruction Refinement: ${tokenUsage.instructionRefinement.totalTokens} tokens (${tokenUsage.instructionRefinement.promptTokens} input, ${tokenUsage.instructionRefinement.completionTokens} output), Email Generation: ${tokenUsage.emailGeneration.totalTokens} tokens (${tokenUsage.emailGeneration.promptTokens} input, ${tokenUsage.emailGeneration.completionTokens} output), TOTAL: ${tokenUsage.total.totalTokens} tokens (${tokenUsage.total.promptTokens} input, ${tokenUsage.total.completionTokens} output)`
  );

  // Return both the refinement information and the generated emails
  return {
    refinedInstruction: refinementResult.refinedInstruction,
    reasoning: refinementResult.reasoning,
    emails,
    suggestedMemories: refinementResult.suggestedMemories,
    tokenUsage,
  };
}
