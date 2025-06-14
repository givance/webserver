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

/**
 * WhatsApp AI service that processes user questions about donors
 * Uses Azure OpenAI with database query tools
 */
export class WhatsAppAIService {
  private queryTools: WhatsAppQueryToolsService;

  constructor() {
    this.queryTools = new WhatsAppQueryToolsService();
  }

  /**
   * Process a WhatsApp message and generate an AI response
   */
  async processMessage(request: WhatsAppAIRequest): Promise<WhatsAppAIResponse> {
    const { message, organizationId, fromPhoneNumber } = request;

    logger.info(`Processing WhatsApp message from ${fromPhoneNumber} for organization ${organizationId}: "${message}"`);

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = `User question: ${message}`;

      logger.info(`Sending request to Azure OpenAI (model: ${env.AZURE_OPENAI_DEPLOYMENT_NAME})`);
      logger.info(`System prompt length: ${systemPrompt.length} chars`);
      logger.info(`User prompt: ${userPrompt}`);

      const result = await generateText({
        model: azure(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        system: systemPrompt,
        prompt: userPrompt,
        tools: {
          findDonorsByName: {
            description:
              "Search for donors by name (supports partial matches). Use this when the user asks about a specific donor or wants to find donors by name.",
            parameters: FindDonorsByNameSchema,
            execute: async ({ name, limit = 10 }) => {
              logger.info(`[WhatsApp AI] Searching for donors with name: "${name}"`);
              const result = await this.queryTools.findDonorsByName({
                name,
                organizationId,
                limit,
              });
              logger.info(`[WhatsApp AI] Found ${result.length} donors. IDs: ${result.map((d) => d.id).join(", ")}`);
              return result;
            },
          },
          getDonorDetails: {
            description:
              "Get detailed information about a specific donor including contact info, donation history summary, and assigned staff.",
            parameters: GetDonorDetailsSchema,
            execute: async ({ donorId }) => {
              return await this.queryTools.getDonorDetails({
                donorId,
                organizationId,
              });
            },
          },
          getDonationHistory: {
            description: "Get the full donation history for a specific donor, including dates, amounts, and projects.",
            parameters: GetDonationHistorySchema,
            execute: async ({ donorId, limit = 50 }) => {
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
            execute: async ({ limit = 10 }) => {
              return await this.queryTools.getTopDonors({
                organizationId,
                limit,
              });
            },
          },
        },
        temperature: 0.7,
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
        logger.warn(`AI generated empty response, providing fallback message`);
        return {
          response:
            "I'm sorry, I couldn't find the information you're looking for. Please try rephrasing your question or check if the donor name is spelled correctly.",
          tokensUsed,
        };
      }

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

IMPORTANT WORKFLOW:
- When asked for donation history: First find the donor by name, then use their ID to get donation history
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

Example response formats:
- For donor search: "I found 3 donors matching 'John': John Smith (john@email.com), John Doe (john.doe@email.com), Johnny Wilson (johnny@email.com)"
- For donor details: "John Smith has donated $1,234.56 across 5 donations, last donation on March 15, 2024. Contact: john@email.com, (555) 123-4567"
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
