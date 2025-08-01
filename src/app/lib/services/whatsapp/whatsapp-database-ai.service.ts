/**
 * WhatsApp Database AI Service
 * Handles all WhatsApp queries when using the local database (no Salesforce)
 */

import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { WhatsAppSQLEngineService } from './whatsapp-sql-engine.service';
import { WhatsAppHistoryService } from './whatsapp-history.service';
import { WhatsAppStaffLoggingService } from './whatsapp-staff-logging.service';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { createAITools } from './ai-tools';
import { WhatsAppAIRequest, WhatsAppAIResponse } from './types';

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// Cache for system prompts
const systemPromptCache = new Map<string, string>();

export class WhatsAppDatabaseAIService {
  private sqlEngine: WhatsAppSQLEngineService;
  private historyService: WhatsAppHistoryService;
  private loggingService: WhatsAppStaffLoggingService;

  constructor() {
    this.sqlEngine = new WhatsAppSQLEngineService();
    this.historyService = new WhatsAppHistoryService();
    this.loggingService = new WhatsAppStaffLoggingService();
  }

  /**
   * Process a WhatsApp message using the local database
   */
  async processMessage(request: WhatsAppAIRequest): Promise<WhatsAppAIResponse> {
    const { message, organizationId, staffId, fromPhoneNumber, isTranscribed = false } = request;
    const startTime = Date.now();

    logger.info(`[WhatsApp Database AI] Processing message`, {
      fromPhoneNumber,
      organizationId,
      staffId,
      messageLength: message.length,
      isTranscribed,
    });

    try {
      // Save user message to history
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

      // Build prompts
      const systemPrompt = this.getSystemPrompt(organizationId);
      const userPrompt = buildUserPrompt(message, isTranscribed, historyContext);

      // Create database tools
      const tools = createAITools(
        this.sqlEngine,
        this.loggingService,
        organizationId,
        staffId,
        fromPhoneNumber
      );

      logger.info(`[WhatsApp Database AI] Sending to Azure OpenAI`, {
        deployment: env.AZURE_OPENAI_DEPLOYMENT_NAME,
        toolCount: Object.keys(tools).length,
        systemPromptLength: systemPrompt.length,
      });

      // Generate response using AI
      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: systemPrompt,
        prompt: userPrompt,
        tools,
        temperature: 0.7,
        maxTokens: 2000,
        toolChoice: 'auto',
        maxSteps: 10,
      });

      const tokensUsed = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      // Log tool usage
      if (result.toolCalls && result.toolCalls.length > 0) {
        const sqlCallCount = result.toolCalls.filter(
          (call) => call.toolName === 'executeSQL'
        ).length;

        logger.info(`[WhatsApp Database AI] Tool usage`, {
          totalTools: result.toolCalls.length,
          sqlQueries: sqlCallCount,
          tools: result.toolCalls.map((call) => ({
            name: call.toolName,
            args: call.toolName === 'executeSQL' ? { query: call.args.query } : call.args,
          })),
        });
      }

      const responseText = result.text.trim();
      if (!responseText) {
        throw new Error('AI failed to generate a response');
      }

      // Save assistant response to history
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

      const totalTime = Date.now() - startTime;
      logger.info(`[WhatsApp Database AI] Request completed`, {
        totalTimeMs: totalTime,
        tokensUsed,
        responseLength: responseText.length,
      });

      return {
        response: responseText,
        tokensUsed,
      };
    } catch (error) {
      logger.error(`[WhatsApp Database AI] Error processing message`, {
        error: error instanceof Error ? error.message : String(error),
        fromPhoneNumber,
        organizationId,
        staffId,
      });
      throw error;
    }
  }

  /**
   * Get the system prompt for database queries (cached)
   */
  private getSystemPrompt(organizationId: string): string {
    const cacheKey = `database-prompt-${organizationId}`;
    if (systemPromptCache.has(cacheKey)) {
      return systemPromptCache.get(cacheKey)!;
    }

    const schemaDescription = this.sqlEngine.getSchemaDescription();
    const systemPrompt = buildSystemPrompt(organizationId, schemaDescription, false);

    systemPromptCache.set(cacheKey, systemPrompt);
    return systemPrompt;
  }
}
