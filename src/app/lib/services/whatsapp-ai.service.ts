import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { createAzure } from "@ai-sdk/azure";
import { generateText } from "ai";
import {
  WhatsAppQueryToolsService,
  FindDonorsByNameSchema,
  GetDonorDetailsSchema,
  GetDonationHistorySchema,
  GetDonorStatisticsSchema,
  GetTopDonorsSchema,
} from "./whatsapp-query-tools.service";
import { WhatsAppHistoryService } from "./whatsapp-history.service";

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
  private queryTools: WhatsAppQueryToolsService;
  private historyService: WhatsAppHistoryService;

  constructor() {
    this.queryTools = new WhatsAppQueryToolsService();
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

      const systemPrompt = this.buildSystemPrompt();
      let userPrompt = `User question: ${message}`;

      // Include chat history if available
      if (historyContext.length > 0) {
        userPrompt = `Previous conversation:\n${historyContext}\n\nCurrent user question: ${message}`;
      }

      logger.info(`Sending request to Azure OpenAI (model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME})`);
      logger.info(`System prompt length: ${systemPrompt.length} chars`);
      logger.info(`User prompt: ${userPrompt}`);
      logger.info(`Including ${chatHistory.length} previous messages in context`);

      // Debug: Log the actual conversation history being sent
      if (chatHistory.length > 0) {
        logger.info(`[WhatsApp AI Debug] Conversation history being sent to AI:`);
        chatHistory.forEach((msg, idx) => {
          logger.info(`[WhatsApp AI Debug] Message ${idx + 1} (${msg.role}): ${msg.content.substring(0, 100)}...`);
        });
      }

      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: systemPrompt,
        prompt: userPrompt,
        tools: {
          findDonorsByName: {
            description:
              "Search for donors by name (supports partial matches). Use this when the user asks about a specific donor or wants to find donors by name.",
            parameters: FindDonorsByNameSchema,
            execute: async ({ name, limit = 10 }: { name: string; limit?: number }) => {
              logger.info(`[WhatsApp AI] Searching for donors with name: "${name}"`);
              const result = await this.queryTools.findDonorsByName({
                name,
                organizationId,
                limit,
              });
              logger.info(
                `[WhatsApp AI] Found ${result.length} donors. IDs: ${result
                  .map((d: DonorSearchResult) => d.id)
                  .join(", ")}`
              );
              return result;
            },
          },
          getDonorDetails: {
            description:
              "Get detailed information about a specific donor including contact info, donation history summary, and assigned staff.",
            parameters: GetDonorDetailsSchema,
            execute: async ({ donorId }: { donorId: number }) => {
              return await this.queryTools.getDonorDetails({
                donorId,
                organizationId,
              });
            },
          },
          getDonationHistory: {
            description:
              "Get the full donation history for a specific donor, including dates, amounts, and projects. Use this when users ask about WHEN donations were made, specific donation dates/times, or donation history details.",
            parameters: GetDonationHistorySchema,
            execute: async ({ donorId, limit = 50 }: { donorId: number; limit?: number }) => {
              logger.info(`[WhatsApp AI] Getting donation history for donor ${donorId}`);
              const result = await this.queryTools.getDonationHistory({
                donorId,
                organizationId,
                limit,
              });
              logger.info(`[WhatsApp AI] Found ${result.length} donations for donor ${donorId}`);
              return result;
            },
          },
          getDonorStatistics: {
            description:
              "Get overall statistics about all donors in the organization, including totals, averages, and counts.",
            parameters: GetDonorStatisticsSchema,
            execute: async () => {
              return await this.queryTools.getDonorStatistics({
                organizationId,
              });
            },
          },
          getTopDonors: {
            description:
              "Get the top donors by total donation amount. Use this when the user asks about biggest donors or top contributors.",
            parameters: GetTopDonorsSchema,
            execute: async ({ limit = 10 }: { limit?: number }) => {
              return await this.queryTools.getTopDonors({
                organizationId,
                limit,
              });
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

      logger.info(
        `Received response from Azure OpenAI (length: ${result.text.length} chars, tokens: ${tokensUsed.totalTokens})`
      );
      logger.info(`Response generated successfully with tools available`);

      // Handle empty responses
      const responseText = result.text.trim();
      if (!responseText || responseText.length === 0) {
        logger.warn(`AI generated empty response, analyzing tool usage to create a meaningful response`);

        // Check which tools were used and create a response based on that
        // Log the entire result structure to help debug
        logger.info(
          `Result structure: ${JSON.stringify(
            result,
            (key, value) => {
              // Prevent circular references and trim long values
              if (typeof value === "string" && value.length > 100) {
                return value.substring(0, 100) + "...";
              }
              return value;
            },
            2
          )}`
        );

        // Get tool results directly from the result object
        const toolResults = result.toolResults || [];

        // If we have tool results, create a formatted response based on the specific tool used
        if (toolResults.length > 0) {
          // Handle findDonorsByName results
          const findDonorsResults = toolResults.find((tr) => tr.toolName === "findDonorsByName")?.result as
            | DonorSearchResult[]
            | undefined;

          if (findDonorsResults && Array.isArray(findDonorsResults) && findDonorsResults.length > 0) {
            // We have donor information, create a formatted response
            const donors = findDonorsResults;
            const donorCount = donors.length;

            let formattedResponse = `I found ${donorCount} donor${
              donorCount !== 1 ? "s" : ""
            } matching your search:\n\n`;

            donors.forEach((donor: DonorSearchResult, index: number) => {
              const name = donor.displayName || `${donor.firstName} ${donor.lastName}`;
              const totalAmount = (donor.totalDonations / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              });

              formattedResponse += `${index + 1}. ${name} - ${totalAmount} total from ${donor.donationCount} donation${
                donor.donationCount !== 1 ? "s" : ""
              }\n`;
              if (donor.email) formattedResponse += `   Email: ${donor.email}\n`;
              if (donor.phone) formattedResponse += `   Phone: ${donor.phone}\n`;
            });

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
          }

          // Handle donor details results
          const donorDetailsResult = toolResults.find((tr) => tr.toolName === "getDonorDetails")?.result as
            | DonorDetailsResult
            | undefined;
          if (donorDetailsResult) {
            const donor = donorDetailsResult;
            const name = donor.displayName || `${donor.firstName} ${donor.lastName}`;
            const totalAmount = (donor.totalDonations / 100).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            });

            let formattedResponse = `Donor Information for ${name}:\n\n`;
            formattedResponse += `Total Donations: ${totalAmount} across ${donor.donationCount} donation${
              donor.donationCount !== 1 ? "s" : ""
            }\n`;

            if (donor.lastDonationDate) {
              const lastDonationDate = new Date(donor.lastDonationDate);
              formattedResponse += `Last Donation: ${lastDonationDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}\n`;
            }

            formattedResponse += `\nContact Information:\n`;
            formattedResponse += `Email: ${donor.email}\n`;
            if (donor.phone) formattedResponse += `Phone: ${donor.phone}\n`;
            if (donor.address) formattedResponse += `Address: ${donor.address}\n`;
            if (donor.state) formattedResponse += `State: ${donor.state}\n`;

            if (donor.assignedStaff) {
              formattedResponse += `\nAssigned Staff: ${donor.assignedStaff.firstName} ${donor.assignedStaff.lastName}\n`;
            }

            if (donor.currentStageName) {
              formattedResponse += `Current Stage: ${donor.currentStageName}\n`;
            }

            if (donor.highPotentialDonor) {
              formattedResponse += `High Potential: Yes\n`;
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
          }

          // Handle donation history results
          const donationHistoryResults = toolResults.find((tr) => tr.toolName === "getDonationHistory")?.result as
            | DonationHistoryResult[]
            | undefined;
          if (donationHistoryResults && Array.isArray(donationHistoryResults) && donationHistoryResults.length > 0) {
            const donations = donationHistoryResults;

            let formattedResponse = `Donation History (${donations.length} donations):\n\n`;

            donations.forEach((donation: DonationHistoryResult, index: number) => {
              const date = new Date(donation.date);
              const amount = (donation.amount / 100).toLocaleString("en-US", {
                style: "currency",
                currency: donation.currency,
              });

              formattedResponse += `${index + 1}. ${amount} on ${date.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}\n`;
              formattedResponse += `   Project: ${donation.projectName}\n`;
            });

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
          }

          // Handle donor statistics
          const donorStatisticsResult = toolResults.find((tr) => tr.toolName === "getDonorStatistics")?.result as
            | DonorStatisticsResult
            | undefined;
          if (donorStatisticsResult) {
            const stats = donorStatisticsResult;
            const totalAmount = (stats.totalDonationAmount / 100).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            });
            const averageAmount = (stats.averageDonationAmount / 100).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            });

            let formattedResponse = `Organization Donor Statistics:\n\n`;
            formattedResponse += `Total Donors: ${stats.totalDonors}\n`;
            formattedResponse += `Total Donations: ${stats.totalDonations}\n`;
            formattedResponse += `Total Amount Donated: ${totalAmount}\n`;
            formattedResponse += `Average Donation Amount: ${averageAmount}\n`;
            formattedResponse += `High Potential Donors: ${stats.highPotentialDonors}\n`;
            formattedResponse += `Couples: ${stats.couplesCount}\n`;
            formattedResponse += `Individuals: ${stats.individualsCount}\n`;

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
          }

          // Handle top donors
          const topDonorsResults = toolResults.find((tr) => tr.toolName === "getTopDonors")?.result as
            | TopDonorsResult[]
            | undefined;
          if (topDonorsResults && Array.isArray(topDonorsResults) && topDonorsResults.length > 0) {
            const donors = topDonorsResults;

            let formattedResponse = `Top Donors (by donation amount):\n\n`;

            donors.forEach((donor: TopDonorsResult, index: number) => {
              const name = donor.displayName || `${donor.firstName} ${donor.lastName}`;
              const totalAmount = (donor.totalDonations / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              });

              formattedResponse += `${index + 1}. ${name} - ${totalAmount} total from ${donor.donationCount} donation${
                donor.donationCount !== 1 ? "s" : ""
              }\n`;
            });

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
          }

          // If we got to this point, we have tool results but no specific handler for them
          // Let's create a meaningful response by showing all tool results
          let formattedResponse = "Here's what I found for your query:\n\n";

          // Log all tool results to help debug
          logger.info(`Tool results available: ${toolResults.map((tr) => tr.toolName).join(", ")}`);

          toolResults.forEach((toolResult) => {
            formattedResponse += `${toolResult.toolName} results:\n`;

            // Format the data based on what we have
            if (toolResult.result === null) {
              formattedResponse += "No data found\n\n";
            } else if (Array.isArray(toolResult.result)) {
              if (toolResult.result.length === 0) {
                formattedResponse += "No results found\n\n";
              } else {
                // Format array data
                toolResult.result.forEach((item: any, index: number) => {
                  formattedResponse += `${index + 1}. `;

                  if (typeof item === "object") {
                    // Handle object output
                    if ("firstName" in item && "lastName" in item) {
                      formattedResponse += `${item.firstName} ${item.lastName}`;
                    }

                    if ("amount" in item && typeof item.amount === "number") {
                      const amount = (item.amount / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: item.currency || "USD",
                      });
                      formattedResponse += ` - ${amount}`;
                    }

                    if ("totalDonations" in item && typeof item.totalDonations === "number") {
                      const totalAmount = (item.totalDonations / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      });
                      formattedResponse += ` - ${totalAmount} total`;
                    }

                    if ("email" in item) {
                      formattedResponse += ` (${item.email})`;
                    }
                  } else {
                    // Simple value
                    formattedResponse += `${item}`;
                  }

                  formattedResponse += "\n";
                });
                formattedResponse += "\n";
              }
            } else if (typeof toolResult.result === "object") {
              // Format object data
              Object.entries(toolResult.result).forEach(([key, value]) => {
                // Format numeric values that might be money
                if (
                  typeof value === "number" &&
                  ["amount", "totalDonations", "totalDonationAmount", "averageDonationAmount"].some((k) =>
                    key.includes(k)
                  )
                ) {
                  const amount = (value / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  });
                  formattedResponse += `${key}: ${amount}\n`;
                } else if (value instanceof Date) {
                  formattedResponse += `${key}: ${value.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}\n`;
                } else {
                  formattedResponse += `${key}: ${value}\n`;
                }
              });
              formattedResponse += "\n";
            } else {
              // Simple value
              formattedResponse += `${toolResult.result}\n\n`;
            }
          });

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

      // Return a user-friendly error message
      return {
        response:
          "I'm sorry, I encountered an error while processing your request. Please try again later or contact support if the issue persists.",
        tokensUsed: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    }
  }

  /**
   * Build the system prompt for the AI assistant
   */
  private buildSystemPrompt(): string {
    return `You are a helpful AI assistant for a nonprofit organization's donor management system. You can help users find information about donors and their donations via WhatsApp.

Your capabilities include:
- Finding donors by name (partial matches supported)
- Getting detailed donor information including contact details and donation summaries
- Retrieving full donation histories for specific donors
- Providing organization-wide donor statistics
- Identifying top donors by contribution amount

CRITICAL CONTEXT AWARENESS:
- ALWAYS pay attention to the conversation history when provided
- When users ask follow-up questions (like "what time was that donation?"), understand they're referring to the previously mentioned donor
- Use context from previous messages to determine which donor or topic the user is asking about
- If a follow-up question asks for more details, use the appropriate tool to get that specific information

IMPORTANT WORKFLOW:
- When asked for donation history: First find the donor by name, then use their ID to get donation history
- For follow-up questions about timing/dates: Use getDonationHistory to get specific donation dates
- Always provide a final text response summarizing what you found
- If tools return empty results, explain what you searched for and suggest alternatives

Guidelines for responses:
1. Be friendly, professional, and concise in your responses
2. When presenting donation amounts, format them clearly (e.g., "$1,234.56" for amounts in cents)
3. When showing dates, use a readable format (e.g., "March 15, 2024")
4. If a donor has privacy concerns, be respectful of sensitive information
5. If you can't find specific information, suggest alternative searches or ask for clarification
6. Always use the available tools to get accurate, up-to-date information from the database
7. For donation amounts, remember they are stored in cents, so divide by 100 for display
8. When multiple donors match a search, present them in an organized list
9. If asked about specific donors, try to search by name first to get the donor ID, then get detailed information
10. IMPORTANT: Always provide a response, even if no data is found. Never return an empty message.
11. If no donors are found, clearly explain this and suggest checking the spelling or trying a partial name search
12. After using tools, ALWAYS generate a final response text - never leave the response empty
13. For donation history requests: find donor first, then get their donation history, then summarize the results
14. UNDERSTAND FOLLOW-UP QUESTIONS: If the user asks "when", "what time", "how much", etc. without specifying a donor name, they're referring to the donor from the previous conversation

CONVERSATION CONTEXT EXAMPLES:
- User: "n history of the donor Aaron Kirshtein" → Use findDonorsByName to find Aaron
- User: "what time was that donation?" → This is a FOLLOW-UP! Use getDonationHistory for the previously mentioned donor (Aaron Kirshtein)
- User: "how much did they give last year?" → Another FOLLOW-UP! Get donation history for the same donor

CRITICAL INSTRUCTION: You MUST ALWAYS generate a complete, thorough text response after using tools. 
NEVER return an empty response or a partial response like "Here's what I found:" without following it with actual data.

- Always format your response as a complete standalone message
- Always include specific data from the tool results (like names, amounts, dates, etc.)
- Always format money values properly (e.g., "$1,234.56")
- If tools provide data, you MUST summarize that data in your response with specific details
- If no tools provide data, explain what you searched for and that no results were found
- Empty or generic responses will cause the system to fail and frustrate users

AGAIN: Your response MUST include specific data from the tool results, not just a generic message saying you found something.

Example response formats:
- For donor search: "I found 3 donors matching 'John': John Smith (john@email.com), John Doe (john.doe@email.com), Johnny Wilson (johnny@email.com)"
- For donor details: "John Smith has donated $1,234.56 across 5 donations, last donation on March 15, 2024. Contact: john@email.com, (555) 123-4567"
- For donation history: "Aaron Kirshtein made their donation of $1,000 on December 15, 2023 at 2:30 PM"
- For statistics: "Your organization has 150 donors who have made 420 total donations worth $45,678.90"
- For no results: "I couldn't find any donors matching 'Aaron Kirshtein'. Please check the spelling or try searching with just the first or last name, like 'Aaron' or 'Kirshtein'."

Remember to be helpful and accurate while maintaining appropriate privacy and security standards.`;
  }

  /**
   * Check if a message appears to be asking about donors
   * This is a simple heuristic to determine if we should process the message with AI
   */
  static isDonorQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const donorKeywords = [
      "donor",
      "donors",
      "donation",
      "donations",
      "donate",
      "donated",
      "contribute",
      "contribution",
      "contributions",
      "gave",
      "give",
      "giving",
      "pledge",
      "pledged",
      "amount",
      "total",
      "history",
      "statistics",
      "stats",
      "top",
      "biggest",
      "largest",
      "most",
      "how much",
      "when did",
      "last donation",
      "find",
      "search",
      "look up",
      "tell me about",
      "show me",
      "list",
    ];

    return donorKeywords.some((keyword) => lowerMessage.includes(keyword));
  }
}
