import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { logger } from '@/app/lib/logger';
import { env } from '@/app/lib/env';
import { createAzure } from '@ai-sdk/azure';
import { DonorInfo, Organization } from './types';
import { DonationWithDetails } from '../../data/donations';
import { PersonResearchResult } from '../../services/person-research/types';
import { formatDonorName } from '../donor-name-formatter';

// Schema for the orchestrator agent's response
const AgenticPlanSchema = z.object({
  needsClarification: z.boolean().describe('Whether the agent needs clarification from the user'),
  questions: z
    .array(z.string())
    .describe('Questions the agent has for the user if clarification is needed'),
  conflictsWithBestPractices: z
    .boolean()
    .describe("Whether the user's request conflicts with best practices"),
  bestPracticeIssues: z.array(z.string()).describe('Specific best practice issues found'),
  suggestedPrompt: z.string().describe('The suggested refined prompt for email generation'),
  reasoning: z.string().describe("Explanation of the agent's analysis and suggestions"),
  canProceed: z.boolean().describe('Whether generation can proceed without further iteration'),
  userExplicitlyRequestedGeneration: z
    .boolean()
    .describe('Whether the user explicitly asked to generate/create emails'),
});

// Schema for the user's response during iteration
const UserResponseSchema = z.object({
  answers: z.record(z.string()).describe("User's answers to the questions"),
  additionalInstructions: z
    .string()
    .optional()
    .describe('Any additional instructions from the user'),
});

// Schema for final prompt confirmation
const FinalPromptSchema = z.object({
  finalPrompt: z.string().describe('The final refined prompt for email generation'),
  summary: z.string().describe('Summary of what will be generated'),
  estimatedComplexity: z
    .enum(['low', 'medium', 'high'])
    .describe('Estimated complexity of the generation task'),
});

export interface AgenticFlowContext {
  userInstruction: string;
  donors: DonorInfo[];
  organizationName: string;
  organization: Organization | null;
  organizationWritingInstructions?: string;
  donationHistories: Record<number, DonationWithDetails[]>;
  personResearchResults: Record<number, PersonResearchResult>;
  bestPractices: string; // Content from best_practice.md
  userMemories: string[];
  organizationMemories: string[];
  currentDate?: string;
}

export interface AgenticFlowStep {
  type: 'question' | 'confirmation' | 'generation' | 'complete';
  content: string;
  questions?: string[];
  suggestedPrompt?: string;
  reasoning?: string;
  finalPrompt?: string;
  canProceed?: boolean;
  conflictsWithBestPractices?: boolean;
  bestPracticeIssues?: string[];
}

export interface AgenticFlowResult {
  steps: AgenticFlowStep[];
  finalPrompt?: string;
  needsUserInput: boolean;
  isComplete: boolean;
}

/**
 * Agentic Email Generation Orchestrator
 * This agent manages the iterative process of refining email generation instructions
 * through conversation with the user, ensuring best practices are followed.
 */
export class AgenticEmailGenerationOrchestrator {
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor() {}

  /**
   * Checks if the user's message contains explicit generation keywords
   */
  private hasExplicitGenerationRequest(userMessage: string): boolean {
    const lowerMessage = userMessage.toLowerCase();
    const generationKeywords = [
      'generate',
      'create',
      'write',
      'proceed with generation',
      'go ahead',
      'start generating',
      'create the emails',
      'generate the emails',
      'write the emails',
      'proceed',
      "let's generate",
      'ready to generate',
    ];

    return generationKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Starts the agentic flow by analyzing the initial user request
   */
  async startFlow(context: AgenticFlowContext): Promise<AgenticFlowResult> {
    logger.info(`Starting agentic email generation flow for ${context.donors.length} donors`);

    // Analyze real donor data to provide context to the agent
    const donorDataAnalysis = this.analyzeDonorData(context);

    // Create the initial analysis prompt
    const analysisPrompt = this.buildAnalysisPrompt(context, donorDataAnalysis);

    try {
      // Set up Azure OpenAI client

      const azure = createAzure({
        resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
        apiKey: env.AZURE_OPENAI_API_KEY,
      });

      // Log the request details
      const systemPrompt = this.getOrchestratorSystemPrompt();
      logger.info(`[AGENTIC LLM REQUEST] Starting flow analysis`);
      logger.info(
        `[AGENTIC LLM REQUEST] Model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME}, Temperature: 0.3`
      );
      logger.info(`[AGENTIC LLM REQUEST] System prompt length: ${systemPrompt.length} chars`);
      logger.info(`[AGENTIC LLM REQUEST] Analysis prompt length: ${analysisPrompt.length} chars`);
      logger.info(
        `[AGENTIC LLM REQUEST] Conversation history length: ${this.conversationHistory.length} messages`
      );
      logger.info(`[AGENTIC LLM REQUEST] System prompt: ${systemPrompt}`);
      logger.info(`[AGENTIC LLM REQUEST] Analysis prompt: ${analysisPrompt}`);
      logger.info(
        `[AGENTIC LLM REQUEST] Conversation history: ${JSON.stringify(this.conversationHistory)}`
      );

      // Build conversation messages including history
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...this.conversationHistory,
        { role: 'user' as const, content: analysisPrompt },
      ];

      const { object: plan, usage } = await generateObject({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        schema: AgenticPlanSchema,
        messages: messages,
        temperature: 0.3,
      });

      // Log the response details
      logger.info(`[AGENTIC LLM RESPONSE] Initial analysis complete`);
      logger.info(`[AGENTIC LLM RESPONSE] Token usage: ${JSON.stringify(usage)}`);
      logger.info(`[AGENTIC LLM RESPONSE] needsClarification: ${plan.needsClarification}`);
      logger.info(`[AGENTIC LLM RESPONSE] canProceed: ${plan.canProceed}`);
      logger.info(
        `[AGENTIC LLM RESPONSE] conflictsWithBestPractices: ${plan.conflictsWithBestPractices}`
      );
      logger.info(`[AGENTIC LLM RESPONSE] reasoning: ${plan.reasoning}`);
      logger.info(`[AGENTIC LLM RESPONSE] questions count: ${plan.questions?.length || 0}`);
      logger.info(`[AGENTIC LLM RESPONSE] questions: ${JSON.stringify(plan.questions)}`);
      logger.info(
        `[AGENTIC LLM RESPONSE] suggested prompt length: ${plan.suggestedPrompt?.length || 0} chars`
      );
      logger.info(`[AGENTIC LLM RESPONSE] suggested prompt: ${plan.suggestedPrompt}`);
      logger.info(
        `[AGENTIC LLM RESPONSE] userExplicitlyRequestedGeneration: ${plan.userExplicitlyRequestedGeneration}`
      );

      // Create the first step based on the analysis
      const firstStep: AgenticFlowStep = this.createStepFromPlan(plan);

      return {
        steps: [firstStep],
        finalPrompt: plan.canProceed ? plan.suggestedPrompt : undefined,
        needsUserInput:
          plan.needsClarification ||
          plan.conflictsWithBestPractices ||
          !plan.userExplicitlyRequestedGeneration,
        isComplete:
          plan.canProceed &&
          !plan.needsClarification &&
          !plan.conflictsWithBestPractices &&
          plan.userExplicitlyRequestedGeneration,
      };
    } catch (error) {
      logger.error(`[AGENTIC LLM ERROR] Failed to start agentic flow`);
      logger.error(
        `[AGENTIC LLM ERROR] Error message: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error(
        `[AGENTIC LLM ERROR] Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`
      );
      throw new Error('Failed to start agentic flow');
    }
  }

  /**
   * Continues the flow based on user's response
   */
  async continueFlow(
    context: AgenticFlowContext,
    userResponse: string,
    previousSteps: AgenticFlowStep[]
  ): Promise<AgenticFlowResult> {
    logger.info('Continuing agentic flow with user response');

    // Add user response to conversation history
    this.conversationHistory.push({ role: 'user', content: userResponse });

    // Analyze the user's response and determine next steps
    const continuePrompt = this.buildContinuePrompt(context, userResponse, previousSteps);

    try {
      // Set up Azure OpenAI client

      const azure = createAzure({
        resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
        apiKey: env.AZURE_OPENAI_API_KEY,
      });

      // Log the request details (simplified)
      const systemPrompt = this.getOrchestratorSystemPrompt();
      logger.info(
        `[AGENTIC LLM REQUEST] Continuing flow analysis - ${this.conversationHistory.length} messages in context`
      );

      // Build conversation messages including history
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...this.conversationHistory,
        { role: 'user' as const, content: continuePrompt },
      ];

      const { object: plan, usage } = await generateObject({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        schema: AgenticPlanSchema,
        messages: messages,
        temperature: 0.3,
      });

      // Log the response details
      logger.info(`[AGENTIC LLM RESPONSE] Continue flow analysis complete`);
      logger.info(`[AGENTIC LLM RESPONSE] Token usage: ${JSON.stringify(usage)}`);
      logger.info(`[AGENTIC LLM RESPONSE] needsClarification: ${plan.needsClarification}`);
      logger.info(`[AGENTIC LLM RESPONSE] canProceed: ${plan.canProceed}`);
      logger.info(
        `[AGENTIC LLM RESPONSE] conflictsWithBestPractices: ${plan.conflictsWithBestPractices}`
      );
      logger.info(`[AGENTIC LLM RESPONSE] reasoning: ${plan.reasoning}`);
      logger.info(`[AGENTIC LLM RESPONSE] questions count: ${plan.questions?.length || 0}`);
      logger.info(`[AGENTIC LLM RESPONSE] questions: ${JSON.stringify(plan.questions)}`);
      logger.info(
        `[AGENTIC LLM RESPONSE] suggested prompt length: ${plan.suggestedPrompt?.length || 0} chars`
      );
      logger.info(`[AGENTIC LLM RESPONSE] suggested prompt: ${plan.suggestedPrompt}`);
      logger.info(
        `[AGENTIC LLM RESPONSE] userExplicitlyRequestedGeneration: ${plan.userExplicitlyRequestedGeneration}`
      );

      // Create next step
      const nextStep: AgenticFlowStep = this.createStepFromPlan(plan);

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: nextStep.content,
      });

      const allSteps = [...previousSteps, nextStep];

      return {
        steps: allSteps,
        finalPrompt: plan.canProceed ? plan.suggestedPrompt : undefined,
        needsUserInput:
          plan.needsClarification ||
          plan.conflictsWithBestPractices ||
          !plan.userExplicitlyRequestedGeneration,
        isComplete:
          plan.canProceed &&
          !plan.needsClarification &&
          !plan.conflictsWithBestPractices &&
          plan.userExplicitlyRequestedGeneration,
      };
    } catch (error) {
      logger.error(`[AGENTIC LLM ERROR] Failed to continue agentic flow`);
      logger.error(
        `[AGENTIC LLM ERROR] Error message: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error(
        `[AGENTIC LLM ERROR] Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`
      );
      throw new Error('Failed to continue agentic flow');
    }
  }

  /**
   * Generates the final prompt for confirmation
   */
  async generateFinalPrompt(
    context: AgenticFlowContext,
    conversationSteps: AgenticFlowStep[]
  ): Promise<{
    finalPrompt: string;
    summary: string;
    estimatedComplexity: 'low' | 'medium' | 'high';
  }> {
    logger.info('Generating final prompt for user confirmation');

    const finalPrompt = this.buildFinalPromptGenerationPrompt(context, conversationSteps);

    try {
      // Set up Azure OpenAI client

      const azure = createAzure({
        resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
        apiKey: env.AZURE_OPENAI_API_KEY,
      });

      // Log the request details (simplified)
      const systemPrompt = this.getFinalPromptSystemPrompt();
      logger.info(
        `[AGENTIC LLM REQUEST] Generating final prompt - ${this.conversationHistory.length} messages`
      );

      // Build conversation messages including history
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...this.conversationHistory,
        { role: 'user' as const, content: finalPrompt },
      ];

      const { object: finalResult, usage } = await generateObject({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        schema: FinalPromptSchema,
        messages: messages,
        temperature: 0.1,
      });

      // Log the response details (simplified)
      logger.info(
        `[AGENTIC LLM RESPONSE] Final prompt generated - complexity: ${finalResult.estimatedComplexity}, tokens: ${
          usage?.totalTokens || 0
        }`
      );

      return {
        finalPrompt: finalResult.finalPrompt,
        summary: finalResult.summary,
        estimatedComplexity: finalResult.estimatedComplexity,
      };
    } catch (error) {
      logger.error(`[AGENTIC LLM ERROR] Failed to generate final prompt`);
      logger.error(
        `[AGENTIC LLM ERROR] Error message: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error(
        `[AGENTIC LLM ERROR] Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`
      );
      throw new Error('Failed to generate final prompt');
    }
  }

  /**
   * Analyzes real donor data to provide context (using 2-3 donors like smart email generation)
   */
  private analyzeDonorData(context: AgenticFlowContext): string {
    const sampleCount = Math.min(3, context.donors.length);
    const sampleDonors = context.donors.slice(0, sampleCount);

    let analysis = `REAL DONOR DATA ANALYSIS (${sampleCount} of ${context.donors.length} donors):\n\n`;

    sampleDonors.forEach((donor, index) => {
      const donorDonations = context.donationHistories[donor.id] || [];
      const donorResearch = context.personResearchResults[donor.id];

      analysis += `Donor ${index + 1}: ${formatDonorName(donor)} (${donor.email})\n`;

      if (donor.notes) {
        analysis += `  Notes: ${donor.notes}\n`;
      }

      if (donorDonations.length > 0) {
        const sortedDonations = [...donorDonations].sort(
          (a, b) => b.date.getTime() - a.date.getTime()
        );
        const latestDonation = sortedDonations[0];
        const totalAmount = donorDonations.reduce((sum, d) => sum + d.amount, 0);

        analysis += `  Latest Donation: $${(latestDonation.amount / 100).toFixed(
          2
        )} on ${latestDonation.date.toLocaleDateString()}`;
        if (latestDonation.project) {
          analysis += ` (to ${latestDonation.project.name})`;
        }
        analysis += `\n`;
        analysis += `  Total Donations: ${donorDonations.length} totaling $${(totalAmount / 100).toFixed(2)}\n`;

        if (donorDonations.length > 1) {
          const firstDonation = sortedDonations[sortedDonations.length - 1];
          analysis += `  First Donation: $${(firstDonation.amount / 100).toFixed(
            2
          )} on ${firstDonation.date.toLocaleDateString()}\n`;
        }
      } else {
        analysis += `  No donation history available\n`;
      }

      if (donorResearch) {
        analysis += `  Research: ${donorResearch.researchTopic}`;
        if (donorResearch.answer) {
          analysis += ` - ${donorResearch.answer.substring(0, 100)}${donorResearch.answer.length > 100 ? '...' : ''}`;
        }
        analysis += `\n`;
      } else {
        analysis += `  No research available\n`;
      }

      if (index < sampleDonors.length - 1) {
        analysis += `\n`;
      }
    });

    analysis += `\nTotal Donors: ${context.donors.length}\n`;
    analysis += `Organization: ${context.organizationName}\n`;

    return analysis;
  }

  /**
   * Builds the initial analysis prompt
   */
  private buildAnalysisPrompt(context: AgenticFlowContext, donorDataAnalysis: string): string {
    const hasExplicitRequest = this.hasExplicitGenerationRequest(context.userInstruction);

    return `
ANALYZE EMAIL GENERATION REQUEST

USER INSTRUCTION: "${context.userInstruction}"
USER EXPLICITLY REQUESTED GENERATION: ${hasExplicitRequest}

ORGANIZATION: ${context.organizationName}
${context.organizationWritingInstructions ? `WRITING GUIDELINES: ${context.organizationWritingInstructions}` : ''}

${donorDataAnalysis}

BEST PRACTICES TO FOLLOW:
${context.bestPractices}

USER MEMORIES:
${context.userMemories.join('\n')}

ORGANIZATION MEMORIES:
${context.organizationMemories.join('\n')}

Please analyze this request and determine:
1. Has the user EXPLICITLY asked to generate/create emails? (Based on analysis: ${hasExplicitRequest})
2. What questions should you ask to better understand their needs?
3. Does the instruction conflict with best practices?
4. What additional context would help create better emails?

IMPORTANT: 
- Set userExplicitlyRequestedGeneration=${hasExplicitRequest}
- Set canProceed=true ONLY if userExplicitlyRequestedGeneration=true AND you have sufficient information
- Default to needsClarification=true to continue the conversation
- Always ask questions first, even if the request seems complete
    `.trim();
  }

  /**
   * Builds the continue prompt for ongoing conversation
   */
  private buildContinuePrompt(
    context: AgenticFlowContext,
    userResponse: string,
    previousSteps: AgenticFlowStep[]
  ): string {
    const conversationSummary = previousSteps
      .map((step, i) => `Step ${i + 1}: ${step.content}`)
      .join('\n');
    const hasExplicitRequest = this.hasExplicitGenerationRequest(userResponse);

    return `
CONTINUE CONVERSATION ANALYSIS

ORIGINAL REQUEST: "${context.userInstruction}"
CONVERSATION SO FAR:
${conversationSummary}

USER'S LATEST RESPONSE: "${userResponse}"
USER EXPLICITLY REQUESTED GENERATION IN THIS RESPONSE: ${hasExplicitRequest}

CONTEXT REMAINS:
- Organization: ${context.organizationName}
- ${context.donors.length} donors
- Best practices must be followed

Based on the user's response, determine:
1. Has the user NOW explicitly asked to generate/create emails? (Based on analysis: ${hasExplicitRequest})
2. What additional questions would help improve the email quality?
3. Are there any remaining conflicts with best practices?
4. What's the next step in the conversation?

IMPORTANT:
- Set userExplicitlyRequestedGeneration=${hasExplicitRequest}
- Only set canProceed=true if they explicitly asked AND you have comprehensive information
- Continue asking questions to understand their needs better
- Focus on having a helpful conversation, not rushing to generation
    `.trim();
  }

  /**
   * Builds the final prompt generation prompt
   */
  private buildFinalPromptGenerationPrompt(
    context: AgenticFlowContext,
    conversationSteps: AgenticFlowStep[]
  ): string {
    const conversationSummary = conversationSteps
      .map((step, i) => `Step ${i + 1}: ${step.content}`)
      .join('\n');

    return `
GENERATE FINAL EMAIL GENERATION PROMPT

ORIGINAL REQUEST: "${context.userInstruction}"
CONVERSATION HISTORY:
${conversationSummary}

CONTEXT:
- Organization: ${context.organizationName}
- ${context.donors.length} donors to email
- Must follow provided best practices

Create a final, comprehensive prompt that incorporates all the clarifications and ensures best practices are followed.
Also provide a summary of what will be generated and estimate the complexity.
    `.trim();
  }

  /**
   * Creates a step object from the agent's plan
   */
  private createStepFromPlan(plan: any): AgenticFlowStep {
    if (plan.needsClarification) {
      return {
        type: 'question',
        content: plan.reasoning,
        questions: plan.questions,
        canProceed: false,
      };
    }

    if (plan.conflictsWithBestPractices) {
      return {
        type: 'question',
        content: `I noticed some conflicts with our best practices:\n\n${plan.bestPracticeIssues.join('\n')}\n\n${
          plan.reasoning
        }`,
        questions: [`How would you like to address these best practice concerns?`],
        conflictsWithBestPractices: true,
        bestPracticeIssues: plan.bestPracticeIssues,
        canProceed: false,
      };
    }

    if (plan.canProceed && plan.userExplicitlyRequestedGeneration) {
      return {
        type: 'confirmation',
        content: `Great! I have everything I need. Here's what I'll generate:\n\n${plan.reasoning}`,
        suggestedPrompt: plan.suggestedPrompt,
        canProceed: true,
      };
    }

    if (
      !plan.userExplicitlyRequestedGeneration &&
      !plan.needsClarification &&
      !plan.conflictsWithBestPractices
    ) {
      return {
        type: 'question',
        content: plan.reasoning,
        questions:
          plan.questions.length > 0
            ? plan.questions
            : ["Is there anything specific you'd like me to know before we proceed?"],
        canProceed: false,
      };
    }

    return {
      type: 'question',
      content: plan.reasoning,
      questions: plan.questions || ['Could you provide more details?'],
      canProceed: false,
    };
  }

  /**
   * System prompt for the orchestrator agent
   */
  private getOrchestratorSystemPrompt(): string {
    return `
You are an expert email generation orchestrator for nonprofit organizations. Your primary role is to have a CONVERSATION with the user to understand their needs before generating emails.

IMPORTANT: You should NEVER proceed with email generation until the user explicitly asks you to do so using phrases like:
- "generate the emails"
- "create the emails" 
- "proceed with generation"
- "go ahead and generate"
- "write the emails"

Your conversation approach:
1. START by asking questions to understand their goals and context
2. EXPLORE their specific needs, audience, and desired outcomes
3. IDENTIFY any unclear aspects or potential improvements
4. ENSURE best practices are followed
5. CONTINUE the conversation until you have comprehensive understanding
6. ONLY suggest generation when the user explicitly requests it

When analyzing requests:
- Always start with questions, even if the request seems clear
- Focus on understanding the "why" behind their request
- Explore tone, personalization level, and key messages
- Consider donor history and relationship context
- Think about timing and campaign goals

Remember: Your job is to have a helpful conversation FIRST. Only set canProceed=true when:
1. The user explicitly asks to generate emails AND
2. You have enough information for excellent personalization

Set userExplicitlyRequestedGeneration=true ONLY when the user uses explicit generation keywords.
Always default to continuing the conversation unless explicitly told otherwise.
    `.trim();
  }

  /**
   * System prompt for final prompt generation
   */
  private getFinalPromptSystemPrompt(): string {
    return `
You are creating the final, refined prompt for email generation based on a conversation with the user.

Your job is to:
1. Synthesize all the discussion into a clear, comprehensive prompt
2. Ensure all best practices are incorporated
3. Include all necessary context and constraints
4. Provide a clear summary of what will be generated

The final prompt should be detailed enough that an email generation system can create high-quality, personalized donor emails without further clarification.
    `.trim();
  }
}
