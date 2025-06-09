import { DonationWithDetails } from "../../data/donations";
import { EmailGenerationService } from "./service";
import { InstructionRefinementAgent } from "./instruction-agent";
import { DonorInfo, Organization, RawCommunicationThread, DonorStatistics } from "./types";
import { getOrganizationMemories } from "../../data/organizations";
import { getUserMemories } from "../../data/users";

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
  }>;
  suggestedMemories?: string[];
}> {
  // Create the email generation service
  const emailGenerator = new EmailGenerationService();

  // Create the instruction refinement agent with the email generator
  const instructionAgent = new InstructionRefinementAgent(emailGenerator);

  // First, refine the instruction using the first agent
  const refinementResult = await instructionAgent.refineInstruction({
    userInstruction,
    organizationWritingInstructions,
    userMemories,
    organizationMemories,
    dismissedMemories: [], // Empty array for dismissed memories since they're not needed here
  });

  // Then, use the refined instruction to generate emails using the second agent
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

  // Return both the refinement information and the generated emails
  return {
    refinedInstruction: refinementResult.refinedInstruction,
    reasoning: refinementResult.reasoning,
    emails,
    suggestedMemories: refinementResult.suggestedMemories,
  };
}
