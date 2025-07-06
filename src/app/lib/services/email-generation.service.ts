import { TRPCError } from "@trpc/server";
import { db } from "@/app/lib/db";
import { emailGenerationSessions, EmailGenerationSessionStatus, generatedEmails, organizations, staff, donors } from "@/app/lib/db/schema";
import { logger } from "@/app/lib/logger";
import { UnifiedSmartEmailGenerationService } from "./unified-smart-email-generation.service";
import { eq, and, inArray } from "drizzle-orm";
import { generateSingleEmail } from "@/app/lib/utils/email-generator/single-email-generator";
import { getComprehensiveDonorStats } from "@/app/lib/data/donations";
import { getUserMemories } from "@/app/lib/data/users";
import { getDonorCommunicationHistory } from "@/app/lib/data/communications";

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
  sessionId?: number; // Use existing session if provided
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
    const { donors, chatHistory, sessionId } = input;

    if (sessionId) {
      logger.info(`[EmailGenerationService] Generating emails for ${donors.length} donors using existing session ${sessionId}`);
    } else {
      logger.info(`[EmailGenerationService] Generating emails for ${donors.length} donors WITHOUT a session`);
    }

    if (chatHistory && chatHistory.length > 0) {
      logger.info(
        `[EmailGenerationService] Latest message: ${chatHistory[chatHistory.length - 1]?.role}: "${
          chatHistory[chatHistory.length - 1]?.content
        }"`
      );
    }

    try {
      // If sessionId is provided, use it. Otherwise generate without saving to DB
      if (sessionId) {
        // First, delete existing preview emails for these donors to avoid duplicates
        const donorIds = donors.map(d => d.id);
        await db.delete(generatedEmails).where(
          and(
            eq(generatedEmails.sessionId, sessionId),
            inArray(generatedEmails.donorId, donorIds),
            eq(generatedEmails.isPreview, true)
          )
        );
        logger.info(`[EmailGenerationService] Deleted existing preview emails for ${donorIds.length} donors in session ${sessionId}`);

        // Use the unified service with the existing session
        const result = await this.unifiedService.generateSmartEmailsForCampaign({
          organizationId,
          sessionId: String(sessionId),
          chatHistory: chatHistory || [],
          donorIds: donors.map(d => String(d.id))
        });

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
          sessionId, // Return the existing sessionId
          tokensUsed: result.totalTokensUsed
        };
      } else {
        // Generate emails without saving to database (for non-campaign use cases)
        // This would need a different implementation that doesn't save to DB
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email generation requires a sessionId. Please create a campaign session first."
        });
      }

    } catch (error) {
      logger.error("Error generating smart emails:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to generate emails"
      });
    }
  }

}