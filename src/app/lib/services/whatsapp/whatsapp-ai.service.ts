import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { WhatsAppSQLEngineService } from './whatsapp-sql-engine.service';
import { WhatsAppHistoryService } from './whatsapp-history.service';
import { WhatsAppStaffLoggingService } from './whatsapp-staff-logging.service';
import { checkAndMarkMessage } from './message-deduplication';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { createAITools } from './ai-tools';
import { WhatsAppAIRequest, WhatsAppAIResponse } from './types';
import { integrationsService } from '../integrations.service';

// Re-export types for external use
export type { WhatsAppAIRequest, WhatsAppAIResponse } from './types';

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Cache for system prompts to avoid regeneration
const systemPromptCache = new Map<string, string>();

/**
 * WhatsApp AI service that processes user questions about donors
 * Uses Azure OpenAI with database query tools
 */
export class WhatsAppAIService {
  private sqlEngine: WhatsAppSQLEngineService;
  private historyService: WhatsAppHistoryService;
  private loggingService: WhatsAppStaffLoggingService;

  constructor() {
    this.sqlEngine = new WhatsAppSQLEngineService();
    this.historyService = new WhatsAppHistoryService();
    this.loggingService = new WhatsAppStaffLoggingService();
  }

  /**
   * Process a WhatsApp message and generate an AI response
   */
  async processMessage(request: WhatsAppAIRequest): Promise<WhatsAppAIResponse> {
    const { message, organizationId, staffId, fromPhoneNumber, isTranscribed = false } = request;
    const startTime = Date.now();

    // Check if this is a retry of a recently processed message
    const isRetry = checkAndMarkMessage(message, fromPhoneNumber, organizationId);

    // Only log if this is not a recent retry
    if (!isRetry) {
      logger.info(`[WhatsApp AI] Processing new message request`, {
        fromPhoneNumber,
        organizationId,
        staffId,
        messageLength: message.length,
        isTranscribed,
        message: message,
      });
    } else {
      logger.debug(
        `[WhatsApp AI] Processing retry message from ${fromPhoneNumber} (already processed recently)`
      );
    }

    try {
      // First, save the user's message to history
      await this.historyService.saveMessage({
        organizationId,
        staffId,
        fromPhoneNumber,
        role: 'user',
        content: message,
      });

      // Get chat history for context
      const chatHistory = await this.historyService.getChatHistory(
        organizationId,
        staffId,
        fromPhoneNumber,
        10
      );
      const historyContext = this.historyService.formatHistoryForAI(chatHistory);

      // Check if staff has Salesforce integration
      const hasSalesforceIntegration = await this.checkSalesforceIntegration(staffId);

      const systemPrompt = this.getSystemPrompt(organizationId, hasSalesforceIntegration);
      const userPrompt = buildUserPrompt(message, isTranscribed, historyContext);

      logger.info(`[WhatsApp AI] Sending request to Azure OpenAI`, {
        chatHistoryLength: chatHistory.length,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        deployment: env.AZURE_OPENAI_DEPLOYMENT_NAME,
        hasSalesforceIntegration,
      });

      const aiStartTime = Date.now();
      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: systemPrompt,
        prompt: userPrompt,
        tools: createAITools(
          this.sqlEngine,
          this.loggingService,
          organizationId,
          staffId,
          fromPhoneNumber
        ),
        temperature: 0.7,
        maxTokens: 2000,
        toolChoice: 'auto',
        maxSteps: 10,
      });
      const aiProcessingTime = Date.now() - aiStartTime;

      const tokensUsed = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      // Enhanced logging with tool details
      const toolDetails =
        result.toolCalls?.map((call) => ({
          toolName: call.toolName,
          args: call.args,
        })) || [];

      // Log Salesforce query results if any
      if (result.toolResults && result.toolResults.length > 0) {
        result.toolResults.forEach((toolResult: any, index: number) => {
          if (result.toolCalls && result.toolCalls[index]?.toolName === 'querySalesforce') {
            logger.info('[WhatsApp AI] Salesforce query completed', {
              toolCall: result.toolCalls[index],
              result: toolResult.result,
              success: toolResult.result?.success,
              recordCount: toolResult.result?.totalRecords,
              query: toolResult.result?.query,
              explanation: toolResult.result?.explanation,
            });
          }
        });
      }

      logger.info(`[WhatsApp AI] Response generated successfully`, {
        tokensUsed,
        toolCallCount: result.toolCalls?.length || 0,
        toolDetails,
        aiProcessingTimeMs: aiProcessingTime,
        responseLength: result.text.length,
        steps: result.steps?.length || 0,
      });

      // Handle empty responses - this should NOT happen if AI is working properly
      const responseText = result.text.trim();
      if (!responseText || responseText.length === 0) {
        logger.error(
          `AI generated empty response despite having data - tool calls: ${
            result.toolCalls?.length || 0
          }, tool results: ${result.toolResults?.length || 0}`
        );
        throw new Error('AI failed to generate a response - please try your question again');
      }

      // Save the assistant response to history
      await this.historyService.saveMessage({
        organizationId,
        staffId,
        fromPhoneNumber,
        role: 'assistant',
        content: responseText,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        tokensUsed,
      });

      const totalProcessingTime = Date.now() - startTime;

      logger.info(`[WhatsApp AI] Request completed successfully`, {
        fromPhoneNumber,
        organizationId,
        totalProcessingTimeMs: totalProcessingTime,
        responsePreview: responseText.substring(0, 100) + (responseText.length > 100 ? '...' : ''),
        tokensUsed,
      });

      return {
        response: responseText,
        tokensUsed,
      };
    } catch (error) {
      const totalProcessingTime = Date.now() - startTime;

      logger.error(`[WhatsApp AI] Error processing WhatsApp message`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fromPhoneNumber,
        organizationId,
        staffId,
        totalProcessingTimeMs: totalProcessingTime,
      });

      // Re-throw the error so the webhook can handle it
      throw error;
    }
  }

  /**
   * Check if staff has active Salesforce integration
   */
  private async checkSalesforceIntegration(staffId: number): Promise<boolean> {
    try {
      logger.info('[WhatsApp AI] Checking Salesforce integration for staff', { staffId });

      const integration = await integrationsService.getActiveStaffIntegration(
        staffId,
        'salesforce'
      );
      if (!integration) {
        logger.info('[WhatsApp AI] No Salesforce integration found for staff', { staffId });
        return false;
      }

      logger.info('[WhatsApp AI] Found Salesforce integration', {
        staffId,
        integrationId: integration.id,
        isActive: integration.isActive,
        hasTokens: !!integration.tokens,
        tokenKeys: integration.tokens ? Object.keys(integration.tokens) : [],
      });

      const tokens = integrationsService.getIntegrationTokens(integration);
      const isValid = integrationsService.isSalesforceIntegrationValid(tokens);

      logger.info('[WhatsApp AI] Salesforce integration validation result', {
        staffId,
        isValid,
        hasTokens: !!tokens,
        hasAccessToken: !!tokens?.accessToken,
        hasInstanceUrl: !!tokens?.metadata?.instanceUrl,
        instanceUrl: tokens?.metadata?.instanceUrl,
      });

      return isValid;
    } catch (error) {
      logger.error('[WhatsApp AI] Error checking Salesforce integration', { error, staffId });
      return false;
    }
  }

  /**
   * Get the system prompt for the AI assistant (cached for performance)
   */
  private getSystemPrompt(organizationId: string, hasSalesforceIntegration: boolean): string {
    // Check cache first - include Salesforce flag in cache key
    const cacheKey = `system-prompt-${organizationId}-sf-${hasSalesforceIntegration}`;
    if (systemPromptCache.has(cacheKey)) {
      return systemPromptCache.get(cacheKey)!;
    }

    const schemaDescription = this.sqlEngine.getSchemaDescription();
    const systemPrompt = buildSystemPrompt(
      organizationId,
      schemaDescription,
      hasSalesforceIntegration
    );

    // Cache the system prompt
    systemPromptCache.set(cacheKey, systemPrompt);

    return systemPrompt;
  }
}
