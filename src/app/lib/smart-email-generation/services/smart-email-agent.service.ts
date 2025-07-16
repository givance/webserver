import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { env } from '@/app/lib/env';
import { toolRegistry, type ToolCall, type ToolExecutionContext } from '../tools/tool-registry';
import {
  type ConversationContext,
  type AgentResponse,
  SmartEmailSessionStep,
  type SmartEmailSessionStepType,
} from '../types/smart-email-types';
import { buildSystemPromptForAgent } from '../utils/email-context-builder';

/**
 * Smart Email Agent Service
 *
 * This service handles the AI conversation logic for smart email generation.
 * It processes user messages, makes tool calls, and orchestrates the conversation flow.
 */
export class SmartEmailAgentService {
  private azure = createAzure({
    resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
    apiKey: env.AZURE_OPENAI_API_KEY,
  });

  /**
   * Process initial user request and start conversation
   */
  async processInitialRequest(
    initialInstruction: string,
    context: ConversationContext
  ): Promise<AgentResponse> {
    try {
      logger.info(
        `[SmartEmailAgentService] Processing initial request for session ${context.sessionId}`
      );
      logger.info(`[SmartEmailAgentService] ===== USER MESSAGE =====`);
      logger.info(`[SmartEmailAgentService] Initial instruction: "${initialInstruction}"`);
      logger.info(`[SmartEmailAgentService] Current step: ${context.currentStep}`);
      logger.info(`[SmartEmailAgentService] Donor count: ${context.donorIds.length}`);

      const systemPrompt = buildSystemPromptForAgent(context);
      const userPrompt = this.buildInitialUserPrompt(initialInstruction, context);

      logger.info(`[SmartEmailAgentService] System prompt length: ${systemPrompt.length} chars`);
      logger.info(`[SmartEmailAgentService] User prompt length: ${userPrompt.length} chars`);

      // Log the LLM request
      logger.info(`[SmartEmailAgentService LLM REQUEST] Calling Azure OpenAI for initial request`);
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] Model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME}`
      );
      logger.info(`[SmartEmailAgentService LLM REQUEST] Temperature: 0.7, MaxTokens: 1000`);
      const toolContext: ToolExecutionContext = {
        organizationId: context.organizationId,
        userId: context.userId,
        sessionId: context.sessionId,
      };
      const availableTools = toolRegistry.getToolDefinitionsWithExecute(toolContext);
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] Tools available: ${Object.keys(availableTools).length}`
      );
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] System prompt snippet: "${systemPrompt.substring(0, 200)}..."`
      );
      logger.info(`[SmartEmailAgentService LLM REQUEST] User prompt: "${userPrompt}"`);

      // Generate AI response with tool calling
      const result = await generateText({
        model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: availableTools,
        temperature: 0.7,
        maxTokens: 1000,
        maxSteps: 10,
      });

      // Log the LLM response
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Initial response received`);
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Response text: "${result.text}"`);
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Response finishReason: "${result.finishReason}"`
      );
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Response object keys: ${Object.keys(result).join(', ')}`
      );
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Usage: ${JSON.stringify(result.usage || {})}`
      );
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Steps: ${result.steps?.length || 0}`);

      // Extract tool calls from the result steps for logging and next step determination
      const toolCalls: ToolCall[] = [];
      if (result.steps) {
        logger.info(`[SmartEmailAgentService] ===== PROCESSING STEPS =====`);
        for (const step of result.steps) {
          logger.info(`[SmartEmailAgentService] Step text: "${step.text || 'NO TEXT'}"`);
          logger.info(`[SmartEmailAgentService] Step toolCalls: ${step.toolCalls?.length || 0}`);
          if (step.toolCalls) {
            step.toolCalls.forEach((tc: any, index: number) => {
              logger.info(
                `[SmartEmailAgentService] Tool call ${index + 1}: ${tc.toolName} with args: ${JSON.stringify(tc.args)}`
              );
            });
            toolCalls.push(
              ...step.toolCalls.map((tc: any) => ({
                id: tc.toolCallId || tc.id,
                name: tc.toolName,
                arguments: tc.args || tc.arguments,
              }))
            );
          }
          if (step.toolResults) {
            logger.info(
              `[SmartEmailAgentService] Step toolResults: ${step.toolResults?.length || 0}`
            );
            step.toolResults.forEach((tr: any, index: number) => {
              logger.info(
                `[SmartEmailAgentService] Tool result ${index + 1}: ${JSON.stringify(tr).substring(0, 200)}...`
              );
            });
          }
        }
      }

      logger.info(`[SmartEmailAgentService] ===== TOTAL TOOL CALLS: ${toolCalls.length} =====`);
      toolCalls.forEach((tc, index) => {
        logger.info(
          `[SmartEmailAgentService] Tool call ${index + 1}: ${tc.name} with args: ${JSON.stringify(tc.arguments)}`
        );
      });

      // Check if final response text is in the last step instead of result.text
      let finalResponseText = result.text;
      if (result.steps && result.steps.length > 0) {
        const lastStep = result.steps[result.steps.length - 1];
        if (lastStep.text && lastStep.text.trim() !== '') {
          logger.info(`[SmartEmailAgentService] Found text in last step: "${lastStep.text}"`);
          finalResponseText = lastStep.text;
        }
      }

      logger.info(`[SmartEmailAgentService] Final response text to use: "${finalResponseText}"`);

      // Determine next step based on AI response and tool usage
      const nextStep = this.determineNextStep(finalResponseText, toolCalls, context.currentStep);

      logger.info(`[SmartEmailAgentService] Determined next step: ${nextStep}`);
      logger.info(
        `[SmartEmailAgentService] Should continue: ${nextStep !== SmartEmailSessionStep.COMPLETE}`
      );
      logger.info(
        `[SmartEmailAgentService] Tool calls executed: ${toolCalls.map((tc) => tc.name).join(', ') || 'none'}`
      );

      const response: AgentResponse = {
        content: finalResponseText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        nextStep,
        shouldContinue: nextStep !== SmartEmailSessionStep.COMPLETE,
      };

      logger.info(
        `[SmartEmailAgentService] Generated initial response with ${toolCalls.length} tool calls`
      );
      return response;
    } catch (error) {
      logger.error('[SmartEmailAgentService] Failed to process initial request:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to generate initial response'
      );
    }
  }

  /**
   * Process user message in ongoing conversation
   */
  async processUserMessage(
    userMessage: string,
    context: ConversationContext
  ): Promise<AgentResponse> {
    try {
      logger.info(
        `[SmartEmailAgentService] Processing user message for session ${context.sessionId}`
      );
      logger.info(`[SmartEmailAgentService] ===== USER MESSAGE =====`);
      logger.info(`[SmartEmailAgentService] Current step: ${context.currentStep}`);
      logger.info(`[SmartEmailAgentService] User message: "${userMessage}"`);

      const systemPrompt = buildSystemPromptForAgent(context);
      const conversationMessages = this.buildConversationMessages(context);

      logger.info(`[SmartEmailAgentService] System prompt length: ${systemPrompt.length} chars`);
      logger.info(
        `[SmartEmailAgentService] Conversation history: ${conversationMessages.length} messages`
      );

      // Add new user message
      conversationMessages.push({
        role: 'user' as const,
        content: userMessage,
      });

      // Log the LLM request
      logger.info(`[SmartEmailAgentService LLM REQUEST] Calling Azure OpenAI`);
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] Model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME}`
      );
      logger.info(`[SmartEmailAgentService LLM REQUEST] Temperature: 0.7, MaxTokens: 1000`);
      const toolContext: ToolExecutionContext = {
        organizationId: context.organizationId,
        userId: context.userId,
        sessionId: context.sessionId,
      };
      const availableTools = toolRegistry.getToolDefinitionsWithExecute(toolContext);
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] Tools available: ${Object.keys(availableTools).length}`
      );

      // Generate AI response with tool calling
      const result = await generateText({
        model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        messages: [{ role: 'system', content: systemPrompt }, ...conversationMessages],
        tools: availableTools,
        temperature: 0.7,
        maxTokens: 1000,
        maxSteps: 10,
      });

      // Log the LLM response
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Response received`);
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Response text: "${result.text}"`);
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Usage: ${JSON.stringify(result.usage || {})}`
      );
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Steps: ${result.steps?.length || 0}`);

      // Extract tool calls from the result steps for logging and next step determination
      const toolCalls: ToolCall[] = [];
      if (result.steps) {
        logger.info(`[SmartEmailAgentService] ===== PROCESSING STEPS =====`);
        for (const step of result.steps) {
          logger.info(`[SmartEmailAgentService] Step text: "${step.text || 'NO TEXT'}"`);
          logger.info(`[SmartEmailAgentService] Step toolCalls: ${step.toolCalls?.length || 0}`);
          if (step.toolCalls) {
            step.toolCalls.forEach((tc: any, index: number) => {
              logger.info(
                `[SmartEmailAgentService] Tool call ${index + 1}: ${tc.toolName} with args: ${JSON.stringify(tc.args)}`
              );
            });
            toolCalls.push(
              ...step.toolCalls.map((tc: any) => ({
                id: tc.toolCallId || tc.id,
                name: tc.toolName,
                arguments: tc.args || tc.arguments,
              }))
            );
          }
          if (step.toolResults) {
            logger.info(
              `[SmartEmailAgentService] Step toolResults: ${step.toolResults?.length || 0}`
            );
            step.toolResults.forEach((tr: any, index: number) => {
              logger.info(
                `[SmartEmailAgentService] Tool result ${index + 1}: ${JSON.stringify(tr).substring(0, 200)}...`
              );
            });
          }
        }
      }

      logger.info(`[SmartEmailAgentService] ===== TOTAL TOOL CALLS: ${toolCalls.length} =====`);
      toolCalls.forEach((tc, index) => {
        logger.info(
          `[SmartEmailAgentService] Tool call ${index + 1}: ${tc.name} with args: ${JSON.stringify(tc.arguments)}`
        );
      });

      // Check if final response text is in the last step instead of result.text
      let finalResponseText = result.text;
      if (result.steps && result.steps.length > 0) {
        const lastStep = result.steps[result.steps.length - 1];
        if (lastStep.text && lastStep.text.trim() !== '') {
          logger.info(`[SmartEmailAgentService] Found text in last step: "${lastStep.text}"`);
          finalResponseText = lastStep.text;
        }
      }

      logger.info(`[SmartEmailAgentService] Final response text to use: "${finalResponseText}"`);

      // Determine next step
      const nextStep = this.determineNextStep(finalResponseText, toolCalls, context.currentStep);

      logger.info(`[SmartEmailAgentService] Determined next step: ${nextStep}`);
      logger.info(
        `[SmartEmailAgentService] Should continue: ${nextStep !== SmartEmailSessionStep.COMPLETE}`
      );

      const response: AgentResponse = {
        content: finalResponseText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        nextStep,
        shouldContinue: nextStep !== SmartEmailSessionStep.COMPLETE,
      };

      logger.info(
        `[SmartEmailAgentService] Generated response with ${toolCalls.length} tool calls`
      );
      return response;
    } catch (error) {
      logger.error('[SmartEmailAgentService] Failed to process user message:', error);
      throw ErrorHandler.createError('INTERNAL_SERVER_ERROR', 'Failed to generate response');
    }
  }

  /**
   * Build initial user prompt
   */
  private buildInitialUserPrompt(initialInstruction: string, context: ConversationContext): string {
    return `I want to create emails for ${context.donorIds.length} donors. Here's my initial instruction:

"${initialInstruction}"

Please start by analyzing the donor data and organizational context to understand how we can create the most effective, personalized emails. 

IMPORTANT: You must provide a detailed conversational response that includes:
- Specific insights about these donors based on the data you analyze
- Intelligent questions about the campaign goals and strategy
- Personalization opportunities you've identified
- Your recommendations for next steps

Do not provide an empty response. Always engage in meaningful conversation about the donor data.

IMPORTANT CONTEXT FOR TOOL USAGE:
- Donor IDs to analyze: ${JSON.stringify(context.donorIds)}
- Organization ID: ${context.organizationId}
- User ID: ${context.userId}

When using tools:
- For getDonorInfo: Use donorIds = ${JSON.stringify(context.donorIds)}
- For getOrganizationContext: Use organizationId = "${context.organizationId}" and userId = "${context.userId}"`;
  }

  /**
   * Build conversation messages from context
   */
  private buildConversationMessages(context: ConversationContext): Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }> {
    return context.messages.map((message) => ({
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
    }));
  }

  /**
   * Determine next step based on AI response and context
   */
  private determineNextStep(
    aiResponse: string,
    toolCalls: ToolCall[],
    currentStep: SmartEmailSessionStepType
  ): SmartEmailSessionStepType {
    const responseText = aiResponse.toLowerCase();

    // Only complete when summarizeForGeneration tool is called
    // This ensures we only generate when the AI is confident it has enough information
    if (toolCalls.some((call) => call.name === 'summarizeForGeneration')) {
      return SmartEmailSessionStep.COMPLETE;
    }

    // Check if AI generated or refined an instruction
    if (
      toolCalls.some(
        (call) => call.name === 'generateInstruction' || call.name === 'refineInstruction'
      )
    ) {
      // Stay in refining state to get user approval
      return SmartEmailSessionStep.REFINING;
    }

    // Check if AI is asking questions
    if (
      responseText.includes('?') ||
      responseText.includes('question') ||
      responseText.includes('clarify') ||
      responseText.includes('tell me more') ||
      responseText.includes('would you like')
    ) {
      return SmartEmailSessionStep.QUESTIONING;
    }

    // Check if AI is refining based on user feedback
    if (
      responseText.includes('understand') ||
      responseText.includes('based on') ||
      responseText.includes('considering') ||
      responseText.includes('instruction') ||
      responseText.includes('approve') ||
      currentStep === SmartEmailSessionStep.QUESTIONING
    ) {
      return SmartEmailSessionStep.REFINING;
    }

    // Check if AI is analyzing data
    if (
      toolCalls.some(
        (call) => call.name === 'getDonorInfo' || call.name === 'getOrganizationContext'
      ) ||
      currentStep === SmartEmailSessionStep.ANALYZING
    ) {
      return SmartEmailSessionStep.ANALYZING;
    }

    // Default progression
    const step = currentStep as SmartEmailSessionStepType;
    switch (step) {
      case 'analyzing':
        return SmartEmailSessionStep.QUESTIONING;
      case 'questioning':
        return SmartEmailSessionStep.REFINING;
      case 'refining':
        return SmartEmailSessionStep.REFINING; // Stay in refining until complete
      case 'complete':
        return SmartEmailSessionStep.COMPLETE;
      default:
        return SmartEmailSessionStep.QUESTIONING;
    }
  }
}
