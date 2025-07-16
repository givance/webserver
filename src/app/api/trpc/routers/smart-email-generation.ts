import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { SmartEmailGenerationService } from '@/app/lib/smart-email-generation/services/smart-email-generation.service';
import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import {
  SmartEmailSessionStep,
  SmartEmailSessionStatus,
  MessageRole,
} from '@/app/lib/smart-email-generation/types/smart-email-types';

// Input validation schemas
const StartFlowInputSchema = z.object({
  donorIds: z.array(z.number()).min(1, 'At least one donor is required'),
  initialInstruction: z.string().min(10, 'Initial instruction must be at least 10 characters'),
});

const ContinueConversationInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  userMessage: z.string().min(1, 'Message cannot be empty'),
});

const SessionIdInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

// Output schemas for type safety
const AgentResponseSchema = z.object({
  content: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.any(),
      })
    )
    .optional(),
  nextStep: z.nativeEnum(SmartEmailSessionStep).optional(),
  shouldContinue: z.boolean(),
});

const SmartEmailSessionSchema = z.object({
  id: z.number(),
  sessionId: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  status: z.nativeEnum(SmartEmailSessionStatus),
  donorIds: z.any().transform((val) => val as number[]), // Handle JSONB field
  initialInstruction: z.string(),
  finalInstruction: z.string().nullable(),
  currentStep: z.nativeEnum(SmartEmailSessionStep),
  donorAnalysis: z.any().nullable(),
  orgAnalysis: z.any().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date(),
});

const SmartEmailMessageSchema = z.object({
  id: z.number(),
  sessionId: z.number(),
  messageIndex: z.number(),
  role: z.string().transform((val) => val as 'user' | 'assistant' | 'system'),
  content: z.string(),
  toolCalls: z.any().optional(),
  toolResults: z.any().optional(),
  createdAt: z.date(),
});

/**
 * Smart Email Generation tRPC Router
 *
 * This router provides all the endpoints needed for the smart email generation
 * conversational flow, including session management and conversation handling.
 */
export const smartEmailGenerationRouter = router({
  /**
   * Start a new smart email generation conversation
   */
  startFlow: protectedProcedure.input(StartFlowInputSchema).mutation(async ({ input, ctx }) => {
    try {
      logger.info(`[SmartEmailGenerationRouter] Starting flow for user ${ctx.auth.user.id}`);

      const service = new SmartEmailGenerationService();

      const result = await service.startSmartEmailFlow({
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
        donorIds: input.donorIds,
        initialInstruction: input.initialInstruction,
      });

      logger.info(`[SmartEmailGenerationRouter] Started session ${result.sessionId}`);
      return result;
    } catch (error) {
      logger.error('[SmartEmailGenerationRouter] Failed to start flow:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to start smart email generation flow'
      );
    }
  }),

  /**
   * Continue an existing conversation
   */
  continueConversation: protectedProcedure
    .input(ContinueConversationInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        logger.info(
          `[SmartEmailGenerationRouter] Continuing conversation for session ${input.sessionId}`
        );

        const service = new SmartEmailGenerationService();

        const result = await service.continueConversation({
          sessionId: input.sessionId,
          userMessage: input.userMessage,
          organizationId: ctx.auth.user.organizationId,
          userId: ctx.auth.user.id,
        });

        logger.info(
          `[SmartEmailGenerationRouter] Continued session ${input.sessionId}, complete: ${result.isComplete}`
        );
        return result;
      } catch (error) {
        logger.error('[SmartEmailGenerationRouter] Failed to continue conversation:', error);
        throw error;
      }
    }),

  /**
   * Get current session state
   */
  getSessionState: protectedProcedure.input(SessionIdInputSchema).query(async ({ input, ctx }) => {
    try {
      const service = new SmartEmailGenerationService();

      const result = await service.getSessionState({
        sessionId: input.sessionId,
        organizationId: ctx.auth.user.organizationId,
        userId: ctx.auth.user.id,
      });

      return result;
    } catch (error) {
      logger.error('[SmartEmailGenerationRouter] Failed to get session state:', error);
      throw error;
    }
  }),

  /**
   * Get active sessions for the current user
   */
  getActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    try {
      const service = new SmartEmailGenerationService();

      const sessions = await service.getActiveSessionsForUser(
        ctx.auth.user.id,
        ctx.auth.user.organizationId
      );

      return sessions;
    } catch (error) {
      logger.error('[SmartEmailGenerationRouter] Failed to get active sessions:', error);
      throw error;
    }
  }),

  /**
   * Abandon a session
   */
  abandonSession: protectedProcedure
    .input(SessionIdInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        logger.info(`[SmartEmailGenerationRouter] Abandoning session ${input.sessionId}`);

        const service = new SmartEmailGenerationService();

        await service.abandonSession(
          input.sessionId,
          ctx.auth.user.organizationId,
          ctx.auth.user.id
        );

        logger.info(`[SmartEmailGenerationRouter] Abandoned session ${input.sessionId}`);
        return { success: true };
      } catch (error) {
        logger.error('[SmartEmailGenerationRouter] Failed to abandon session:', error);
        throw error;
      }
    }),

  /**
   * Resume a session
   */
  resumeSession: protectedProcedure.input(SessionIdInputSchema).mutation(async ({ input, ctx }) => {
    try {
      logger.info(`[SmartEmailGenerationRouter] Resuming session ${input.sessionId}`);

      const service = new SmartEmailGenerationService();

      await service.resumeSession(input.sessionId, ctx.auth.user.organizationId, ctx.auth.user.id);

      logger.info(`[SmartEmailGenerationRouter] Resumed session ${input.sessionId}`);
      return { success: true };
    } catch (error) {
      logger.error('[SmartEmailGenerationRouter] Failed to resume session:', error);
      throw error;
    }
  }),

  /**
   * Get session conversation history
   */
  getConversationHistory: protectedProcedure
    .input(SessionIdInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        const service = new SmartEmailGenerationService();

        const sessionState = await service.getSessionState({
          sessionId: input.sessionId,
          organizationId: ctx.auth.user.organizationId,
          userId: ctx.auth.user.id,
        });

        return sessionState.messages;
      } catch (error) {
        logger.error('[SmartEmailGenerationRouter] Failed to get conversation history:', error);
        throw error;
      }
    }),

  /**
   * Generate emails from completed session
   */
  generateEmailsFromSession: protectedProcedure
    .input(SessionIdInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        logger.info(
          `[SmartEmailGenerationRouter] Generating emails from session ${input.sessionId}`
        );

        const service = new SmartEmailGenerationService();

        // Get session state
        const sessionState = await service.getSessionState({
          sessionId: input.sessionId,
          organizationId: ctx.auth.user.organizationId,
          userId: ctx.auth.user.id,
        });

        // Verify session is complete
        if (!sessionState.isComplete || !sessionState.session.finalInstruction) {
          throw ErrorHandler.createError(
            'BAD_REQUEST',
            'Session is not complete or missing final instruction'
          );
        }

        // TODO: Integrate with existing email generation system
        // This would call the UnifiedSmartEmailGenerationService with the final instruction

        logger.info(
          `[SmartEmailGenerationRouter] Email generation initiated for session ${input.sessionId}`
        );

        return {
          success: true,
          sessionId: input.sessionId,
          message: 'Email generation initiated successfully',
        };
      } catch (error) {
        logger.error('[SmartEmailGenerationRouter] Failed to generate emails:', error);
        throw error;
      }
    }),
});
