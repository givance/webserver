import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import { createAzure } from '@ai-sdk/azure';
import { generateObject } from 'ai';
import { env } from '@/app/lib/env';
import { z } from 'zod';

// Input schema for the tool
export const RefineInstructionInputSchema = z.object({
  currentInstruction: z.string().describe('The current email generation instruction'),
  userFeedback: z.string().describe('User feedback on what to change or improve'),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .optional(),
  donorAnalysis: z.any().optional(),
  orgContext: z.any().optional(),
});

export type RefineInstructionInput = z.infer<typeof RefineInstructionInputSchema>;

// Output interface
export interface RefineInstructionOutput {
  refinedInstruction: string;
  changesApplied: {
    change: string;
    reasoning: string;
  }[];
  improvementSummary: string;
  keyDifferences: string[];
  confidenceScore: number; // 0-1 scale
  additionalSuggestions: string[];
}

/**
 * AI Agent Tool: Refine Instruction
 *
 * This tool refines an existing email generation instruction based on user feedback.
 * It maintains the core structure while incorporating the user's requested changes
 * and improvements.
 */
export class RefineInstructionTool {
  private azure = createAzure({
    resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
    apiKey: env.AZURE_OPENAI_API_KEY,
  });

  /**
   * Execute the tool to refine an email instruction
   */
  async execute(input: RefineInstructionInput): Promise<RefineInstructionOutput> {
    try {
      // Validate input
      const validatedInput = RefineInstructionInputSchema.parse(input);

      logger.info(`[RefineInstructionTool] Refining instruction based on user feedback`);

      // Build the refinement prompt
      const refinementPrompt = this.buildRefinementPrompt(validatedInput);

      // Define the schema for the expected response
      const refinementSchema = z.object({
        refinedInstruction: z
          .string()
          .min(200)
          .describe('The refined email generation instruction incorporating user feedback'),
        changesApplied: z
          .array(
            z.object({
              change: z.string().describe('Specific change made to the instruction'),
              reasoning: z.string().describe('Why this change improves the instruction'),
            })
          )
          .min(1)
          .describe('List of changes applied based on user feedback'),
        improvementSummary: z.string().describe('Summary of how the instruction has been improved'),
        keyDifferences: z
          .array(z.string())
          .describe('Key differences between original and refined instruction'),
        confidenceScore: z
          .number()
          .min(0)
          .max(1)
          .describe('Confidence that the refined instruction addresses user concerns'),
        additionalSuggestions: z
          .array(z.string())
          .describe('Additional improvements the user might consider'),
      });

      // Generate the refined instruction using AI
      const result = await generateObject({
        model: this.azure(
          env.AZURE_OPENAI_GPT_4_1_DEPLOYMENT_NAME || env.AZURE_OPENAI_DEPLOYMENT_NAME
        ),
        schema: refinementSchema,
        prompt: refinementPrompt,
        temperature: 0.3, // Lower temperature for focused refinement
      });

      logger.info(
        `[RefineInstructionTool] Successfully refined instruction with ${result.object.changesApplied.length} changes, confidence: ${result.object.confidenceScore}`
      );

      return result.object;
    } catch (error) {
      logger.error('[RefineInstructionTool] Failed to refine instruction:', error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to refine email instruction');
    }
  }

  /**
   * Build the refinement prompt for the AI
   */
  private buildRefinementPrompt(input: RefineInstructionInput): string {
    const { currentInstruction, userFeedback, conversationHistory, donorAnalysis, orgContext } =
      input;

    let prompt = `You are an expert email strategist for nonprofit organizations. Your task is to refine an existing email generation instruction based on user feedback while maintaining its effectiveness.

## CURRENT INSTRUCTION:
${currentInstruction}

## USER FEEDBACK:
${userFeedback}
`;

    // Add conversation history if available for context
    if (conversationHistory && conversationHistory.length > 0) {
      prompt += `\n## CONVERSATION CONTEXT:
`;
      // Only include last 5 messages for context
      const recentMessages = conversationHistory.slice(-5);
      recentMessages.forEach((message, index) => {
        prompt += `${index + 1}. **${message.role.toUpperCase()}**: ${message.content}\n`;
      });
    }

    // Add donor analysis summary if available
    if (donorAnalysis) {
      prompt += `\n## DONOR CONTEXT:
`;
      if (donorAnalysis.donors && Array.isArray(donorAnalysis.donors)) {
        prompt += `- Total Donors: ${donorAnalysis.donors.length}\n`;
        prompt += `- Donor Diversity: Various giving levels and engagement histories\n`;
        prompt += `- Key Consideration: Personalization needs vary by donor segment\n`;
      }
    }

    // Add organizational context if available
    if (orgContext) {
      prompt += `\n## ORGANIZATIONAL CONTEXT:
- Must align with: ${orgContext.organization?.brandTone || 'organizational voice'}\n`;
      if (orgContext.organization?.writingInstructions) {
        prompt += `- Writing Guidelines: ${orgContext.organization.writingInstructions}\n`;
      }
    }

    prompt += `\n## TASK:
Refine the current email generation instruction based on the user's feedback while maintaining its core effectiveness.

## REQUIREMENTS:

1. **Refined Instruction**: 
   - Incorporate ALL specific changes requested in the user feedback
   - Maintain the comprehensive nature of the original instruction
   - Ensure the refined version is at least as detailed as the original
   - Keep all effective elements from the original unless explicitly asked to change them
   - The refined instruction should be 200+ words

2. **Changes Applied**:
   - List each specific change made based on user feedback
   - Explain the reasoning behind each change
   - Show how each change improves the instruction

3. **Improvement Summary**:
   - Summarize how the refinements address the user's concerns
   - Highlight the main improvements made

4. **Key Differences**:
   - Clearly identify what's different between original and refined versions
   - Focus on substantive changes, not minor wording adjustments

5. **Confidence Score**:
   - Rate your confidence (0-1) that the refined instruction addresses user concerns
   - Be realistic based on how well the feedback was incorporated

6. **Additional Suggestions**:
   - Offer 2-3 additional improvements the user might consider
   - These should be optional enhancements, not critical changes

## IMPORTANT NOTES:
- Respect the user's feedback completely - if they want something changed, change it
- Don't remove effective elements unless specifically asked to
- Maintain clarity and actionability in the refined instruction
- Ensure the instruction remains practical for generating multiple personalized emails
- If the user's feedback conflicts with best practices, find a compromise that respects their wishes while maintaining effectiveness

Generate a refined instruction that incorporates all user feedback while maintaining or improving the quality of the email generation guidance.`;

    return prompt;
  }
}
