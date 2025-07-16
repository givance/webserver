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
  const useGPT41 = params.organization.id === 'org_2xIXH7pYMC1yiTPocKBNjsLUooz';

  // Determine writing instructions (staff-specific > org default)
  const writingInstructions =
    assignedStaff?.writingInstructions || organization.writingInstructions || '';

  // Get staff name for signature
  const staffName = assignedStaff
    ? `${assignedStaff.firstName || ''} ${assignedStaff.lastName || ''}`.trim()
    : '';

  // Build the prompt
  const messages = buildEmailPrompt({
    donor,
    organization,
    writingInstructions,
    donorHistory,
    memories,
    chatHistory,
    currentDate,
    staffName,
  });

  logger.info(
    `[SingleEmailGenerator] Generating email for donor ${donor.id} (${formatDonorName(donor)})`
  );

  // Define the schema for the expected response
  const emailSchema = z.object({
    subject: z
      .string()
      .min(1)
      .max(100)
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
        useGPT41 ? env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME : env.AZURE_OPENAI_O3_DEPLOYMENT_NAME
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

function buildEmailPrompt(params: {
  donor: SingleEmailGeneratorParams['donor'];
  organization: SingleEmailGeneratorParams['organization'];
  writingInstructions: string;
  donorHistory: SingleEmailGeneratorParams['donorHistory'];
  memories: SingleEmailGeneratorParams['memories'];
  chatHistory: SingleEmailGeneratorParams['chatHistory'];
  currentDate: string;
  staffName: string;
}): CoreMessage[] {
  const {
    donor,
    organization,
    writingInstructions,
    donorHistory,
    memories,
    chatHistory,
    currentDate,
    staffName,
  } = params;

  // Extract the latest user instruction from chat history
  const latestUserMessage = chatHistory.filter((msg) => msg.role === 'user').pop()?.content || '';

  // Build system prompt
  const systemPrompt = `You are an expert email writer specializing in wirting emails for ${organization.name}.

[ORGANIZATION CONTEXT]:
${organization.description ? `Organization Description: ${organization.description}` : ''}
${organization.websiteSummary ? `Organization Website Summary: ${organization.websiteSummary}` : ''}
${staffName ? `Email is being sent by: ${staffName}` : ''}
${writingInstructions ? `Writing Guidelines: ${writingInstructions}` : ''}

${memories.user.length > 0 ? `Personal Memories:\n${memories.user.join('\n')}\n` : ''}
${memories.organization.length > 0 ? `Organization Memories:\n${memories.organization.join('\n')}\n` : ''}

CURRENT DATE: ${currentDate}

TASK: Generate an email with the following structure, based on the user instruction and the donor context:
1. **subject**: A compelling subject line (50 characters max)
2. **reasoning**: Technical explanation of your email strategy and personalization tactics
3. **emailContent**: The complete email content as plain text, you should use line breaks as needed to make the email more readable.
4. **response**: User-facing summary describing what was delivered

REQUIREMENTS:
- Tone: Warm, personal, confident and conversational
- Use specific donation amounts and dates from the history when relevant andavailable
- Reference their impact using past donation history when relevant and available
- DO NOT include any signature, closing, or sign-off - this is added automatically
- Be specific and avoid general statements

Important instructions:
- DO NOT use dash, "-", "--" or "—" in the email ever.
- Try to be as specific as possible, avoid general statements.
- Pay extra attention to the numbers, you should make sure all numbers you mention are correct and accurate.

Priority order for conflicting instructions:
1. The user instruction takes the highest priority, if it conflicts with other instructions, the user instruction should always be followed.
2. The donor notes
3. Personal writing instructions
4. Organization writing instructions`;

  // Build donor context
  let donorContext = `\n\nDONOR: ${formatDonorName(donor)} (${donor.email || 'no email'})`;

  if (donor.notes) {
    donorContext += `\nNotes about this Donor:\n${donor.notes.map((note) => `- ${note.content}`).join('\n')}`;
  }

  // Add donation history
  if (donorHistory.donations.length > 0) {
    donorContext += '\n\nDONATION HISTORY:';
    const sortedDonations = [...donorHistory.donations]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5); // Show last 5 donations

    sortedDonations.forEach((donation, index) => {
      const amount = (donation.amount / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      });
      const date = new Date(donation.date).toLocaleDateString();
      const project = donation.project ? ` to ${donation.project.name}` : '';
      donorContext += `\n${index + 1}. ${amount} on ${date}${project}`;
    });
  }

  // Add donor statistics
  if (donorHistory.statistics) {
    const stats = donorHistory.statistics;
    const totalAmount = (stats.totalAmount / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
    donorContext += `\n\nDONOR STATISTICS:`;
    donorContext += `\nTotal donations: ${stats.totalDonations}`;
    donorContext += `\nTotal amount: ${totalAmount}`;

    if (stats.lastDonation) {
      const lastDate = new Date(stats.lastDonation.date).toLocaleDateString();
      donorContext += `\nLast donation: ${lastDate}`;
    }
  }

  // Add communication history
  if (donorHistory.communications.length > 0) {
    donorContext += '\n\nPAST COMMUNICATIONS:';
    donorHistory.communications.slice(0, 3).forEach((thread, index) => {
      if (thread.content && thread.content.length > 0) {
        donorContext += `\nCommunication ${index + 1}: ${thread.content[0].content.substring(0, 100)}...`;
      }
    });
  }

  // Add person research
  if (donorHistory.personResearch && donorHistory.personResearch.length > 0) {
    const research = donorHistory.personResearch[0];
    donorContext += '\n\nDONOR RESEARCH:';
    donorContext += `\n${research.answer}`;
    if (research.personIdentity) {
      if (research.personIdentity.profession) {
        donorContext += `\nProfession: ${research.personIdentity.profession}`;
      }
      if (research.personIdentity.location) {
        donorContext += `\nLocation: ${research.personIdentity.location}`;
      }
    }
  }

  return [
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
}
