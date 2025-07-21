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

export interface SingleEmailGeneratorParams {
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
}

export interface SingleEmailResult {
  subject: string;
  content: string;
  reasoning: string;
  response: string;
  tokensUsed: number;
}

/**
 * Pure function to generate a single email for a donor
 * No database queries - all data must be provided
 */
export async function generateSingleEmail(
  params: SingleEmailGeneratorParams
): Promise<SingleEmailResult> {
  const { donor, organization, staffMembers, donorHistory, memories, chatHistory, currentDate } =
    params;

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

  // Build system prompt
  const systemPrompt = buildSystemPromptForEmailGeneration({
    organizationName: organization.name,
    organizationDescription: organization.description,
    organizationWebsiteSummary: organization.websiteSummary,
    staffName,
    writingInstructions,
    userMemories: memories.user,
    organizationMemories: memories.organization,
    currentDate,
  });

  // Build donor context
  const donorContext = buildDonorContext({
    donor,
    donorHistory,
  });

  // Build messages for the AI
  const messages: CoreMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: donorContext,
    },
    ...chatHistory,
  ];

  logger.info(
    `[SingleEmailGenerator] Generating email for donor ${donor.id} (${formatDonorName(donor)})`
  );

  // Define the schema for the expected response
  const emailSchema = z.object({
    subject: z
      .string()
      .min(1)
      .describe('A compelling subject line for the email (1-100 characters)'),
    reasoning: z
      .string()
      .min(1)
      .describe(
        'Explanation of why this email was crafted this way, including strategy and personalization choices'
      ),
    emailContent: z
      .string()
      .min(1)
      .describe(
        'Complete plain text email content without any structured pieces, reference markers, or signature'
      ),
    response: z
      .string()
      .min(1)
      .describe(
        'A concise summary for the user highlighting what was accomplished, key donor insights utilized, and any important context that influenced the email'
      ),
  });

  try {
    const result = await generateObject({
      model: azure(
        useO3Model ? env.AZURE_OPENAI_O3_DEPLOYMENT_NAME : env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME
      ),
      schema: emailSchema,
      messages: messages,
      temperature: 1,
    });

    logger.info(`[SingleEmailGenerator] request: ${JSON.stringify(messages)}`);
    logger.info(`[SingleEmailGenerator] result: ${JSON.stringify(result)}`);

    logger.info(`[SingleEmailGenerator] Successfully generated email for donor ${donor.id}`);

    return {
      subject: result.object.subject,
      content: result.object.emailContent,
      reasoning: result.object.reasoning,
      response: result.object.response,
      tokensUsed: result.usage?.totalTokens || 0,
    };
  } catch (error) {
    logger.error(`[SingleEmailGenerator] Failed to generate email for donor ${donor.id}:`, error);
    throw error;
  }
}
