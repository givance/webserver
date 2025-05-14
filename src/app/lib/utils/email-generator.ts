import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import type { Organization } from "@prisma/client";
import { CommunicationHistory } from "@/app/lib/data/communications";

interface DonorInfo {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface GenerateEmailOptions {
  donor: DonorInfo;
  instruction: string;
  organizationName: string;
  organization: Organization | null;
  organizationWritingInstructions?: string;
  communicationHistory: CommunicationHistory[];
}

interface GeneratedEmail {
  donorId: number;
  content: string;
}

/**
 * Generates a personalized email for a donor using AI.
 *
 * @param options - Configuration options for email generation
 * @returns Promise containing the generated email content
 */
export async function generateDonorEmail(options: GenerateEmailOptions): Promise<GeneratedEmail> {
  const { donor, instruction, organizationName, organization, organizationWritingInstructions, communicationHistory } =
    options;

  const prompt = `You are an expert in donor communications, helping to write personalized emails.

Organization: ${organizationName}
${organizationWritingInstructions ? `Organization Writing Instructions: ${organizationWritingInstructions}\n` : ""}

Organization context:
${organization?.websiteSummary || ""}

Donor Information:
- Name: ${donor.firstName} ${donor.lastName}
- Email: ${donor.email}

${
  communicationHistory.length
    ? `\nPast Communications:\n${communicationHistory
        .map((h) => h.content?.map((c: { content: string }) => c.content).join("\n"))
        .join("\n")}`
    : ""
}

User Instruction: ${instruction}

Guidelines for the email:
1. Keep it under 200 words
2. Write conversationally, as one person to another
3. Focus on donor impact, not organizational needs
4. Use only factual information - never fabricate stories or statistics
5. Use active voice and a warm, personal tone
6. Keep paragraphs to 1-3 sentences maximum
7. Include one clear call to action
8. Reference past communications if relevant
9. Write at a 4th-6th grade reading level
10. Use contractions to maintain a conversational tone

Structure the email with:
1. Personal greeting using first name
2. Opening that acknowledges their relationship/support
3. Body focusing on specific impact or real story
4. Clear, single call to action
5. Warm closing with gratitude
6. Professional signature

Email:`;

  logger.info("Generating email for donor", {
    donorId: donor.id,
    donorName: `${donor.firstName} ${donor.lastName}`,
    instruction,
  });

  try {
    const { text: emailContent } = await generateText({
      model: openai(env.MID_MODEL),
      prompt,
    });

    return {
      donorId: donor.id,
      content: emailContent.trim(),
    };
  } catch (error) {
    logger.error("Failed to generate email", {
      donorId: donor.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Generates personalized emails for multiple donors in parallel
 *
 * @param donors - Array of donor information
 * @param instruction - Email generation instruction
 * @param organizationName - Name of the organization
 * @param organization - Organization details
 * @param organizationWritingInstructions - Optional writing guidelines
 * @param communicationHistories - Map of donor IDs to their communication histories
 * @returns Promise containing array of generated emails
 */
export async function generateDonorEmails(
  donors: DonorInfo[],
  instruction: string,
  organizationName: string,
  organization: Organization | null,
  organizationWritingInstructions?: string,
  communicationHistories: Record<number, CommunicationHistory[]> = {}
): Promise<GeneratedEmail[]> {
  return Promise.all(
    donors.map((donor) =>
      generateDonorEmail({
        donor,
        instruction,
        organizationName,
        organization,
        organizationWritingInstructions,
        communicationHistory: communicationHistories[donor.id] || [],
      })
    )
  );
}
