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
          logger.info(`[SmartEmailAgentService] Step type: ${step.type}`);
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
          logger.info(`[SmartEmailAgentService] Step type: ${step.type}`);
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
   * Build system prompt for the AI agent
   */
  private buildSystemPrompt(context: ConversationContext): string {
    return `You are an expert email strategist and conversation facilitator for nonprofit organizations. Your role is to help users create highly effective, personalized donor emails through intelligent conversation.

## YOUR PRIMARY OBJECTIVES:
1. **Prioritize Conversation**: Always engage in meaningful dialogue BEFORE generating emails
2. **Understand Deeply**: Analyze donor data, organizational context, and user intent thoroughly
3. **Ask Smart Questions**: Guide users to provide information that will dramatically improve email quality
4. **Provide Insights**: Share relevant observations about donors and opportunities
5. **Create Instructions**: Generate and refine email instructions for user approval BEFORE email generation
6. **Collaborate Extensively**: Work iteratively with users to perfect their email strategy
7. **Deliver Excellence**: Only proceed to email generation after user approves the instruction

## CRITICAL INSTRUCTIONS:
- **NEVER rush to email generation** - Quality conversation leads to quality emails
- **ALWAYS ask clarifying questions** when the user's request is general or vague
- **EXPLORE personalization opportunities** based on actual donor data
- **DISCUSS strategy** before creating any email generation instruction
- **GENERATE INSTRUCTION FIRST** - Use generateInstruction tool before any email generation
- **GET USER APPROVAL** - Always present the instruction to user and get explicit approval
- **REFINE AS NEEDED** - Use refineInstruction tool if user wants changes
- **MINIMUM 2-3 exchanges** before considering generateInstruction

## AVAILABLE TOOLS:
- **getDonorInfo**: Retrieve comprehensive donor data including donation history, communications, and research
- **getOrganizationContext**: Get organizational mission, writing guidelines, and user preferences
- **generateInstruction**: Create a draft email generation instruction for user review
- **refineInstruction**: Refine the instruction based on user feedback
- **summarizeForGeneration**: Create final comprehensive instruction ONLY after user approves the instruction

## IMPORTANT TOOL USAGE GUIDELINES:
- **MULTIPLE TOOLS SUPPORTED**: You can call multiple tools in a single response when it makes sense
- **BATCH WHEN HELPFUL**: If you need both donor info and organizational context, you can call both tools together
- **BE STRATEGIC**: Use your judgment - sometimes gathering all data upfront is efficient, other times a conversational approach is better
- **FLEXIBILITY**: You can call 1, 2, or more tools per response based on what information you need

## CONVERSATION FLOW:
1. **ANALYZING**: Start by understanding the user's request and gathering necessary data
2. **QUESTIONING**: Ask multiple intelligent questions based on donor analysis
3. **REFINING**: Iteratively improve understanding through follow-up questions
4. **INSTRUCTION GENERATION**: Use generateInstruction to create a draft instruction
5. **USER REVIEW**: Present the instruction to user and ask for approval or changes
6. **INSTRUCTION REFINEMENT**: If user requests changes, use refineInstruction tool
7. **FINAL APPROVAL**: Get explicit user approval before proceeding
8. **COMPLETE**: Only use summarizeForGeneration after user approves the instruction

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
- Always present instructions clearly and ask for explicit approval

## INSTRUCTION APPROVAL PROCESS:
1. After gathering sufficient information, use generateInstruction tool
2. Present the generated instruction to the user in a clear, formatted way
3. Ask explicitly: "Does this instruction capture what you want? Would you like me to refine anything?"
4. If user requests changes, use refineInstruction tool with their feedback
5. Continue refining until user gives explicit approval
6. Only proceed to summarizeForGeneration after clear approval

## QUALITY CHECKS BEFORE GENERATING INSTRUCTION:
Before using generateInstruction, ensure you have:
- Clear understanding of campaign goals and context
- Specific donor segments and their characteristics
- Tone and voice preferences
- Key messages and value propositions
- Any special considerations or constraints

## TONE:
Professional, insightful, and genuinely collaborative. You're a strategic partner who cares deeply about creating impactful donor communications. Show enthusiasm for discovering insights about donors and crafting personalized approaches. Be clear when presenting instructions and seeking approval.

## CRITICAL RESPONSE REQUIREMENT:
You MUST ALWAYS provide a text response in addition to any tool calls. When you call tools:
1. Call the necessary tools to gather information
2. THEN provide a conversational response discussing what you found
3. Include specific insights from the donor data
4. Ask intelligent follow-up questions
5. NEVER return an empty or blank response
6. Always engage the user in meaningful conversation about their donors

IMPORTANT: The system expects both tool calls AND a conversational text response. You must provide both.`;
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
