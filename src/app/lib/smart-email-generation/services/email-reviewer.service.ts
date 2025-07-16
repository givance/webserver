import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { createAzure } from '@ai-sdk/azure';
import { generateObject } from 'ai';
import { z } from 'zod';

const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

export interface EmailReviewerInput {
  systemPrompt: string;
  donorContext: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  generatedEmail: {
    subject: string;
    content: string;
  };
}

export interface EmailReviewerOutput {
  result: 'OK' | 'NEEDS_IMPROVEMENT';
  feedback?: string;
  tokensUsed: number;
}

export class EmailReviewerService {
  async reviewEmail(input: EmailReviewerInput): Promise<EmailReviewerOutput> {
    const { systemPrompt, donorContext, chatHistory, generatedEmail } = input;

    // Build the review prompt
    const reviewSystemPrompt = `You are an expert email reviewer specializing in evaluating whether generated emails strictly follow user instructions.

Your task is to review the generated email and determine if it accurately follows ALL the instructions provided by the user during the conversation.

Focus ONLY on instruction following:
- Did the email follow all explicit instructions from the user?
- Did the email contradict any user requests?
- Did the email include all requested elements?
- Did the email avoid elements the user asked to exclude?

DO NOT evaluate:
- General email quality
- Grammar or style (unless specifically instructed)
- Tone (unless specifically instructed)
- Length (unless specifically instructed)

Return "OK" if the email follows all instructions correctly.
Return "NEEDS_IMPROVEMENT" if any instruction was not followed, with specific feedback about what was missed or done incorrectly.`;

    // Format the conversation history for review
    const conversationContext = this.formatConversationForReview(
      systemPrompt,
      donorContext,
      chatHistory
    );

    // Format the generated email
    const generatedEmailContext = `
GENERATED EMAIL:
Subject: ${generatedEmail.subject}
Content:
${generatedEmail.content}`;

    const reviewPrompt = `${conversationContext}

${generatedEmailContext}

Please review whether the generated email strictly follows all user instructions from the conversation above.`;

    // Define the response schema
    const reviewSchema = z.object({
      feedback: z
        .string()
        .optional()
        .describe(
          'Specific feedback about which instructions were not followed (only if NEEDS_IMPROVEMENT)'
        ),
      result: z
        .enum(['OK', 'NEEDS_IMPROVEMENT'])
        .describe('Whether the email follows all instructions'),
    });

    try {
      logger.info('[EmailReviewerService] Starting email review');

      const result = await generateObject({
        model: azure(env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME),
        schema: reviewSchema,
        messages: [
          {
            role: 'system',
            content: reviewSystemPrompt,
          },
          {
            role: 'user',
            content: reviewPrompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent evaluation
      });

      logger.info(`[EmailReviewerService] Review complete: ${result.object.result}`);

      return {
        result: result.object.result,
        feedback: result.object.feedback,
        tokensUsed: result.usage?.totalTokens || 0,
      };
    } catch (error) {
      logger.error('[EmailReviewerService] Failed to review email:', error);
      throw error;
    }
  }

  private formatConversationForReview(
    systemPrompt: string,
    donorContext: string,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    let formattedConversation = `EMAIL GENERATION CONTEXT:

System Prompt:
${systemPrompt}

Donor Context:
${donorContext}

Conversation History:`;

    // Add the chat history
    chatHistory.forEach((message) => {
      formattedConversation += `\n\n${message.role}: ${message.content}`;
    });

    return formattedConversation;
  }
}
