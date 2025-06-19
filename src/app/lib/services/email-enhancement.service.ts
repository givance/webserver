import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateObject } from "ai";
import { z } from "zod";
import { DonationWithDetails } from "../data/donations";
import { formatDonorName } from "../utils/donor-name-formatter";
import {
  DonorInfo,
  DonorStatistics,
  Organization,
  RawCommunicationThread,
  TokenUsage,
  createEmptyTokenUsage,
} from "../utils/email-generator/types";
import { PersonResearchResult } from "./person-research/types";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Define the schema for the enhanced email
const enhancedEmailSchema = z.object({
  subject: z.string().describe("The enhanced email subject line"),
  structuredContent: z.array(
    z.object({
      piece: z.string().describe("A piece of the email content"),
      references: z.array(z.string()).describe("Reference IDs used in this piece"),
      addNewlineAfter: z.boolean().describe("Whether to add a newline after this piece"),
    })
  ).describe("The enhanced email content broken into structured pieces"),
  reasoning: z.string().describe("Brief explanation of how the enhancement instruction was applied"),
});

/**
 * Service for enhancing existing emails using AI
 */
export class EmailEnhancementService {
  /**
   * Enhances an existing email based on user instructions
   */
  async enhanceEmail(options: {
    emailId: number;
    donorId: number;
    donor: any;
    currentSubject: string;
    currentStructuredContent: Array<{
      piece: string;
      references: string[];
      addNewlineAfter: boolean;
    }>;
    currentReferenceContexts: Record<string, string>;
    enhancementInstruction: string;
    organizationName: string;
    organization: Organization | null;
    organizationWritingInstructions?: string;
    communicationHistory: RawCommunicationThread[];
    donationHistory: DonationWithDetails[];
    donorStatistics?: DonorStatistics;
    personResearch?: PersonResearchResult;
    userMemories: string[];
    organizationMemories: string[];
    originalInstruction: string;
  }) {
    const {
      emailId,
      donorId,
      donor,
      currentSubject,
      currentStructuredContent,
      currentReferenceContexts,
      enhancementInstruction,
      organizationName,
      organization,
      organizationWritingInstructions,
      communicationHistory,
      donationHistory,
      donorStatistics,
      personResearch,
      userMemories,
      organizationMemories,
      originalInstruction,
    } = options;

    logger.info(
      `Starting email enhancement for donor ${donorId} with instruction: "${enhancementInstruction}"`
    );

    // Build the current email content as a single string for context
    const currentEmailContent = currentStructuredContent
      .map((piece, index) => {
        const nextPiece = currentStructuredContent[index + 1];
        return piece.piece + (piece.addNewlineAfter ? '\n\n' : '');
      })
      .join('')
      .trim();

    // Build the prompt for enhancement
    const systemPrompt = this.buildEnhancementPrompt({
      organizationName,
      organization,
      organizationWritingInstructions,
      userMemories,
      organizationMemories,
    });

    const userPrompt = this.buildUserPrompt({
      donorName: formatDonorName(donor),
      currentSubject,
      currentEmailContent,
      currentStructuredContent,
      currentReferenceContexts,
      enhancementInstruction,
      originalInstruction,
      communicationHistory,
      donationHistory,
      donorStatistics,
      personResearch,
    });

    try {
      // Generate the enhanced email using AI
      const result = await generateObject({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        schema: enhancedEmailSchema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
        maxTokens: 2000,
      });

      const enhanced = result.object;
      const tokenUsage = createEmptyTokenUsage();
      
      if (result.usage) {
        tokenUsage.promptTokens = result.usage.promptTokens;
        tokenUsage.completionTokens = result.usage.completionTokens;
        tokenUsage.totalTokens = result.usage.totalTokens;
      }

      logger.info(
        `Successfully enhanced email for donor ${donorId} (reasoning: "${enhanced.reasoning}", tokenUsage: ${tokenUsage.totalTokens} tokens)`
      );

      return {
        emailId,
        donorId,
        subject: enhanced.subject,
        structuredContent: enhanced.structuredContent,
        referenceContexts: currentReferenceContexts, // Keep the same reference contexts
        reasoning: enhanced.reasoning,
        tokenUsage,
      };
    } catch (error) {
      logger.error(
        `Failed to enhance email for donor ${donorId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  private buildEnhancementPrompt(options: {
    organizationName: string;
    organization: Organization | null;
    organizationWritingInstructions?: string;
    userMemories: string[];
    organizationMemories: string[];
  }): string {
    const { organizationName, organization, organizationWritingInstructions, userMemories, organizationMemories } = options;

    let prompt = `You are an AI assistant helping to enhance an existing email for ${organizationName}.

Your task is to modify the email according to the user's enhancement instruction while:
1. Preserving the overall structure and tone of the original email
2. Keeping all existing references intact (don't remove reference IDs)
3. Making targeted improvements based on the specific instruction
4. Maintaining consistency with the organization's writing style

Important guidelines:
- Make minimal changes - only what's necessary to fulfill the enhancement instruction
- Preserve the email's personalization and donor-specific content
- Keep the same structured content format with pieces, references, and newlines
- Don't change parts of the email that aren't related to the enhancement instruction
- If adding new content, try to use existing references when relevant`;

    if (organizationWritingInstructions) {
      prompt += `\n\nOrganization Writing Instructions:\n${organizationWritingInstructions}`;
    }

    if (organization?.description) {
      prompt += `\n\nOrganization Description:\n${organization.description}`;
    }

    if (organizationMemories.length > 0) {
      prompt += `\n\nOrganization Guidelines:\n${organizationMemories.join('\n')}`;
    }

    if (userMemories.length > 0) {
      prompt += `\n\nUser Preferences:\n${userMemories.join('\n')}`;
    }

    return prompt;
  }

  private buildUserPrompt(options: {
    donorName: string;
    currentSubject: string;
    currentEmailContent: string;
    currentStructuredContent: Array<{
      piece: string;
      references: string[];
      addNewlineAfter: boolean;
    }>;
    currentReferenceContexts: Record<string, string>;
    enhancementInstruction: string;
    originalInstruction: string;
    communicationHistory: RawCommunicationThread[];
    donationHistory: DonationWithDetails[];
    donorStatistics?: DonorStatistics;
    personResearch?: PersonResearchResult;
  }): string {
    const {
      donorName,
      currentSubject,
      currentEmailContent,
      currentStructuredContent,
      currentReferenceContexts,
      enhancementInstruction,
      originalInstruction,
      donorStatistics,
      personResearch,
    } = options;

    let prompt = `Enhancement Instruction: ${enhancementInstruction}

Original Email Generation Instruction: ${originalInstruction}

Current Email:
Subject: ${currentSubject}

Content:
${currentEmailContent}

Structured Content Format:
${JSON.stringify(currentStructuredContent, null, 2)}

Available References:
${Object.entries(currentReferenceContexts).map(([id, context]) => `${id}: ${context}`).join('\n')}

Donor Information:
- Name: ${donorName}`;

    if (donorStatistics) {
      prompt += `\n- Total Donations: ${donorStatistics.totalDonations}`;
      prompt += `\n- Total Amount: $${(donorStatistics.totalAmount / 100).toFixed(2)}`;
      if (donorStatistics.lastDonation) {
        prompt += `\n- Last Donation: $${(donorStatistics.lastDonation.amount / 100).toFixed(2)} on ${new Date(
          donorStatistics.lastDonation.date
        ).toLocaleDateString()}`;
      }
    }

    if (personResearch) {
      prompt += `\n\nDonor Research: ${personResearch.researchTopic}\n${personResearch.answer}`;
    }

    prompt += `\n\nPlease enhance the email according to the instruction while preserving its structure and existing references.`;

    return prompt;
  }
}