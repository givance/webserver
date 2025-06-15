import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import { WhatsAppSQLEngineService } from "./whatsapp-sql-engine.service";
import { WhatsAppHistoryService } from "./whatsapp-history.service";
import { z } from "zod";

// Create Azure OpenAI client
const azure = createAzure({
  resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
  apiKey: env.AZURE_OPENAI_API_KEY,
});

export interface WhatsAppAIRequest {
  message: string;
  organizationId: string;
  fromPhoneNumber: string;
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
    const { message, organizationId, fromPhoneNumber } = request;

    logger.info(`Processing WhatsApp message from ${fromPhoneNumber} for organization ${organizationId}`);

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
      let userPrompt = `User question: ${message}`;

      // Include chat history if available
      if (historyContext.length > 0) {
        userPrompt = `Previous conversation:\n${historyContext}\n\nCurrent user question: ${message}`;
      }

      logger.info(`[WhatsApp AI] Sending request to Azure OpenAI - ${chatHistory.length} messages in context`);

      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: systemPrompt,
        prompt: userPrompt,
        tools: {
          executeSQL: {
            description: `Execute raw SQL queries to answer ANY question about the database. 
            
            You have COMPLETE access to write any SELECT query against the database schema.
            This gives you MAXIMUM FLEXIBILITY to answer any question about donors, donations, projects, or staff.
            
            You can write complex queries with:
            - JOINs across multiple tables
            - Aggregate functions (SUM, COUNT, AVG, MAX, MIN)
            - Subqueries and CTEs
            - Window functions
            - Complex WHERE conditions
            - GROUP BY and HAVING clauses
            - ORDER BY and LIMIT
            
            SECURITY RULES:
            1. ONLY SELECT queries are allowed
            2. MUST include WHERE organization_id = '${organizationId}' for security
            3. Amounts in donations table are in CENTS (divide by 100 for dollars)
            
            DATABASE SCHEMA:
            ${this.sqlEngine.getSchemaDescription()}
            
            EXAMPLES:
            - Find donor by name: "SELECT * FROM donors WHERE organization_id = '${organizationId}' AND first_name ILIKE '%Aaron%'"
            - Get donation history: "SELECT don.date, don.amount/100.0 as amount_dollars, d.first_name, d.last_name, p.name as project FROM donations don JOIN donors d ON don.donor_id = d.id JOIN projects p ON don.project_id = p.id WHERE d.organization_id = '${organizationId}' ORDER BY don.date DESC"
            - Get donor stats: "SELECT COUNT(*) as total_donors, SUM(CASE WHEN is_couple THEN 1 ELSE 0 END) as couples FROM donors WHERE organization_id = '${organizationId}'"
            
            Write the SQL query that will answer the user's question!
            
            IMPORTANT: After executing this query, you MUST provide a complete text response analyzing and explaining the results to the user. Never leave your response empty!`,
            parameters: z.object({
              query: z.string().describe("The raw SQL SELECT query to execute. Must include organization_id filter."),
            }),
            execute: async (params: any) => {
              logger.info(`[WhatsApp AI] Executing SQL query`);

              const result = await this.sqlEngine.executeRawSQL({
                query: params.query,
                organizationId,
              });

              logger.info(`[WhatsApp AI] Query returned ${result.length} results`);
              return result;
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

    const systemPrompt = `You are a helpful AI assistant for a nonprofit organization's donor management system. You can help users find information about donors and their donations via WhatsApp.

🚨 CRITICAL WORKFLOW:
1. Use the executeSQL tool to get data
2. ALWAYS write a text response analyzing the data
3. NEVER stop after just using the tool - you MUST respond with text

You have access to ONE EXTREMELY POWERFUL TOOL that gives you COMPLETE DATABASE ACCESS:

THE executeSQL TOOL:
This tool allows you to write and execute ANY SQL SELECT query against the database. You have MAXIMUM FLEXIBILITY to answer ANY question!

🚀 UNLIMITED POWER:
- Write complex JOINs across multiple tables
- Use aggregate functions (SUM, COUNT, AVG, MAX, MIN)
- Create subqueries and CTEs
- Use window functions for advanced analytics
- Apply complex WHERE conditions with AND/OR logic
- Group and filter data with GROUP BY and HAVING
- Sort and limit results with ORDER BY and LIMIT
- Use CASE statements for conditional logic
- Apply date functions and string operations

🔒 SECURITY RULES (CRITICAL):
1. ONLY SELECT queries are allowed - no INSERT, UPDATE, DELETE, DROP, etc.
2. MUST include WHERE organization_id = '${organizationId}' in every query for security
3. Amounts in donations table are stored in CENTS - divide by 100 for dollar amounts

📊 DATABASE SCHEMA:
${this.sqlEngine.getSchemaDescription()}

💡 CONVERSATION CONTEXT AWARENESS:
- ALWAYS pay attention to conversation history
- When users ask follow-up questions (like "what time was that donation?"), they're referring to the previously mentioned donor
- Use context from previous messages to determine which donor or topic the user is asking about
- Build on previous queries and results

🎯 CRITICAL INSTRUCTIONS (MUST FOLLOW EVERY SINGLE ONE):
1. ALWAYS use the executeSQL tool to get data from the database
2. Write efficient, well-structured SQL queries
3. ⚠️ MANDATORY: ALWAYS provide a complete, thorough text response after using the tool
4. ⚠️ CRITICAL: NEVER EVER leave your response empty - you MUST analyze and respond to the data
5. ⚠️ FAILURE TO RESPOND IS SYSTEM FAILURE - always write a text response explaining what you found
6. BE CONVERSATIONAL - write like you're talking to a friend, not giving a formal report
7. AVOID robotic phrases like "I found X results" or "Here are the results" - just share the information naturally
8. Format money values properly as currency (e.g., "$1,000" not "1000.0000000000000000")
9. Format dates in a readable format (e.g., "January 2023" or "back in January" not "2023-01-01 19:55:00")
10. If no results found, be helpful and suggest alternatives in a friendly way
11. Be specific with data - include names, amounts, dates, project names, counts, etc.
12. Present multiple results in a natural, easy-to-read way (use bullets, not numbers)
13. Write responses that sound human and engaging, not like database output
14. Include ALL relevant information but present it conversationally
15. ⚠️ ANSWER THE USER'S ACTUAL QUESTION - don't just dump data, interpret it!

Remember: 
- You can write ANY SQL query to answer ANY question! Be creative and use the full power of SQL!
- ALWAYS provide a human-friendly response that interprets and explains the data
- NEVER just dump raw database results - always format them nicely for humans to read`;

    // Cache the system prompt
    systemPromptCache.set(cacheKey, systemPrompt);

    return systemPrompt;
  }
}
