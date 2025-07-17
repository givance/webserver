import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { createAzure } from '@ai-sdk/azure';
import { CoreMessage, generateObject } from 'ai';
import { z } from 'zod';
import type { DonorStatistics, RawCommunicationThread } from './types';
import type { DonationWithDetails } from '@/app/lib/data/donations';
import type { PersonResearchResult } from '@/app/lib/services/person-research/types';
import { formatDonorName } from '../donor-name-formatter';
import { type DonorNote } from '@/app/lib/db/schema';
import {
  buildSystemPromptForEmailGeneration,
  buildDonorContext,
} from '@/app/lib/smart-email-generation/utils';

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

export interface SingleEmailRefinementParams {
  donor: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    notes: DonorNote[] | null;
    assignedUserId?: string | null;
  };
  organization: {
    id: string;
    name: string;
    description: string | null;
    websiteSummary: string | null;
    writingInstructions: string | null;
    featureFlags?: {
      use_o3_model: boolean;
      use_agentic_flow: boolean;
    };
  };
  staffMembers: Array<{
    id: number;
    userId: string;
    writingInstructions: string | null;
    firstName?: string;
    lastName?: string;
  }>;
  donorHistory: {
    communications: RawCommunicationThread[];
    donations: DonationWithDetails[];
    statistics?: DonorStatistics;
    personResearch?: PersonResearchResult[];
  };
  memories: {
    user: string[];
    organization: string[];
  };
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentDate: string;
  // Refinement-specific parameters
  existingEmail: {
    subject: string;
    content: string;
    reasoning?: string;
  };
  reviewFeedback: {
    result: 'NEEDS_IMPROVEMENT';
    feedback: string;
  };
}

export interface SingleEmailRefinementResult {
  subject: string;
  content: string;
  reasoning: string;
  response: string;
  tokensUsed: number;
}

/**
 * Pure function to refine a single email for a donor based on review feedback
 * No database queries - all data must be provided
 */
export async function refineSingleEmail(
  params: SingleEmailRefinementParams
): Promise<SingleEmailRefinementResult> {
  const {
    donor,
    organization,
    staffMembers,
    donorHistory,
    memories,
    chatHistory,
    currentDate,
    existingEmail,
    reviewFeedback,
  } = params;

  // Find the assigned staff member
  const assignedStaff = donor.assignedUserId
    ? staffMembers.find((s) => s.userId === donor.assignedUserId)
    : null;
  const useO3Model = organization.featureFlags?.use_o3_model ?? false;

  // Determine writing instructions (staff-specific > org default)
  const writingInstructions =
    assignedStaff?.writingInstructions || organization.writingInstructions || '';

  // Get staff name for signature
  const staffName = assignedStaff
    ? `${assignedStaff.firstName || ''} ${assignedStaff.lastName || ''}`.trim()
    : '';

  // Build system prompt for refinement
  const baseSystemPrompt = buildSystemPromptForEmailGeneration({
    organizationName: organization.name,
    organizationDescription: organization.description,
    organizationWebsiteSummary: organization.websiteSummary,
    staffName,
    writingInstructions,
    userMemories: memories.user,
    organizationMemories: memories.organization,
    currentDate,
  });

  // Add refinement-specific instructions to the system prompt
  const refinementSystemPrompt = `${baseSystemPrompt}

IMPORTANT: You are now in EMAIL REFINEMENT mode.

Your task is to refine an existing email that was reviewed and needs improvement. The reviewer has provided specific feedback about what needs to be fixed.

REFINEMENT INSTRUCTIONS:
1. You MUST only fix the specific issues mentioned in the reviewer's feedback
2. DO NOT change other aspects of the email that were not mentioned as problems
3. Keep the same overall tone, style, and approach unless specifically asked to change them
4. Preserve any good elements from the original email
5. Focus ONLY on addressing the reviewer's concerns
6. IMPORTANT: When providing the reasoning field, combine the original email's strategy/reasoning with your refinement changes into ONE unified strategy. Do not mention "review", "refinement", or "feedback" - present it as a complete email strategy.

The original email, its strategy/reasoning, and reviewer feedback will be provided in the conversation.`;

  // Build donor context
  const donorContext = buildDonorContext({
    donor,
    donorHistory,
  });

  // Create refinement context that includes the original email and feedback
  const refinementContext = `ORIGINAL EMAIL TO REFINE:
Subject: ${existingEmail.subject}
Content:
${existingEmail.content}

${
  existingEmail.reasoning
    ? `ORIGINAL STRATEGY/REASONING:
${existingEmail.reasoning}

`
    : ''
}REVIEWER FEEDBACK:
The email needs improvement for the following reasons:
${reviewFeedback.feedback}

Please refine the email by addressing ONLY the specific issues mentioned in the feedback above. Do not change other aspects of the email that were not mentioned as problems.`;

  // Build messages for the AI
  const messages: CoreMessage[] = [
    {
      role: 'system',
      content: refinementSystemPrompt,
    },
    {
      role: 'user',
      content: donorContext,
    },
    ...chatHistory,
    {
      role: 'user',
      content: refinementContext,
    },
  ];

  logger.info(
    `[SingleEmailRefiner] Refining email for donor ${donor.id} (${formatDonorName(donor)}) based on feedback: ${reviewFeedback.feedback}`
  );

  // Define the schema for the expected response
  const emailRefinementSchema = z.object({
    subject: z
      .string()
      .min(1)
      .max(100)
      .describe('The refined subject line for the email (1-100 characters)'),
    reasoning: z
      .string()
      .min(1)
      .describe(
        'Combined strategy that includes the original email strategy/reasoning plus what changes were made and why to address the reviewer feedback. This should be one unified strategy explanation, not mentioning "review" or "refinement" but presenting a complete email strategy.'
      ),
    emailContent: z
      .string()
      .min(1)
      .describe(
        'Complete refined plain text email content without any structured pieces, reference markers, or signature'
      ),
    response: z
      .string()
      .min(1)
      .describe(
        'A concise summary for the user highlighting what changes were made to address the feedback'
      ),
  });

  try {
    const result = await generateObject({
      model: azure(
        useO3Model ? env.AZURE_OPENAI_O3_DEPLOYMENT_NAME : env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME
      ),
      schema: emailRefinementSchema,
      messages: messages,
      temperature: 0.7, // Slightly lower temperature for more consistent refinements
    });

    logger.info(`[SingleEmailRefiner] Successfully refined email for donor ${donor.id}`);

    return {
      subject: result.object.subject,
      content: result.object.emailContent,
      reasoning: result.object.reasoning,
      response: result.object.response,
      tokensUsed: result.usage?.totalTokens || 0,
    };
  } catch (error) {
    logger.error(`[SingleEmailRefiner] Failed to refine email for donor ${donor.id}:`, error);
    throw error;
  }
}
