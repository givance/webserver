import { TRPCError } from "@trpc/server";
import { db } from "@/app/lib/db";
import { emailGenerationSessions, EmailGenerationSessionStatus, generatedEmails } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { UnifiedSmartEmailGenerationService } from "./unified-smart-email-generation.service";
import { eq } from "drizzle-orm";

/**
 * Input types for email generation
 */
export interface DonorInput {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface GenerateEmailsInput {
  donors: DonorInput[];
  organizationName: string;
  organizationWritingInstructions?: string;
  previousInstruction?: string;
  currentDate?: string;
  chatHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  signature?: string;
}

/**
 * Service for handling email generation business logic
 * This is now a wrapper around UnifiedSmartEmailGenerationService
 */
export class EmailGenerationService {
  private unifiedService: UnifiedSmartEmailGenerationService;

  constructor() {
    this.unifiedService = new UnifiedSmartEmailGenerationService();
  }

  /**
   * Generates smart donor emails based on instruction and donor data
   * @param input - Email generation parameters
   * @param organizationId - The organization ID
   * @param userId - The user ID for fetching user memories
   * @returns Generated emails for each donor
   */
  async generateSmartEmails(input: GenerateEmailsInput, organizationId: string, userId: string) {
    const { donors, chatHistory } = input;

    logger.info(`[EmailGenerationService] Chat history received: ${chatHistory ? chatHistory.length : 0} messages`);
    if (chatHistory && chatHistory.length > 0) {
      logger.info(
        `[EmailGenerationService] Latest message: ${chatHistory[chatHistory.length - 1]?.role}: "${
          chatHistory[chatHistory.length - 1]?.content
        }"`
      );
    }

    try {
      // Create a temporary session for immediate generation
      const tempSession = await db.insert(emailGenerationSessions).values({
        organizationId,
        userId,
        jobName: "Direct Generation",
        chatHistory: chatHistory || [],
        selectedDonorIds: donors.map(d => d.id),
        previewDonorIds: [],
        status: EmailGenerationSessionStatus.GENERATING,
        totalDonors: donors.length,
        completedDonors: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();

      const sessionId = tempSession[0].id;

      // Use the unified service to generate emails
      const result = await this.unifiedService.generateSmartEmailsForCampaign({
        organizationId,
        sessionId: String(sessionId),
        chatHistory: chatHistory || [],
        donorIds: donors.map(d => String(d.id))
      });

      // Update session status
      await db.update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.READY_TO_SEND,
          completedDonors: result.results.length,
          updatedAt: new Date()
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      // Format response to match expected structure
      const emails = result.results
        .filter(r => r.email !== null)
        .map(r => ({
          donorId: r.donor.id,
          subject: r.email!.subject,
          emailContent: r.email!.content,
          reasoning: r.email!.reasoning,
          response: r.email!.response,
          structuredContent: [{
            piece: r.email!.content,
            references: ['email-content'],
            addNewlineAfter: false
          }],
          referenceContexts: { 'email-content': 'Generated email content' },
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: r.tokensUsed || 0
          }
        }));

      return {
        emails,
        sessionId,
        tokensUsed: result.totalTokensUsed
      };

    } catch (error) {
      logger.error("Error generating smart emails:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to generate emails"
      });
    }
  }

}