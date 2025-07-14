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
      logger.info(`[SmartEmailAgentService] Initial instruction: "${initialInstruction}"`);
      logger.info(`[SmartEmailAgentService] Current step: ${context.currentStep}`);
      logger.info(`[SmartEmailAgentService] Donor count: ${context.donorIds.length}`);

      const systemPrompt = this.buildSystemPrompt(context);
      const userPrompt = this.buildInitialUserPrompt(initialInstruction, context);

      logger.info(`[SmartEmailAgentService] System prompt length: ${systemPrompt.length} chars`);
      logger.info(`[SmartEmailAgentService] User prompt length: ${userPrompt.length} chars`);

      // Log the LLM request
      logger.info(`[SmartEmailAgentService LLM REQUEST] Calling Azure OpenAI for initial request`);
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] Model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME}`
      );
      logger.info(`[SmartEmailAgentService LLM REQUEST] Temperature: 0.7, MaxTokens: 1000`);
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] Tools available: ${toolRegistry.getToolDefinitions().length}`
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
        tools: toolRegistry.getToolDefinitions(),
        temperature: 0.7,
        maxTokens: 1000,
      });

      // Log the LLM response
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Initial response received`);
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Response text: "${result.text}"`);
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Usage: ${JSON.stringify(result.usage || {})}`
      );
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Tool calls: ${result.toolCalls?.length || 0}`
      );
      if (result.toolCalls && result.toolCalls.length > 0) {
        logger.info(
          `[SmartEmailAgentService LLM RESPONSE] Raw tool calls: ${JSON.stringify(result.toolCalls)}`
        );
      }

      // Process tool calls if any
      const toolCalls = this.extractToolCalls(result);
      let toolResults: ToolResult[] = [];
      let finalResponseText = result.text;

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

        // If we had tool calls and no text response, we need to make another call to get the AI's response
        if (!result.text || result.text.trim() === '') {
          logger.info(`[SmartEmailAgentService] No text with tool calls, making follow-up call`);

          // Build a summary of tool results for the AI
          const toolResultsSummary = toolResults
            .map((tr) => {
              const toolName = toolCalls.find((tc) => tc.id === tr.toolCallId)?.name || 'unknown';
              return `Tool ${toolName} returned: ${JSON.stringify(tr.result)}`;
            })
            .join('\n\n');

          // Create a follow-up prompt that includes the tool results
          const followUpPrompt = `Based on the tool results, please provide a conversational response to the user about what you discovered about their donors.

Tool Results:
${toolResultsSummary}

Remember to:
1. Be conversational and engaging
2. Highlight key insights from the donor data
3. Ask intelligent follow-up questions
4. Guide the user toward creating effective thank you emails`;

          logger.info(`[SmartEmailAgentService LLM REQUEST] Follow-up call after tools`);
          const followUpResult = await generateText({
            model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
              { role: 'assistant', content: followUpPrompt },
            ],
            temperature: 0.7,
            maxTokens: 1000,
          });

          logger.info(
            `[SmartEmailAgentService LLM RESPONSE] Follow-up response: "${followUpResult.text}"`
          );
          finalResponseText = followUpResult.text;
        }
      }

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
      logger.info(`[SmartEmailAgentService] Current step: ${context.currentStep}`);
      logger.info(`[SmartEmailAgentService] User message: "${userMessage}"`);

      const systemPrompt = this.buildSystemPrompt(context);
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
      logger.info(
        `[SmartEmailAgentService LLM REQUEST] Tools available: ${toolRegistry.getToolDefinitions().length}`
      );

      // Generate AI response with tool calling
      const result = await generateText({
        model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        messages: [{ role: 'system', content: systemPrompt }, ...conversationMessages],
        tools: toolRegistry.getToolDefinitions(),
        temperature: 0.7,
        maxTokens: 1000,
      });

      // Log the LLM response
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Response received`);
      logger.info(`[SmartEmailAgentService LLM RESPONSE] Response text: "${result.text}"`);
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Usage: ${JSON.stringify(result.usage || {})}`
      );
      logger.info(
        `[SmartEmailAgentService LLM RESPONSE] Tool calls: ${result.toolCalls?.length || 0}`
      );

      // Process tool calls if any
      const toolCalls = this.extractToolCalls(result);
      let toolResults: ToolResult[] = [];
      let finalResponseText = result.text;

      if (toolCalls.length > 0) {
        toolResults = await toolRegistry.executeToolCalls(toolCalls, {
          organizationId: context.organizationId,
          userId: context.userId,
          sessionId: context.sessionId,
        });

        // If we had tool calls and no text response, we need to make another call to get the AI's response
        if (!result.text || result.text.trim() === '') {
          logger.info(`[SmartEmailAgentService] No text with tool calls, making follow-up call`);

          // Build a summary of tool results for the AI
          const toolResultsSummary = toolResults
            .map((tr) => {
              const toolName = toolCalls.find((tc) => tc.id === tr.toolCallId)?.name || 'unknown';
              return `Tool ${toolName} returned: ${JSON.stringify(tr.result)}`;
            })
            .join('\n\n');

          // Create a follow-up prompt that includes the tool results
          const followUpPrompt = `Based on the tool results, please provide a conversational response continuing our discussion.

Tool Results:
${toolResultsSummary}

Remember to maintain the conversation flow and ask relevant questions based on what you discovered.`;

          logger.info(`[SmartEmailAgentService LLM REQUEST] Follow-up call after tools`);
          const followUpResult = await generateText({
            model: this.azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
            messages: [
              { role: 'system', content: systemPrompt },
              ...conversationMessages,
              { role: 'assistant', content: followUpPrompt },
            ],
            temperature: 0.7,
            maxTokens: 1000,
          });

          logger.info(
            `[SmartEmailAgentService LLM RESPONSE] Follow-up response: "${followUpResult.text}"`
          );
          finalResponseText = followUpResult.text;
        }
      }

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
   * Build system prompt for the AI agent
   */
  private buildSystemPrompt(context: ConversationContext): string {
    return `You are an expert email strategist and conversation facilitator for nonprofit organizations. Your role is to help users create highly effective, personalized donor emails through intelligent conversation.

## YOUR PRIMARY OBJECTIVES:
1. **Prioritize Conversation**: Always engage in meaningful dialogue BEFORE generating emails
2. **Understand Deeply**: Analyze donor data, organizational context, and user intent thoroughly
3. **Ask Smart Questions**: Guide users to provide information that will dramatically improve email quality
4. **Provide Insights**: Share relevant observations about donors and opportunities
5. **Collaborate Extensively**: Work iteratively with users to refine their email strategy
6. **Deliver Excellence**: Only conclude when you're confident the instruction will produce exceptional emails

## CRITICAL INSTRUCTIONS:
- **NEVER rush to email generation** - Quality conversation leads to quality emails
- **ALWAYS ask clarifying questions** when the user's request is general or vague
- **EXPLORE personalization opportunities** based on actual donor data
- **DISCUSS strategy** before finalizing any email generation instruction
- **MINIMUM 2-3 exchanges** before considering summarizeForGeneration

## AVAILABLE TOOLS:
- **getDonorInfo**: Retrieve comprehensive donor data including donation history, communications, and research
- **getOrganizationContext**: Get organizational mission, writing guidelines, and user preferences
- **summarizeForGeneration**: Create final comprehensive instruction ONLY after thorough conversation

## CONVERSATION FLOW:
1. **ANALYZING**: Start by understanding the user's request and gathering necessary data
2. **QUESTIONING**: Ask multiple intelligent questions based on donor analysis
3. **REFINING**: Iteratively improve understanding through follow-up questions
4. **STRATEGIZING**: Discuss approach and personalization before finalizing
5. **COMPLETE**: Only when you have comprehensive information for excellent email generation

## CURRENT SESSION:
- Session ID: ${context.sessionId}
- Current Step: ${context.currentStep}
- Donor Count: ${context.donorIds.length}
- Organization: ${context.organizationId}

## CONVERSATION GUIDELINES:
- Be genuinely conversational and curious, not robotic
- Ask specific questions based on actual donor data you discover
- Provide insights and observations about each donor
- Never rush to completion - prioritize depth over speed
- Use tools strategically to gather comprehensive information
- Reference specific donor details when asking questions
- Help users think through multiple personalization opportunities
- Suggest creative approaches based on donor history
- Explore the "why" behind their email campaign

## QUALITY CHECKS BEFORE SUMMARIZING:
Before using summarizeForGeneration, ensure you have:
- Clear understanding of campaign goals and context
- Specific personalization strategies for different donor segments
- Tone and voice preferences
- Key messages and value propositions
- Any special considerations or constraints

## TONE:
Professional, insightful, and genuinely collaborative. You're a strategic partner who cares deeply about creating impactful donor communications. Show enthusiasm for discovering insights about donors and crafting personalized approaches.`;
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

    // Only complete when summarizeForGeneration tool is called
    // This ensures we only generate when the AI is confident it has enough information
    if (toolCalls.some((call) => call.name === 'summarizeForGeneration')) {
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
