/**
 * WhatsApp Salesforce AI Service
 * Handles all WhatsApp queries when Salesforce integration is active
 */

import { env } from '@/app/lib/env';
import { logger } from '@/app/lib/logger';
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { z } from 'zod';
import { WhatsAppHistoryService } from './whatsapp-history.service';
import { WhatsAppStaffLoggingService } from './whatsapp-staff-logging.service';
import { createSalesforceQueryTool } from './salesforce-query-tool';
import { createAddDonorNoteTool } from './add-donor-note-tool';
import { buildUserPrompt } from './prompts';
import { WhatsAppAIRequest, WhatsAppAIResponse } from './types';

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

// System prompt for Salesforce integration
const SALESFORCE_SYSTEM_PROMPT = `You are a helpful AI assistant for a nonprofit organization's donor management system via WhatsApp.
Your organization uses Salesforce as the primary CRM system.

🚨 CRITICAL: You ONLY have access to Salesforce data. Use the querySalesforce tool for ALL donor and donation queries.

Available tools:
1. querySalesforce - Query any Salesforce data (Accounts, Contacts, GiftTransactions, Opportunities, etc.)
2. addDonorNote - Add notes to donor records in the local system
3. askClarification - Ask for clarification when requests are unclear

KEY RULES:
- ALWAYS use querySalesforce for:
  - Counting donors/contacts
  - Listing donors/contacts
  - Donation totals and reports
  - Any CRM data queries
- Use addDonorNote to add notes to donor records
- ALWAYS provide a complete, conversational response after using tools
- Format responses clearly for WhatsApp with appropriate line breaks
- Be friendly and helpful

Common queries and how to handle them:
- "How many donors?" → querySalesforce: "Count all Contacts"
- "List top donors" → querySalesforce: "List top 10 donors by total GiftTransaction amount"
- "Total donations?" → querySalesforce: "Sum all GiftTransaction amounts with status Paid"
- "Find John Smith" → querySalesforce: "Find Contact named John Smith"
- "Add note to donor X" → First find donor with querySalesforce, then use addDonorNote

Remember: Salesforce is your ONLY source for donor and donation data.`;

export class WhatsAppSalesforceAIService {
  private historyService: WhatsAppHistoryService;
  private loggingService: WhatsAppStaffLoggingService;

  constructor() {
    this.historyService = new WhatsAppHistoryService();
    this.loggingService = new WhatsAppStaffLoggingService();
  }

  /**
   * Process a WhatsApp message using Salesforce as the data source
   */
  async processMessage(request: WhatsAppAIRequest): Promise<WhatsAppAIResponse> {
    const { message, organizationId, staffId, fromPhoneNumber, isTranscribed = false } = request;
    const startTime = Date.now();

    logger.info(`[WhatsApp Salesforce AI] Processing message`, {
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
      const userPrompt = buildUserPrompt(message, isTranscribed, historyContext);

      // Create Salesforce-specific tools
      const tools = this.createSalesforceTools(organizationId, staffId, fromPhoneNumber);

      logger.info(`[WhatsApp Salesforce AI] Sending to Azure OpenAI`, {
        deployment: env.AZURE_OPENAI_DEPLOYMENT_NAME,
        toolCount: Object.keys(tools).length,
      });

      // Generate response using AI
      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: SALESFORCE_SYSTEM_PROMPT,
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

      // Log Salesforce-specific tool usage
      if (result.toolCalls && result.toolCalls.length > 0) {
        const salesforceCallCount = result.toolCalls.filter(
          (call) => call.toolName === 'querySalesforce'
        ).length;

        logger.info(`[WhatsApp Salesforce AI] Tool usage`, {
          totalTools: result.toolCalls.length,
          salesforceQueries: salesforceCallCount,
          tools: result.toolCalls.map((call) => ({
            name: call.toolName,
            args: call.args,
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
      logger.info(`[WhatsApp Salesforce AI] Request completed`, {
        totalTimeMs: totalTime,
        tokensUsed,
        responseLength: responseText.length,
      });

      return {
        response: responseText,
        tokensUsed,
      };
    } catch (error) {
      logger.error(`[WhatsApp Salesforce AI] Error processing message`, {
        error: error instanceof Error ? error.message : String(error),
        fromPhoneNumber,
        organizationId,
        staffId,
      });
      throw error;
    }
  }

  /**
   * Create Salesforce-specific tools
   */
  private createSalesforceTools(organizationId: string, staffId: number, fromPhoneNumber: string) {
    return {
      querySalesforce: createSalesforceQueryTool(
        organizationId,
        this.loggingService,
        staffId,
        fromPhoneNumber
      ).querySalesforce,

      addDonorNote: createAddDonorNoteTool(
        organizationId,
        this.loggingService,
        staffId,
        fromPhoneNumber
      ).addDonorNote,

      askClarification: {
        description: 'Ask the user for clarification when the request is unclear',
        parameters: z.object({
          question: z.string().describe('The clarification question to ask the user'),
          context: z
            .string()
            .optional()
            .describe('Additional context about why clarification is needed'),
        }),
        execute: async (params: any) => {
          logger.info('[WhatsApp Salesforce AI] Asking clarification', {
            question: params.question,
          });
          return {
            clarificationAsked: true,
            question: params.question,
            context: params.context || '',
          };
        },
      },
    };
  }
}
