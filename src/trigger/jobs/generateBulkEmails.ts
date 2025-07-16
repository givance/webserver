import { task, logger as triggerLogger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { db } from '@/app/lib/db';
import {
  emailGenerationSessions,
  generatedEmails,
  EmailGenerationSessionStatus,
} from '@/app/lib/db/schema';
import { eq } from 'drizzle-orm';
import { UnifiedSmartEmailGenerationService } from '@/app/lib/services/unified-smart-email-generation.service';
import { countEmailsBySession } from '@/app/lib/data/email-campaigns';

// Define the payload schema using Zod
const generateBulkEmailsPayloadSchema = z.object({
  sessionId: z.number(),
  organizationId: z.string(),
  userId: z.string(),
  selectedDonorIds: z.array(z.number()),
  previewDonorIds: z.array(z.number()),
  chatHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
  templateId: z.number().optional(),
  organizationWritingInstructions: z.string().optional(),
  staffWritingInstructions: z.string().optional(),
});

type GenerateBulkEmailsPayload = z.infer<typeof generateBulkEmailsPayloadSchema>;

/**
 * Trigger job for generating bulk emails for all selected donors
 */
export const generateBulkEmailsTask = task({
  id: 'generate-bulk-emails',
  run: async (payload: GenerateBulkEmailsPayload, { ctx }) => {
    const {
      sessionId,
      organizationId,
      userId,
      selectedDonorIds,
      previewDonorIds,
      chatHistory,
      templateId,
      organizationWritingInstructions,
      staffWritingInstructions,
    } = payload;

    triggerLogger.info(
      `Starting bulk email generation for session ${sessionId} with ${selectedDonorIds.length} donors`
    );

    try {
      // Update session status to GENERATING
      await db
        .update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.GENERATING,
          triggerJobId: ctx.run.id,
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      // Check which donors already have emails in this session
      const existingEmails = await db
        .select({ donorId: generatedEmails.donorId })
        .from(generatedEmails)
        .where(eq(generatedEmails.sessionId, sessionId));

      const donorsWithExistingEmails = new Set(existingEmails.map((email) => email.donorId));

      // Filter selected donors to only those without existing emails
      const donorIdsToGenerate = selectedDonorIds.filter((id) => !donorsWithExistingEmails.has(id));

      if (donorIdsToGenerate.length === 0) {
        triggerLogger.info(
          `All donors already have generated emails for session ${sessionId}. Updating session status to COMPLETED.`
        );

        // Get actual count of emails from database
        const actualEmailCount = await countEmailsBySession(sessionId);

        // Update session status to COMPLETED since all emails already exist
        await db
          .update(emailGenerationSessions)
          .set({
            status: EmailGenerationSessionStatus.COMPLETED,
            completedDonors: actualEmailCount,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailGenerationSessions.id, sessionId));

        return {
          status: 'success',
          sessionId,
          emailsGenerated: 0,
          message: 'All emails were already generated',
        };
      }

      triggerLogger.info(
        `Generating emails for ${donorIdsToGenerate.length} new donors (${donorsWithExistingEmails.size} already exist)`
      );

      // Use the unified service to generate emails
      const unifiedService = new UnifiedSmartEmailGenerationService();

      const generationResult = await unifiedService.generateSmartEmailsForCampaign({
        organizationId,
        sessionId: String(sessionId),
        chatHistory: chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>,
        donorIds: donorIdsToGenerate.map((id) => String(id)),
      });

      triggerLogger.info(
        `Successfully generated ${generationResult.results.length} emails with total ${generationResult.totalTokensUsed} tokens`
      );

      // Count successful generations
      const successfulGenerations = generationResult.results.filter((r) => r.email !== null).length;

      // Get actual count of emails from database (more accurate than frontend counting)
      const actualEmailCount = await countEmailsBySession(sessionId);

      // Update session status based on results
      await db
        .update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.READY_TO_SEND,
          completedDonors: actualEmailCount,
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      triggerLogger.info(
        `Session ${sessionId} updated to READY_TO_SEND with ${successfulGenerations} new emails generated`
      );

      return {
        status: 'success',
        sessionId,
        emailsGenerated: successfulGenerations,
        totalTokensUsed: generationResult.totalTokensUsed,
        message: `Generated ${successfulGenerations} emails successfully`,
      };
    } catch (error) {
      triggerLogger.error(
        `Error in generateBulkEmailsTask for session ${sessionId}:`,
        error as any
      );

      // Update session with error
      await db
        .update(emailGenerationSessions)
        .set({
          status: EmailGenerationSessionStatus.READY_TO_SEND,
          errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
          updatedAt: new Date(),
        })
        .where(eq(emailGenerationSessions.id, sessionId));

      throw error;
    }
  },
});
