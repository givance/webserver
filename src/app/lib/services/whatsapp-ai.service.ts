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

    logger.info(`Processing WhatsApp message from ${fromPhoneNumber} for organization ${organizationId}: "${message}"`);

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

      logger.info(`[WhatsApp AI] Sending request to Azure OpenAI (model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME})`);
      logger.info(`[WhatsApp AI] System prompt length: ${systemPrompt.length} chars`);
      logger.info(`[WhatsApp AI] User prompt: ${userPrompt}`);
      logger.info(`[WhatsApp AI] Including ${chatHistory.length} previous messages in context`);

      // Log the complete LLM request
      logger.info(`[WhatsApp AI] === LLM REQUEST ===`);
      logger.info(`[WhatsApp AI] System Prompt: ${systemPrompt}`);
      logger.info(`[WhatsApp AI] User Prompt: ${userPrompt}`);
      if (chatHistory.length > 0) {
        logger.info(`[WhatsApp AI] Conversation History:`);
        chatHistory.forEach((msg, idx) => {
          logger.info(`[WhatsApp AI] ${idx + 1}. ${msg.role}: ${msg.content}`);
        });
      }

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
            
            Write the SQL query that will answer the user's question!`,
            parameters: z.object({
              query: z.string().describe("The raw SQL SELECT query to execute. Must include organization_id filter."),
            }),
            execute: async (params: any) => {
              logger.info(`[WhatsApp AI] Executing SQL query`);
              logger.info(`[WhatsApp AI] Query: ${params.query}`);

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
        maxTokens: 1000, // Ensure there's enough room for a response
        toolChoice: "auto", // Let the model decide when to use tools
      });

      const tokensUsed = {
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      };

      // Log the complete LLM response
      logger.info(`[WhatsApp AI] === LLM RESPONSE ===`);
      logger.info(`[WhatsApp AI] Response text: ${result.text}`);
      logger.info(`[WhatsApp AI] Token usage: ${JSON.stringify(tokensUsed)}`);
      logger.info(`[WhatsApp AI] Tools called: ${result.toolCalls?.length || 0}`);

      if (result.toolCalls && result.toolCalls.length > 0) {
        logger.info(`[WhatsApp AI] === TOOL CALLS ===`);
        result.toolCalls.forEach((call, idx) => {
          logger.info(`[WhatsApp AI] Tool ${idx + 1}: ${call.toolName} with args: ${JSON.stringify(call.args)}`);
        });
      }

      if (result.toolResults && result.toolResults.length > 0) {
        logger.info(`[WhatsApp AI] === TOOL RESULTS ===`);
        result.toolResults.forEach((toolResult, idx) => {
          logger.info(
            `[WhatsApp AI] Tool ${idx + 1} (${toolResult.toolName}) result: ${JSON.stringify(toolResult.result)}`
          );
        });
      }

      // Handle empty responses
      const responseText = result.text.trim();
      if (!responseText || responseText.length === 0) {
        logger.warn(`AI generated empty response, creating fallback response from tool results`);

        // Check if we have tool results to work with
        const toolResults = result.toolResults || [];
        if (toolResults.length > 0) {
          const executeSQLResult = toolResults.find((tr) => tr.toolName === "executeSQL")?.result;

          if (executeSQLResult && Array.isArray(executeSQLResult) && executeSQLResult.length > 0) {
            // Create a generic formatted response based on the data
            let formattedResponse = `I found ${executeSQLResult.length} result${
              executeSQLResult.length !== 1 ? "s" : ""
            }:\n\n`;

            executeSQLResult.slice(0, 10).forEach((item: any, index: number) => {
              formattedResponse += `${index + 1}. `;

              // Format based on available fields
              if (item.firstName && item.lastName) {
                const name = item.displayName || `${item.firstName} ${item.lastName}`;
                formattedResponse += `${name}`;

                if (item.email) formattedResponse += ` (${item.email})`;
                if (item.totalDonations) {
                  const amount = (item.totalDonations / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  });
                  formattedResponse += ` - ${amount} total`;
                }
                if (item.donationCount) formattedResponse += ` from ${item.donationCount} donations`;
              } else if ((item.amount || item.amount_dollars) && item.date) {
                // Donation record - handle both amount (cents) and amount_dollars formats
                let amount: string;
                if (item.amount_dollars) {
                  // If amount_dollars is provided, format it directly
                  const amountNum = parseFloat(item.amount_dollars);
                  amount = amountNum.toLocaleString("en-US", {
                    style: "currency",
                    currency: item.currency || "USD",
                  });
                } else if (item.amount) {
                  // If amount is in cents, convert to dollars
                  amount = (item.amount / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: item.currency || "USD",
                  });
                } else {
                  amount = "Unknown amount";
                }

                const date = new Date(item.date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                });

                formattedResponse += `${amount} donated on ${date}`;

                // Handle donor names (multiple possible formats)
                if (item.donorFirstName && item.donorLastName) {
                  formattedResponse += ` by ${item.donorFirstName} ${item.donorLastName}`;
                } else if (item.first_name && item.last_name) {
                  formattedResponse += ` by ${item.first_name} ${item.last_name}`;
                }

                // Handle project names (multiple possible formats)
                if (item.projectName) {
                  formattedResponse += ` to ${item.projectName}`;
                } else if (item.project_name) {
                  formattedResponse += ` to ${item.project_name}`;
                }
              } else if (item.name) {
                // Project or other named entity
                formattedResponse += `${item.name}`;
                if (item.totalDonations) {
                  const amount = (item.totalDonations / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  });
                  formattedResponse += ` - ${amount} raised`;
                }
              } else {
                // Generic object formatting - but improve it
                const keys = Object.keys(item).filter((k) => !k.includes("Id") && item[k] !== null);
                const formattedPairs = keys.slice(0, 5).map((k) => {
                  let value = item[k];

                  // Format specific fields better
                  if (k.includes("amount") && k.includes("dollars") && typeof value === "string") {
                    const num = parseFloat(value);
                    if (!isNaN(num)) {
                      value = num.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      });
                    }
                  } else if (k.includes("date") && value) {
                    try {
                      value = new Date(value).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      });
                    } catch (e) {
                      // Keep original value if date parsing fails
                    }
                  }

                  return `${k.replace(/_/g, " ")}: ${value}`;
                });

                formattedResponse += formattedPairs.join(", ");
              }

              formattedResponse += "\n";
            });

            if (executeSQLResult.length > 10) {
              formattedResponse += `\n... and ${executeSQLResult.length - 10} more results.`;
            }

            // Save the assistant response to history
            await this.historyService.saveMessage({
              organizationId,
              fromPhoneNumber,
              role: "assistant",
              content: formattedResponse,
              toolCalls: result.toolCalls,
              toolResults: result.toolResults,
              tokensUsed,
            });

            return {
              response: formattedResponse,
              tokensUsed,
            };
          } else if (executeSQLResult && Array.isArray(executeSQLResult) && executeSQLResult.length === 0) {
            const noResultsResponse =
              "I didn't find any results matching your query. Please try rephrasing your question or check the spelling.";

            await this.historyService.saveMessage({
              organizationId,
              fromPhoneNumber,
              role: "assistant",
              content: noResultsResponse,
              toolCalls: result.toolCalls,
              toolResults: result.toolResults,
              tokensUsed,
            });

            return {
              response: noResultsResponse,
              tokensUsed,
            };
          }
        }

        // If no tools were used or no results, use the default fallback message
        const fallbackResponse =
          "I'm sorry, I couldn't find the information you're looking for. Please try rephrasing your question or check if the donor name is spelled correctly.";

        // Save the assistant response to history
        await this.historyService.saveMessage({
          organizationId,
          fromPhoneNumber,
          role: "assistant",
          content: fallbackResponse,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          tokensUsed,
        });

        return {
          response: fallbackResponse,
          tokensUsed,
        };
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
   * Build the system prompt for the AI assistant
   */
  private buildSystemPrompt(organizationId: string): string {
    return `You are a helpful AI assistant for a nonprofit organization's donor management system. You can help users find information about donors and their donations via WhatsApp.

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

🎯 CRITICAL INSTRUCTIONS:
1. ALWAYS use the executeSQL tool to get data from the database
2. Write efficient, well-structured SQL queries
3. ALWAYS provide a complete, thorough text response after using the tool - NEVER leave your response empty!
4. NEVER return an empty response or generic message - always analyze and summarize the data you receive
5. Format money values properly as currency (e.g., "$1,000.00" not "1000.0000000000000000")
6. Format dates in a readable format (e.g., "January 1, 2023" not "2023-01-01 19:55:00")
7. If no results found, explain what you searched for and suggest alternatives
8. Be specific with data - include names, amounts, dates, project names, counts, etc.
9. If multiple results, present them in an organized, easy-to-read list
10. ALWAYS write a human-friendly summary - don't just dump raw data
11. Include ALL relevant information from your query results (donor names, amounts, dates, projects, etc.)

📝 EXAMPLE SQL QUERIES:
- Find donor by name: "SELECT * FROM donors WHERE organization_id = '${organizationId}' AND (first_name ILIKE '%Aaron%' OR last_name ILIKE '%Kirshtein%')"
- Get donation history: "SELECT don.date, don.amount/100.0 as amount_dollars, d.first_name, d.last_name, p.name as project FROM donations don JOIN donors d ON don.donor_id = d.id JOIN projects p ON don.project_id = p.id WHERE d.organization_id = '${organizationId}' AND d.first_name ILIKE '%Aaron%' ORDER BY don.date DESC"
- Get donor with totals: "SELECT d.*, COALESCE(SUM(don.amount), 0)/100.0 as total_donations, COUNT(don.id) as donation_count FROM donors d LEFT JOIN donations don ON d.id = don.donor_id WHERE d.organization_id = '${organizationId}' GROUP BY d.id"
- Get statistics: "SELECT COUNT(*) as total_donors, SUM(CASE WHEN is_couple THEN 1 ELSE 0 END) as couples, AVG(CASE WHEN don.amount IS NOT NULL THEN don.amount/100.0 END) as avg_donation FROM donors d LEFT JOIN donations don ON d.id = don.donor_id WHERE d.organization_id = '${organizationId}'"

📋 EXAMPLE GOOD RESPONSES:
When user asks "Show me Aaron Kirshtein's donations":
GOOD: "I found Aaron Kirshtein's donation history! He made a $1,000 donation on January 1, 2023 to the General Donations project. This was his most recent donation."
BAD: "date: 2023-01-01 19:55:00, amount_dollars: 1000.0000000000000000, first_name: Aaron"

When user asks "How many donors do we have?":
GOOD: "You have 245 total donors in your system, including 89 couples and 156 individual donors. The average donation amount is $125."
BAD: "total_donors: 245, couples: 89, individuals: 156"

Remember: 
- You can write ANY SQL query to answer ANY question! Be creative and use the full power of SQL!
- ALWAYS provide a human-friendly response that interprets and explains the data
- NEVER just dump raw database results - always format them nicely for humans to read`;
  }
}
