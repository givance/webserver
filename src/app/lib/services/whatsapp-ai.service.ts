import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { WhatsAppSQLEngineService } from "./whatsapp-sql-engine.service";
import { WhatsAppHistoryService } from "./whatsapp-history.service";
import { z } from "zod";
import crypto from "crypto";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

export interface WhatsAppAIRequest {
  message: string;
  organizationId: string;
  fromPhoneNumber: string;
  isTranscribed?: boolean; // Flag to indicate if this message was transcribed from voice
}

export interface WhatsAppAIResponse {
  response: string;
  tokensUsed: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Type definitions for donor data
interface DonorSearchResult {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  phone: string | null;
  isCouple: boolean;
  totalDonations: number;
  donationCount: number;
}

interface DonorDetailsResult {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  state: string | null;
  isCouple: boolean;
  hisFirstName: string | null;
  hisLastName: string | null;
  herFirstName: string | null;
  herLastName: string | null;
  notes: string | null;
  currentStageName: string | null;
  highPotentialDonor: boolean | null;
  assignedStaff: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  totalDonations: number;
  donationCount: number;
  lastDonationDate: Date | null;
}

interface DonationHistoryResult {
  id: number;
  date: Date;
  amount: number;
  currency: string;
  projectName: string;
  projectId: number;
}

interface DonorStatisticsResult {
  totalDonors: number;
  totalDonations: number;
  totalDonationAmount: number;
  averageDonationAmount: number;
  highPotentialDonors: number;
  couplesCount: number;
  individualsCount: number;
}

interface TopDonorsResult {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string;
  totalDonations: number;
  donationCount: number;
  lastDonationDate: Date | null;
}

// Cache for system prompts to avoid regeneration
const systemPromptCache = new Map<string, string>();

// Message deduplication cache to prevent duplicate logging on retries
interface ProcessedMessage {
  timestamp: number;
  messageHash: string;
}

// Track processed messages to avoid duplicate logging (5 minute window)
const processedMessages = new Map<string, ProcessedMessage>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clean up old entries from the processed messages cache
 */
function cleanupProcessedMessages(): void {
  const now = Date.now();
  const cutoff = now - DEDUP_WINDOW_MS;

  for (const [key, value] of processedMessages.entries()) {
    if (value.timestamp < cutoff) {
      processedMessages.delete(key);
    }
  }
}

/**
 * Generate a unique key for message deduplication
 */
function generateMessageKey(message: string, fromPhoneNumber: string, organizationId: string): string {
  const messageHash = crypto.createHash("md5").update(message.trim().toLowerCase()).digest("hex");
  return `${fromPhoneNumber}:${organizationId}:${messageHash}`;
}

/**
 * Check if this message was recently processed (within deduplication window)
 */
function isRecentlyProcessed(messageKey: string, messageHash: string): boolean {
  cleanupProcessedMessages();

  const existing = processedMessages.get(messageKey);
  if (!existing) {
    return false;
  }

  // Check if it's the same message hash and within the time window
  const now = Date.now();
  return existing.messageHash === messageHash && now - existing.timestamp < DEDUP_WINDOW_MS;
}

/**
 * Mark a message as processed
 */
function markMessageProcessed(messageKey: string, messageHash: string): void {
  processedMessages.set(messageKey, {
    timestamp: Date.now(),
    messageHash,
  });
}

/**
 * WhatsApp AI service that processes user questions about donors
 * Uses Azure OpenAI with database query tools
 */
export class WhatsAppAIService {
  private sqlEngine: WhatsAppSQLEngineService;
  private historyService: WhatsAppHistoryService;

  constructor() {
    this.sqlEngine = new WhatsAppSQLEngineService();
    this.historyService = new WhatsAppHistoryService();
  }

  /**
   * Process a WhatsApp message and generate an AI response
   */
  async processMessage(request: WhatsAppAIRequest): Promise<WhatsAppAIResponse> {
    const { message, organizationId, fromPhoneNumber, isTranscribed = false } = request;

    // Generate message key and hash for deduplication
    const messageKey = generateMessageKey(message, fromPhoneNumber, organizationId);
    const messageHash = crypto.createHash("md5").update(message.trim().toLowerCase()).digest("hex");

    // Check if this is a retry of a recently processed message
    const isRetry = isRecentlyProcessed(messageKey, messageHash);

    // Only log if this is not a recent retry
    if (!isRetry) {
      logger.info(`Processing WhatsApp message from ${fromPhoneNumber} for organization ${organizationId}`);
      markMessageProcessed(messageKey, messageHash);
    } else {
      logger.debug(`Skipping duplicate log for retry from ${fromPhoneNumber} (message already processed recently)`);
    }

    try {
      // First, save the user's message to history
      await this.historyService.saveMessage({
        organizationId,
        fromPhoneNumber,
        role: "user",
        content: message,
      });

      // Get chat history for context
      const chatHistory = await this.historyService.getChatHistory(organizationId, fromPhoneNumber, 10);
      const historyContext = this.historyService.formatHistoryForAI(chatHistory);

      const systemPrompt = this.buildSystemPrompt(organizationId);
      let userPrompt: string;

      // Build the user prompt based on whether it's transcribed or not
      if (isTranscribed) {
        userPrompt = `User question (transcribed from voice message): ${message}

IMPORTANT: This message was transcribed from a voice message, so some words, names, or addresses might be transcribed incorrectly. If you cannot find anything or need to confirm details, please ask the user to spell out specific names, addresses, or other important information.`;
      } else {
        userPrompt = `User question: ${message}`;
      }

      // Include chat history if available
      if (historyContext.length > 0) {
        const currentQuestion = isTranscribed
          ? `Current user question (transcribed from voice message): ${message}

IMPORTANT: This message was transcribed from a voice message, so some words, names, or addresses might be transcribed incorrectly. If you cannot find anything or need to confirm details, please ask the user to spell out specific names, addresses, or other important information.`
          : `Current user question: ${message}`;

        userPrompt = `Previous conversation:\n${historyContext}\n\n${currentQuestion}`;
      }

      logger.info(`[WhatsApp AI] Sending request to Azure OpenAI - ${chatHistory.length} messages in context`);

      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: systemPrompt,
        prompt: userPrompt,
        tools: {
          executeSQL: {
            description: `Execute SQL queries to answer questions AND modify data in the database. 
            
            You have COMPLETE access to SELECT, INSERT, and UPDATE operations.
            This gives you MAXIMUM FLEXIBILITY to answer questions AND make changes to donor data.
            
            ALLOWED OPERATIONS:
            - SELECT: Query any data
            - INSERT: Add new donors, donations, projects, etc.
            - UPDATE: Modify existing donor information, notes, stages, etc.
            
            SECURITY RULES (CRITICAL):
            1. SELECT/UPDATE/DELETE operations MUST include WHERE organization_id = '${organizationId}'
            2. INSERT operations MUST include organization_id = '${organizationId}' in VALUES
            3. NO DELETE, DROP, TRUNCATE, or ALTER operations allowed
            4. Amounts in donations table are in CENTS (multiply dollars by 100 for storage)
            5. Always validate data before inserting/updating
            
            DATABASE SCHEMA:
            ${this.sqlEngine.getSchemaDescription()}
            
            EXAMPLES:
            SELECT: "SELECT * FROM donors WHERE organization_id = '${organizationId}' AND first_name ILIKE '%Aaron%'"
            INSERT: "INSERT INTO donors (organization_id, first_name, last_name, email) VALUES ('${organizationId}', 'John', 'Doe', 'john@example.com')"
            UPDATE: "UPDATE donors SET notes = 'High potential donor' WHERE organization_id = '${organizationId}' AND id = 123"
            
            IMPORTANT: After executing any query, you MUST provide a complete text response explaining what was done or found.
            
            For data modifications:
            - Confirm what was changed/added
            - Provide the new/updated information
            - Use a friendly, conversational tone`,
            parameters: z.object({
              query: z
                .string()
                .describe(
                  "The SQL query to execute (SELECT, INSERT, or UPDATE). Must include proper organization_id filtering."
                ),
            }),
            execute: async (params: any) => {
              logger.info(`[WhatsApp AI] Executing SQL query: ${params.query.substring(0, 100)}...`);

              // Security validation - check for dangerous operations
              const queryUpper = params.query.toUpperCase().trim();
              const forbiddenOperations = [
                "DELETE FROM",
                "DROP TABLE",
                "DROP DATABASE",
                "TRUNCATE",
                "ALTER TABLE",
                "CREATE TABLE",
                "CREATE DATABASE",
                "GRANT",
                "REVOKE",
              ];

              for (const operation of forbiddenOperations) {
                if (queryUpper.includes(operation)) {
                  logger.error(`[WhatsApp AI] Blocked dangerous operation: ${operation}`);
                  throw new Error(`Operation ${operation} is not allowed for security reasons.`);
                }
              }

              const result = await this.sqlEngine.executeRawSQL({
                query: params.query,
                organizationId,
              });

              // Different logging for different operation types
              if (queryUpper.startsWith("SELECT")) {
                logger.info(
                  `[WhatsApp AI] SELECT query returned ${Array.isArray(result) ? result.length : "non-array"} results`
                );
              } else if (queryUpper.startsWith("INSERT")) {
                logger.info(`[WhatsApp AI] INSERT operation completed successfully`);
              } else if (queryUpper.startsWith("UPDATE")) {
                logger.info(`[WhatsApp AI] UPDATE operation completed successfully`);
              }

              return result;
            },
          },
          askClarification: {
            description: `Use this tool when the user's message is unclear, ambiguous, or lacks sufficient detail to proceed.
            
            This tool allows you to ask follow-up questions to better understand what the user wants.
            
            WHEN TO USE:
            - User asks about "the donor" but hasn't specified which donor
            - User wants to "update information" but hasn't specified what to update
            - User provides incomplete data for creating/updating records
            - Multiple possible interpretations of the user's request
            - Missing required information for database operations
            
            EXAMPLES:
            - "I found 5 donors named John. Which John are you referring to?"
            - "What information would you like me to update for this donor?"
            - "To add a new donation, I need the amount and project. Can you provide those details?"`,
            parameters: z.object({
              question: z.string().describe("The clarification question to ask the user"),
              context: z.string().optional().describe("Additional context about why clarification is needed"),
            }),
            execute: async (params: any) => {
              logger.info(`[WhatsApp AI] Asking clarification: ${params.question}`);
              return {
                clarificationAsked: true,
                question: params.question,
                context: params.context || "",
              };
            },
          },
        },
        temperature: 0.7,
        maxTokens: 2000,
        toolChoice: "auto",
        maxSteps: 5,
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
   * Build the system prompt for the AI assistant (cached for performance)
   */
  private buildSystemPrompt(organizationId: string): string {
    // Check cache first
    const cacheKey = `system-prompt-${organizationId}`;
    if (systemPromptCache.has(cacheKey)) {
      return systemPromptCache.get(cacheKey)!;
    }

    const systemPrompt = `You are a helpful AI assistant for a nonprofit organization's donor management system. You can help users find information about donors AND make changes to the database via WhatsApp.

🚨 CRITICAL WORKFLOW:
1. If the user's request is unclear or ambiguous, use askClarification tool first
2. Use the executeSQL tool to get data OR make changes
3. ALWAYS write a text response analyzing the data or confirming changes
4. NEVER stop after just using tools - you MUST respond with text

You have access to TWO POWERFUL TOOLS:

🔍 THE askClarification TOOL:
Use this when the user's message is unclear, incomplete, or could have multiple interpretations.
- Ask specific follow-up questions
- Request missing required information
- Clarify which donor/donation they mean
- Get details needed for updates/additions

💾 THE executeSQL TOOL:
This tool allows you to READ and WRITE to the database with SELECT, INSERT, and UPDATE operations.

🚀 FULL DATABASE POWER:
READ OPERATIONS:
- Complex JOINs across multiple tables
- Aggregate functions (SUM, COUNT, AVG, MAX, MIN)
- Subqueries and CTEs for advanced queries
- Window functions for analytics
- Complex WHERE conditions with AND/OR logic
- GROUP BY and HAVING for data grouping
- ORDER BY and LIMIT for sorting/pagination

WRITE OPERATIONS:
- INSERT: Add new donors, donations, projects, staff
- UPDATE: Modify existing donor info, notes, stages, assignments
- Batch operations for multiple records

🔒 SECURITY RULES (CRITICAL):
1. SELECT/UPDATE operations MUST include WHERE organization_id = '${organizationId}'
2. INSERT operations MUST include organization_id = '${organizationId}' in VALUES
3. NO DELETE, DROP, TRUNCATE, ALTER, CREATE operations allowed
4. Amounts in donations table are stored in CENTS - multiply dollars by 100 for storage
5. Always validate data before inserting/updating

📊 DATABASE SCHEMA:
${this.sqlEngine.getSchemaDescription()}

💡 CONVERSATION & CLARITY AWARENESS:
- ALWAYS pay attention to conversation history and context
- When users refer to "the donor" or "that person", use previous context
- If multiple donors match or request is ambiguous, ask for clarification FIRST
- Don't guess - ask specific questions to avoid mistakes
- For data modifications, confirm details before making changes

🎯 CRITICAL INSTRUCTIONS (FOLLOW EVERY ONE):
1. ⚠️ ASK FOR CLARIFICATION when requests are unclear or ambiguous
2. Use executeSQL tool for all database operations (read AND write)
3. Write efficient, well-structured SQL queries
4. ⚠️ MANDATORY: ALWAYS provide a complete text response after using tools
5. ⚠️ CRITICAL: NEVER leave responses empty - always explain what happened
6. BE CONVERSATIONAL - write like talking to a friend, not giving formal reports
7. AVOID robotic phrases - share information naturally
8. Format money as currency (e.g., "$1,000" not "1000.00")
9. Format dates readably (e.g., "January 2023" not "2023-01-01")
10. Be helpful with alternatives when no results found
11. Include specific data - names, amounts, dates, project names, counts
12. Present multiple results in natural, easy-to-read format
13. Write human-friendly responses, not database dumps
14. ⚠️ ANSWER THE ACTUAL QUESTION - interpret and explain data meaningfully

FOR DATA MODIFICATIONS:
- Confirm what was changed/added with specific details
- Show before/after information when updating
- Use encouraging, positive language for successful changes
- Double-check critical information before making changes

CLARIFICATION EXAMPLES:
- "I found 3 donors named Sarah. Which one: Sarah Johnson (sarah@email.com), Sarah Smith (sarah.smith@email.com), or Sarah Davis?"
- "To add that donation, I need to know the amount and which project it's for. Can you tell me?"
- "What would you like me to update for John's record - his contact info, notes, or something else?"

Remember: 
- ASK FIRST when unclear - don't guess!
- You can write ANY SQL query to answer questions AND make changes!
- ALWAYS provide human-friendly responses that interpret the data
- NEVER just dump raw database results - format them conversationally`;

    // Cache the system prompt
    systemPromptCache.set(cacheKey, systemPrompt);

    return systemPrompt;
  }
}
