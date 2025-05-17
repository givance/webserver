import { DonationWithDetails } from "../../data/donations";
import { EmailGenerationService } from "./service";
import { InstructionRefinementAgent } from "./instruction-agent";
import { DonorInfo, Organization, RawCommunicationThread } from "./types";
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
 * @param previousInstruction - Optional previous instruction for context
 * @param userFeedback - Optional feedback on previous results
 * @param communicationHistories - Optional map of donor communication histories
 * @param donationHistories - Optional map of donor donation histories
 * @returns Object containing refined instruction, reasoning, and generated emails
 */
export async function generateSmartDonorEmails(
  donors: DonorInfo[],
  userInstruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  previousInstruction?: string,
  userFeedback?: string,
  communicationHistories: Record<number, RawCommunicationThread[]> = {},
  donationHistories: Record<number, DonationWithDetails[]> = {},
  userMemories: string[] = [],
  organizationMemories: string[] = []
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
}> {
  // Create the email generation service
  const emailGenerator = new EmailGenerationService();

  // Create the instruction refinement agent with the email generator
  const instructionAgent = new InstructionRefinementAgent(emailGenerator);

  // First, refine the instruction using the first agent
  const refinementResult = await instructionAgent.refineInstruction({
    userInstruction,
    previousInstruction,
    userFeedback,
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
    userMemories,
    organizationMemories
  );

  // Return both the refinement information and the generated emails
  return {
    refinedInstruction: refinementResult.refinedInstruction,
    reasoning: refinementResult.reasoning,
    emails,
  };
}
