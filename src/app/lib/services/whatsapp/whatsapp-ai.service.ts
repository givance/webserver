import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { WhatsAppSQLEngineService } from "./whatsapp-sql-engine.service";
import { WhatsAppHistoryService } from "./whatsapp-history.service";
import { WhatsAppStaffLoggingService } from "./whatsapp-staff-logging.service";
import { checkAndMarkMessage } from "./message-deduplication";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { createAITools } from "./ai-tools";
import { WhatsAppAIRequest, WhatsAppAIResponse } from "./types";

// Re-export types for external use
export type { WhatsAppAIRequest, WhatsAppAIResponse } from "./types";

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

    // Check if this is a retry of a recently processed message
    const isRetry = checkAndMarkMessage(message, fromPhoneNumber, organizationId);

    // Only log if this is not a recent retry
    if (!isRetry) {
      logger.info(`Processing WhatsApp message from ${fromPhoneNumber} for organization ${organizationId}`);
    } else {
      logger.debug(`Skipping duplicate log for retry from ${fromPhoneNumber} (message already processed recently)`);
    }

    try {
      // First, save the user's message to history
      await this.historyService.saveMessage({
        organizationId,
        staffId,
        fromPhoneNumber,
        role: "user",
        content: message,
      });

      // Get chat history for context
      const chatHistory = await this.historyService.getChatHistory(organizationId, staffId, fromPhoneNumber, 10);
      const historyContext = this.historyService.formatHistoryForAI(chatHistory);

      const systemPrompt = this.getSystemPrompt(organizationId);
      const userPrompt = buildUserPrompt(message, isTranscribed, historyContext);

      logger.info(`[WhatsApp AI] Sending request to Azure OpenAI - ${chatHistory.length} messages in context`);

      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: systemPrompt,
        prompt: userPrompt,
        tools: createAITools(this.sqlEngine, this.loggingService, organizationId, staffId, fromPhoneNumber),
        temperature: 0.7,
        maxTokens: 2000,
        toolChoice: "auto",
        maxSteps: 10,
      });

      const tokensUsed = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      // Simplified logging
      logger.info(
        `[WhatsApp AI] Response generated - ${tokensUsed.totalTokens} tokens used, ${
          result.toolCalls?.length || 0
        } tools called`
      );

      // Handle empty responses - this should NOT happen if AI is working properly
      const responseText = result.text.trim();
      if (!responseText || responseText.length === 0) {
        logger.error(
          `AI generated empty response despite having data - tool calls: ${
            result.toolCalls?.length || 0
          }, tool results: ${result.toolResults?.length || 0}`
        );
        throw new Error("AI failed to generate a response - please try your question again");
      }

      // Save the assistant response to history
      await this.historyService.saveMessage({
        organizationId,
        staffId,
        fromPhoneNumber,
        role: "assistant",
        content: responseText,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        tokensUsed,
      });

      return {
        response: responseText,
        tokensUsed,
      };
    } catch (error) {
      logger.error(`Error processing WhatsApp message: ${error instanceof Error ? error.message : String(error)}`);

      // Re-throw the error so the webhook can handle it
      throw error;
    }
  }


  /**
   * Get the system prompt for the AI assistant (cached for performance)
   */
  private getSystemPrompt(organizationId: string): string {
    // Check cache first
    const cacheKey = `system-prompt-${organizationId}`;
    if (systemPromptCache.has(cacheKey)) {
      return systemPromptCache.get(cacheKey)!;
    }

    const schemaDescription = this.sqlEngine.getSchemaDescription();
    const systemPrompt = buildSystemPrompt(organizationId, schemaDescription);

    // Cache the system prompt
    systemPromptCache.set(cacheKey, systemPrompt);

    return systemPrompt;
  }
}
