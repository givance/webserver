import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import { createAzure } from '@ai-sdk/azure';
import { generateObject } from 'ai';
import { env } from '@/app/lib/env';
import { z } from 'zod';
import { GetDonorInfoOutput } from './getDonorInfo';
import { GetOrganizationContextOutput } from './getOrganizationContext';

// Input schema for the tool
export const SummarizeForGenerationInputSchema = z.object({
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  donorAnalysis: z.any().optional(),
  orgContext: z.any().optional(),
});

export type SummarizeForGenerationInput = z.infer<typeof SummarizeForGenerationInputSchema>;

// Output interface
export interface SummarizeForGenerationOutput {
  finalInstruction: string;
  reasoning: string;
  confidence: number; // 0-1 scale
  keyInsights: {
    donorInsights: string[];
    organizationalContext: string[];
    conversationHighlights: string[];
    personalizationOpportunities: string[];
  };
  recommendedApproach: {
    tone: string;
    structure: string;
    keyPoints: string[];
    callToAction: string;
  };
  potentialChallenges: string[];
}

/**
 * AI Agent Tool: Summarize for Generation
 *
 * This tool synthesizes the entire conversation, donor analysis, and organizational context
 * to create a comprehensive, final instruction for email generation. It only gets called
 * when the AI feels confident that it has enough information to generate high-quality emails.
 */
export class SummarizeForGenerationTool {
  private azure = createAzure({
    resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
    apiKey: env.AZURE_OPENAI_API_KEY,
  });

  /**
   * Execute the tool to create final generation instructions
   */
  async execute(input: SummarizeForGenerationInput): Promise<SummarizeForGenerationOutput> {
    try {
      // Validate input
      const validatedInput = SummarizeForGenerationInputSchema.parse(input);

      logger.info(
        `[SummarizeForGenerationTool] Summarizing conversation with ${validatedInput.conversationHistory.length} messages`
      );

      // Build the analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(validatedInput);

      // Define the schema for the expected response
      const summarySchema = z.object({
        finalInstruction: z
          .string()
          .min(100)
          .describe('Comprehensive final instruction for email generation'),
        reasoning: z.string().min(50).describe('Reasoning behind the final instruction'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('Confidence level (0-1) in the instruction quality'),
        keyInsights: z.object({
          donorInsights: z.array(z.string()).describe('Key insights about the donors'),
          organizationalContext: z.array(z.string()).describe('Important organizational context'),
          conversationHighlights: z.array(z.string()).describe('Key points from the conversation'),
          personalizationOpportunities: z
            .array(z.string())
            .describe('Opportunities for personalization'),
        }),
        recommendedApproach: z.object({
          tone: z.string().describe('Recommended tone for the emails'),
          structure: z.string().describe('Recommended email structure'),
          keyPoints: z.array(z.string()).describe('Key points to include in emails'),
          callToAction: z.string().describe('Recommended call to action'),
        }),
        potentialChallenges: z.array(z.string()).describe('Potential challenges or considerations'),
      });

      // Generate the summary using AI
      const result = await generateObject({
        model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        schema: summarySchema,
        prompt: analysisPrompt,
        temperature: 0.3, // Lower temperature for more focused analysis
      });

      logger.info(
        `[SummarizeForGenerationTool] Generated summary with confidence: ${result.object.confidence}`
      );

      return result.object;
    } catch (error) {
      logger.error('[SummarizeForGenerationTool] Failed to summarize for generation:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to summarize conversation for generation'
      );
    }
  }

  /**
   * Build the analysis prompt for the AI
   */
  private buildAnalysisPrompt(input: SummarizeForGenerationInput): string {
    const { conversationHistory, donorAnalysis, orgContext } = input;

    let prompt = `You are an expert email strategist for nonprofit organizations. Your task is to analyze the complete conversation, donor data, and organizational context to create a comprehensive final instruction for generating personalized donor emails.

## CONVERSATION HISTORY:
`;

    // Add conversation history
    conversationHistory.forEach((message, index) => {
      prompt += `${index + 1}. **${message.role.toUpperCase()}**: ${message.content}\n`;
    });

    // Add donor analysis if available
    if (donorAnalysis) {
      prompt += `\n## DONOR ANALYSIS:
`;
      if (donorAnalysis.donors && Array.isArray(donorAnalysis.donors)) {
        donorAnalysis.donors.forEach((donor: any, index: number) => {
          prompt += `### Donor ${index + 1}: ${donor.name}
- Email: ${donor.email || 'Not provided'}
- Total Donations: ${donor.totalDonations} donations, $${(donor.totalAmount / 100).toFixed(2)}
- Last Donation: ${donor.lastDonation ? donor.lastDonation.date : 'Never'}
- Notes: ${donor.notes.length > 0 ? donor.notes.join('; ') : 'No notes'}
- High Potential: ${donor.highPotentialDonor ? 'Yes' : 'No'}
- Research Insights: ${donor.personResearch ? donor.personResearch.keyInsights.join(', ') : 'None'}
`;
        });
      }
    }

    // Add organizational context if available
    if (orgContext) {
      prompt += `\n## ORGANIZATIONAL CONTEXT:
### Organization: ${orgContext.organization?.name || 'Unknown'}
- Mission: ${orgContext.organization?.description || 'Not provided'}
- Writing Style: ${orgContext.organization?.writingStyle || 'Not specified'}
- Brand Tone: ${orgContext.organization?.brandTone || 'Not specified'}
- Writing Instructions: ${orgContext.organization?.writingInstructions || 'None'}
- Key Topics: ${orgContext.organization?.keyTopics?.join(', ') || 'None'}

### User Context: ${orgContext.userContext?.fullName || 'Unknown'}
- Preferred Style: ${orgContext.userContext?.preferredStyle || 'Not specified'}
- Personal Touch: ${orgContext.userContext?.personalTouch?.join(', ') || 'None'}
- Staff Position: ${orgContext.userContext?.staff?.position || 'Not specified'}

### Context Analysis:
- Recommended Tone: ${orgContext.contextAnalysis?.recommendedTone || 'Not specified'}
- Key Messaging Points: ${orgContext.contextAnalysis?.keyMessagingPoints?.join(', ') || 'None'}
- Writing Guidelines: ${orgContext.contextAnalysis?.writingGuidelines?.join(', ') || 'None'}
`;
    }

    prompt += `\n## TASK:
Analyze all the information above and create a comprehensive final instruction for email generation that includes:

1. **Final Instruction**: A detailed, actionable instruction that incorporates all conversation insights, donor data, and organizational context
2. **Reasoning**: Clear reasoning for why this instruction will result in effective, personalized emails
3. **Confidence**: Your confidence level (0-1) that this instruction will produce high-quality results
4. **Key Insights**: Organized insights from donors, organization, and conversation
5. **Recommended Approach**: Specific recommendations for tone, structure, and content
6. **Potential Challenges**: Any potential issues or considerations to be aware of

## REQUIREMENTS:
- The final instruction must be comprehensive and actionable
- It should incorporate specific donor insights and personalization opportunities
- It must align with the organization's brand voice and writing guidelines
- It should address the user's specific request from the conversation
- Include specific details about tone, structure, and key messaging points
- Be mindful of donor relationship stage and giving history
- Ensure the instruction will result in emails that feel personal and authentic

## RESPONSE FORMAT:
Provide a structured response with all required fields filled out comprehensively.`;

    return prompt;
  }
}
