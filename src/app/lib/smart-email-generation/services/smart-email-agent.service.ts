import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { env } from '@/app/lib/env';
import { toolRegistry, type ToolCall, type ToolResult } from '../tools/tool-registry';
import {
  type ConversationContext,
  type AgentResponse,
  type ToolCall as SmartToolCall,
  SmartEmailSessionStep,
  type SmartEmailSessionStepType,
} from '../types/smart-email-types';

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

      const systemPrompt = this.buildSystemPrompt(context);
      const userPrompt = this.buildInitialUserPrompt(initialInstruction, context);

      // Generate AI response with tool calling
      const result = await generateText({
        model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: toolRegistry.getToolDefinitions(),
        temperature: 0.7,
        maxTokens: 1000,
      });

      // Process tool calls if any
      const toolCalls = this.extractToolCalls(result);
      let toolResults: ToolResult[] = [];

      if (toolCalls.length > 0) {
        logger.info(
          `[SmartEmailAgentService] Extracted ${toolCalls.length} tool calls:`,
          toolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments }))
        );

        toolResults = await toolRegistry.executeToolCalls(toolCalls, {
          organizationId: context.organizationId,
          userId: context.userId,
          sessionId: context.sessionId,
        });
      }

      // Determine next step based on AI response and tool usage
      const nextStep = this.determineNextStep(result.text, toolCalls, context.currentStep);

      const response: AgentResponse = {
        content: result.text,
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

      const systemPrompt = this.buildSystemPrompt(context);
      const conversationMessages = this.buildConversationMessages(context);

      // Add new user message
      conversationMessages.push({
        role: 'user' as const,
        content: userMessage,
      });

      // Generate AI response with tool calling
      const result = await generateText({
        model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        messages: [{ role: 'system', content: systemPrompt }, ...conversationMessages],
        tools: toolRegistry.getToolDefinitions(),
        temperature: 0.7,
        maxTokens: 1000,
      });

      // Process tool calls if any
      const toolCalls = this.extractToolCalls(result);
      let toolResults: ToolResult[] = [];

      if (toolCalls.length > 0) {
        toolResults = await toolRegistry.executeToolCalls(toolCalls, {
          organizationId: context.organizationId,
          userId: context.userId,
          sessionId: context.sessionId,
        });
      }

      // Determine next step
      const nextStep = this.determineNextStep(result.text, toolCalls, context.currentStep);

      const response: AgentResponse = {
        content: result.text,
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
   * Build system prompt for the AI agent
   */
  private buildSystemPrompt(context: ConversationContext): string {
    return `You are an expert email strategist and conversation facilitator for nonprofit organizations. Your role is to help users create highly effective, personalized donor emails through intelligent conversation.

## YOUR OBJECTIVES:
1. **Understand the Context**: Analyze donor data, organizational context, and user intent
2. **Ask Smart Questions**: Guide users to provide information that will improve email quality
3. **Provide Insights**: Share relevant observations about donors and opportunities
4. **Collaborate**: Work iteratively with users to refine their email strategy
5. **Deliver Results**: Only conclude when you're confident the instruction will produce excellent emails

## AVAILABLE TOOLS:
- **getDonorInfo**: Retrieve comprehensive donor data including donation history, communications, and research
- **getOrganizationContext**: Get organizational mission, writing guidelines, and user preferences
- **summarizeForGeneration**: Create final comprehensive instruction when ready to generate emails

## CONVERSATION FLOW:
1. **ANALYZING**: Start by understanding the user's request and gathering necessary data
2. **QUESTIONING**: Ask intelligent questions based on donor analysis and organizational context
3. **REFINING**: Iteratively improve understanding through follow-up questions
4. **COMPLETE**: Only when you have comprehensive information for excellent email generation

## CURRENT SESSION:
- Session ID: ${context.sessionId}
- Current Step: ${context.currentStep}
- Donor Count: ${context.donorIds.length}
- Organization: ${context.organizationId}

## GUIDELINES:
- Be conversational and helpful, not robotic
- Ask specific questions based on actual donor data
- Provide insights and observations about donors
- Don't rush to completion - ensure quality over speed
- Use tools strategically to gather information
- Reference specific donor details when asking questions
- Help users think through personalization opportunities

## TONE:
Professional, insightful, and collaborative. You're a strategic partner helping create impactful donor communications.`;
  }

  /**
   * Build initial user prompt
   */
  private buildInitialUserPrompt(initialInstruction: string, context: ConversationContext): string {
    return `I want to create emails for ${context.donorIds.length} donors. Here's my initial instruction:

"${initialInstruction}"

Please start by analyzing the donor data and organizational context to understand how we can create the most effective, personalized emails. Ask me intelligent questions based on what you discover about these specific donors.

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
   * Extract tool calls from AI response
   */
  private extractToolCalls(result: any): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    if (result.toolCalls && Array.isArray(result.toolCalls)) {
      result.toolCalls.forEach((toolCall: any) => {
        // The AI SDK uses different property names
        toolCalls.push({
          id:
            toolCall.id ||
            toolCall.toolCallId ||
            `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: toolCall.name || toolCall.toolName || toolCall.function?.name,
          arguments: toolCall.arguments || toolCall.args || toolCall.function?.arguments || {},
        });
      });
    }

    return toolCalls;
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

    // Check if AI is concluding the conversation
    if (
      responseText.includes('final instruction') ||
      responseText.includes('ready to generate') ||
      responseText.includes('comprehensive instruction') ||
      toolCalls.some((call) => call.name === 'summarizeForGeneration')
    ) {
      return SmartEmailSessionStep.COMPLETE;
    }

    // Check if AI is asking questions
    if (
      responseText.includes('?') ||
      responseText.includes('question') ||
      responseText.includes('clarify') ||
      responseText.includes('tell me more')
    ) {
      return SmartEmailSessionStep.QUESTIONING;
    }

    // Check if AI is refining based on user feedback
    if (
      responseText.includes('understand') ||
      responseText.includes('based on') ||
      responseText.includes('considering') ||
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
