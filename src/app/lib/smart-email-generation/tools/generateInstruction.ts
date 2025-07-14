import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import { createAzure } from '@ai-sdk/azure';
import { generateObject } from 'ai';
import { env } from '@/app/lib/env';
import { z } from 'zod';

// Input schema for the tool
export const GenerateInstructionInputSchema = z.object({
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  donorAnalysis: z.any().optional(),
  orgContext: z.any().optional(),
  userPreferences: z
    .object({
      tone: z.string().optional(),
      length: z.string().optional(),
      style: z.string().optional(),
      keyPoints: z.array(z.string()).optional(),
    })
    .optional(),
});

export type GenerateInstructionInput = z.infer<typeof GenerateInstructionInputSchema>;

// Output interface
export interface GenerateInstructionOutput {
  instruction: string;
  reasoning: string;
  keyElements: {
    tone: string;
    personalization: string[];
    structure: string;
    callToAction: string;
    specialConsiderations: string[];
  };
  suggestedImprovements: string[];
  examples: {
    openingLine: string;
    personalizedElement: string;
    closingLine: string;
  };
}

/**
 * AI Agent Tool: Generate Instruction
 *
 * This tool generates a comprehensive email generation instruction based on the conversation,
 * donor analysis, and organizational context. It creates a draft instruction that the user
 * can review and refine before proceeding with email generation.
 */
export class GenerateInstructionTool {
  private azure = createAzure({
    resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
    apiKey: env.AZURE_OPENAI_API_KEY,
  });

  /**
   * Execute the tool to generate an email instruction
   */
  async execute(input: GenerateInstructionInput): Promise<GenerateInstructionOutput> {
    try {
      // Validate input
      const validatedInput = GenerateInstructionInputSchema.parse(input);

      logger.info(
        `[GenerateInstructionTool] Generating instruction with ${validatedInput.conversationHistory.length} messages`
      );

      // Build the generation prompt
      const generationPrompt = this.buildGenerationPrompt(validatedInput);

      // Define the schema for the expected response
      const instructionSchema = z.object({
        instruction: z.string().min(200).describe('The comprehensive email generation instruction'),
        reasoning: z
          .string()
          .min(100)
          .describe('Detailed reasoning behind the instruction choices'),
        keyElements: z.object({
          tone: z.string().describe('The recommended tone for emails'),
          personalization: z
            .array(z.string())
            .describe('Specific personalization strategies to employ'),
          structure: z.string().describe('The recommended email structure'),
          callToAction: z.string().describe('The recommended call to action'),
          specialConsiderations: z
            .array(z.string())
            .describe('Special considerations based on donor data'),
        }),
        suggestedImprovements: z
          .array(z.string())
          .describe('Potential improvements or alternatives to consider'),
        examples: z.object({
          openingLine: z.string().describe('Example opening line following the instruction'),
          personalizedElement: z.string().describe('Example of personalization in action'),
          closingLine: z.string().describe('Example closing line with call to action'),
        }),
      });

      // Generate the instruction using AI
      const result = await generateObject({
        model: this.azure(
          env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME || env.AZURE_OPENAI_DEPLOYMENT_NAME
        ),
        schema: instructionSchema,
        prompt: generationPrompt,
        temperature: 0.5, // Balanced temperature for creativity and consistency
      });

      logger.info(
        `[GenerateInstructionTool] Successfully generated instruction with ${result.object.keyElements.personalization.length} personalization strategies`
      );

      return result.object;
    } catch (error) {
      logger.error('[GenerateInstructionTool] Failed to generate instruction:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to generate email instruction'
      );
    }
  }

  /**
   * Build the generation prompt for the AI
   */
  private buildGenerationPrompt(input: GenerateInstructionInput): string {
    const { conversationHistory, donorAnalysis, orgContext, userPreferences } = input;

    let prompt = `You are an expert email strategist for nonprofit organizations. Your task is to generate a comprehensive email generation instruction based on the conversation, donor data, and organizational context.

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
        prompt += `Total Donors: ${donorAnalysis.donors.length}\n`;
        prompt += `Donor Segments:\n`;

        // Group donors by giving level
        const highValueDonors = donorAnalysis.donors.filter((d: any) => d.totalAmount > 100000);
        const regularDonors = donorAnalysis.donors.filter(
          (d: any) => d.totalAmount <= 100000 && d.totalAmount > 10000
        );
        const smallDonors = donorAnalysis.donors.filter((d: any) => d.totalAmount <= 10000);

        if (highValueDonors.length > 0) {
          prompt += `- High-Value Donors (>${'$1,000'}): ${highValueDonors.length} donors\n`;
        }
        if (regularDonors.length > 0) {
          prompt += `- Regular Donors (${'$100-$1,000'}): ${regularDonors.length} donors\n`;
        }
        if (smallDonors.length > 0) {
          prompt += `- Small Donors (<${'$100'}): ${smallDonors.length} donors\n`;
        }

        // Add sample donor details
        const sampleDonors = donorAnalysis.donors.slice(0, 3);
        prompt += `\nSample Donor Details:\n`;
        sampleDonors.forEach((donor: any, index: number) => {
          prompt += `### Donor ${index + 1}: ${donor.name}
- Total Given: $${(donor.totalAmount / 100).toFixed(2)}
- Last Donation: ${donor.lastDonation ? donor.lastDonation.date : 'Never'}
- Communication History: ${donor.communicationHistory?.length || 0} interactions
- High Potential: ${donor.highPotentialDonor ? 'Yes' : 'No'}
`;
        });
      }
    }

    // Add organizational context if available
    if (orgContext) {
      prompt += `\n## ORGANIZATIONAL CONTEXT:
- Organization: ${orgContext.organization?.name || 'Unknown'}
- Mission: ${orgContext.organization?.description || 'Not provided'}
- Writing Style: ${orgContext.organization?.writingStyle || 'Professional'}
- Brand Tone: ${orgContext.organization?.brandTone || 'Warm and appreciative'}
`;
    }

    // Add user preferences if available
    if (userPreferences) {
      prompt += `\n## USER PREFERENCES:
`;
      if (userPreferences.tone) prompt += `- Preferred Tone: ${userPreferences.tone}\n`;
      if (userPreferences.length) prompt += `- Email Length: ${userPreferences.length}\n`;
      if (userPreferences.style) prompt += `- Writing Style: ${userPreferences.style}\n`;
      if (userPreferences.keyPoints && userPreferences.keyPoints.length > 0) {
        prompt += `- Key Points to Include: ${userPreferences.keyPoints.join(', ')}\n`;
      }
    }

    prompt += `\n## TASK:
Generate a comprehensive email generation instruction that will guide the AI to create highly personalized, effective donor emails.

## REQUIREMENTS:
1. **Instruction**: Create a detailed, actionable instruction (200+ words) that:
   - Incorporates insights from the conversation
   - Addresses specific donor segments and personalization needs
   - Aligns with organizational voice and mission
   - Includes specific guidance on tone, structure, and content
   - Provides clear direction on personalization strategies
   - Specifies the desired outcome and call to action

2. **Reasoning**: Explain why this instruction will be effective, considering:
   - The donor data and segments
   - The organizational context
   - The user's specific needs from the conversation
   - Best practices in donor communication

3. **Key Elements**: Break down the instruction into actionable components

4. **Suggested Improvements**: Offer 2-3 ways the instruction could be enhanced

5. **Examples**: Provide concrete examples of how the instruction would translate into actual email content

## IMPORTANT NOTES:
- The instruction should be specific enough to generate consistently high-quality emails
- It should balance personalization with scalability
- It must respect donor relationships and communication preferences
- Include guidance on both content AND tone
- Consider the full donor journey and relationship stage

Generate a comprehensive instruction that will result in emails donors will appreciate and respond to.`;

    return prompt;
  }
}
