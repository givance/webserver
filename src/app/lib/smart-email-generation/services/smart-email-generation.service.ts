import { SmartEmailSessionRepository } from '../repositories/smart-email-session.repository';
import { SmartEmailMessageRepository } from '../repositories/smart-email-message.repository';
import { SmartEmailAgentService } from './smart-email-agent.service';
import { logger } from '@/app/lib/logger';
import { ErrorHandler } from '@/app/lib/utils/error-handler';
import {
  type SmartEmailSession,
  type SmartEmailMessage,
  type CreateSmartEmailSessionInput,
  type ConversationContext,
  type AgentResponse,
  SmartEmailSessionStep,
  type SmartEmailSessionStepType,
  SmartEmailSessionStatus,
  MessageRole,
} from '../types/smart-email-types';

export interface StartSmartEmailFlowInput {
  organizationId: string;
  userId: string;
  donorIds: number[];
  initialInstruction: string;
}

export interface StartSmartEmailFlowOutput {
  sessionId: string;
  response: AgentResponse;
  currentStep: SmartEmailSessionStepType;
}

export interface ContinueConversationInput {
  sessionId: string;
  userMessage: string;
  organizationId: string;
  userId: string;
}

export interface ContinueConversationOutput {
  response: AgentResponse;
  currentStep: SmartEmailSessionStepType;
  isComplete: boolean;
  finalInstruction?: string;
}

export interface GetSessionStateInput {
  sessionId: string;
  organizationId: string;
  userId: string;
}

export interface GetSessionStateOutput {
  session: SmartEmailSession;
  messages: SmartEmailMessage[];
  currentStep: SmartEmailSessionStepType;
  isComplete: boolean;
}

/**
 * Smart Email Generation Service
 *
 * This service orchestrates the conversational AI flow for email generation.
 * It manages sessions, coordinates with the AI agent, and handles the conversation lifecycle.
 */
export class SmartEmailGenerationService {
  private sessionRepo: SmartEmailSessionRepository;
  private messageRepo: SmartEmailMessageRepository;
  private agentService: SmartEmailAgentService;

  constructor() {
    this.sessionRepo = new SmartEmailSessionRepository();
    this.messageRepo = new SmartEmailMessageRepository();
    this.agentService = new SmartEmailAgentService();
  }

  /**
   * Start a new smart email generation conversation
   */
  async startSmartEmailFlow(input: StartSmartEmailFlowInput): Promise<StartSmartEmailFlowOutput> {
    try {
      logger.info(
        `[SmartEmailGenerationService] Starting smart email flow for ${input.donorIds.length} donors`
      );

      // Create new session
      const session = await this.sessionRepo.createSession({
        organizationId: input.organizationId,
        userId: input.userId,
        donorIds: input.donorIds,
        initialInstruction: input.initialInstruction,
      });

      // Add initial user message
      await this.messageRepo.addUserMessage(session.id, input.initialInstruction);

      // Build conversation context
      const context: ConversationContext = {
        sessionId: session.sessionId,
        donorIds: input.donorIds,
        organizationId: input.organizationId,
        userId: input.userId,
        messages: [],
        currentStep: SmartEmailSessionStep.ANALYZING,
      };

      // Get AI agent's initial response
      const agentResponse = await this.agentService.processInitialRequest(
        input.initialInstruction,
        context
      );

      // Save agent response
      await this.messageRepo.addAssistantMessage(
        session.id,
        agentResponse.content,
        agentResponse.toolCalls
      );

      // Update session with next step
      const nextStep = agentResponse.nextStep || SmartEmailSessionStep.QUESTIONING;
      await this.sessionRepo.updateSession({
        sessionId: session.sessionId,
        currentStep: nextStep,
      });

      logger.info(
        `[SmartEmailGenerationService] Started session ${session.sessionId} with step ${nextStep}`
      );

      return {
        sessionId: session.sessionId,
        response: agentResponse,
        currentStep: nextStep,
      };
    } catch (error) {
      logger.error('[SmartEmailGenerationService] Failed to start smart email flow:', error);
      throw ErrorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Failed to start smart email generation'
      );
    }
  }

  /**
   * Continue an existing conversation
   */
  async continueConversation(
    input: ContinueConversationInput
  ): Promise<ContinueConversationOutput> {
    try {
      logger.info(
        `[SmartEmailGenerationService] Continuing conversation for session ${input.sessionId}`
      );

      // Get existing session
      const session = await this.sessionRepo.getSessionBySessionId(input.sessionId);
      if (!session) {
        throw ErrorHandler.createError('NOT_FOUND', `Session ${input.sessionId} not found`);
      }

      // Verify session ownership
      if (session.organizationId !== input.organizationId || session.userId !== input.userId) {
        throw ErrorHandler.createError('UNAUTHORIZED', 'Session access denied');
      }

      // Check if session is active
      if (session.status !== SmartEmailSessionStatus.ACTIVE) {
        throw ErrorHandler.createError('BAD_REQUEST', 'Session is not active');
      }

      // Add user message
      await this.messageRepo.addUserMessage(session.id, input.userMessage);

      // Get conversation history
      const messages = await this.messageRepo.getMessagesBySessionId(session.id);

      // Build conversation context
      const context: ConversationContext = {
        sessionId: session.sessionId,
        donorIds: session.donorIds as number[],
        organizationId: session.organizationId,
        userId: session.userId,
        messages,
        currentStep: session.currentStep,
        donorAnalysis: session.donorAnalysis,
        orgAnalysis: session.orgAnalysis,
      };

      // Get AI agent's response
      const agentResponse = await this.agentService.processUserMessage(input.userMessage, context);

      // Save agent response
      await this.messageRepo.addAssistantMessage(
        session.id,
        agentResponse.content,
        agentResponse.toolCalls
      );

      // Update session state
      const nextStep = agentResponse.nextStep || session.currentStep;
      const isComplete = nextStep === SmartEmailSessionStep.COMPLETE;

      let finalInstruction: string | undefined;
      if (isComplete) {
        // Extract final instruction from agent response or session
        finalInstruction = await this.extractFinalInstruction(session, agentResponse);
      }

      await this.sessionRepo.updateSession({
        sessionId: session.sessionId,
        currentStep: nextStep,
        status: isComplete ? SmartEmailSessionStatus.COMPLETED : SmartEmailSessionStatus.ACTIVE,
        finalInstruction,
      });

      logger.info(
        `[SmartEmailGenerationService] Continued session ${session.sessionId} to step ${nextStep}`
      );

      return {
        response: agentResponse,
        currentStep: nextStep,
        isComplete,
        finalInstruction,
      };
    } catch (error) {
      logger.error('[SmartEmailGenerationService] Failed to continue conversation:', error);
      throw error;
    }
  }

  /**
   * Get current session state
   */
  async getSessionState(input: GetSessionStateInput): Promise<GetSessionStateOutput> {
    try {
      // Get session
      const session = await this.sessionRepo.getSessionBySessionId(input.sessionId);
      if (!session) {
        throw ErrorHandler.createError('NOT_FOUND', `Session ${input.sessionId} not found`);
      }

      // Verify session ownership
      if (session.organizationId !== input.organizationId || session.userId !== input.userId) {
        throw ErrorHandler.createError('UNAUTHORIZED', 'Session access denied');
      }

      // Get messages
      const messages = await this.messageRepo.getMessagesBySessionId(session.id);

      return {
        session,
        messages,
        currentStep: session.currentStep,
        isComplete: session.status === SmartEmailSessionStatus.COMPLETED,
      };
    } catch (error) {
      logger.error('[SmartEmailGenerationService] Failed to get session state:', error);
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessionsForUser(
    userId: string,
    organizationId: string
  ): Promise<SmartEmailSession[]> {
    try {
      return await this.sessionRepo.getActiveSessionsForUser(userId, organizationId);
    } catch (error) {
      logger.error('[SmartEmailGenerationService] Failed to get active sessions:', error);
      throw error;
    }
  }

  /**
   * Abandon a session
   */
  async abandonSession(sessionId: string, organizationId: string, userId: string): Promise<void> {
    try {
      const session = await this.sessionRepo.getSessionBySessionId(sessionId);
      if (!session) {
        throw ErrorHandler.createError('NOT_FOUND', `Session ${sessionId} not found`);
      }

      // Verify session ownership
      if (session.organizationId !== organizationId || session.userId !== userId) {
        throw ErrorHandler.createError('UNAUTHORIZED', 'Session access denied');
      }

      await this.sessionRepo.updateSession({
        sessionId,
        status: SmartEmailSessionStatus.ABANDONED,
      });

      logger.info(`[SmartEmailGenerationService] Abandoned session ${sessionId}`);
    } catch (error) {
      logger.error('[SmartEmailGenerationService] Failed to abandon session:', error);
      throw error;
    }
  }

  /**
   * Resume a session (extend expiry and activate)
   */
  async resumeSession(sessionId: string, organizationId: string, userId: string): Promise<void> {
    try {
      const session = await this.sessionRepo.getSessionBySessionId(sessionId);
      if (!session) {
        throw ErrorHandler.createError('NOT_FOUND', `Session ${sessionId} not found`);
      }

      // Verify session ownership
      if (session.organizationId !== organizationId || session.userId !== userId) {
        throw ErrorHandler.createError('UNAUTHORIZED', 'Session access denied');
      }

      // Extend expiry and activate
      await this.sessionRepo.extendSessionExpiry(sessionId);
      await this.sessionRepo.updateSession({
        sessionId,
        status: SmartEmailSessionStatus.ACTIVE,
      });

      logger.info(`[SmartEmailGenerationService] Resumed session ${sessionId}`);
    } catch (error) {
      logger.error('[SmartEmailGenerationService] Failed to resume session:', error);
      throw error;
    }
  }

  /**
   * Extract final instruction from session or agent response
   */
  private async extractFinalInstruction(
    session: SmartEmailSession,
    agentResponse: AgentResponse
  ): Promise<string | undefined> {
    try {
      // Check if agent response contains final instruction
      if (agentResponse.content && agentResponse.content.includes('final instruction')) {
        return agentResponse.content;
      }

      // Check session for stored final instruction
      if (session.finalInstruction) {
        return session.finalInstruction;
      }

      // Get conversation history and extract from last summarize tool call
      const messages = await this.messageRepo.getMessagesBySessionId(session.id);
      const lastMessage = messages[messages.length - 1];

      if (lastMessage && lastMessage.toolResults) {
        const toolResults = lastMessage.toolResults as any[];
        const summarizeResult = toolResults.find((r) => r.result?.finalInstruction);
        if (summarizeResult) {
          return summarizeResult.result.finalInstruction;
        }
      }

      // Fallback to initial instruction
      return session.initialInstruction;
    } catch (error) {
      logger.error('[SmartEmailGenerationService] Failed to extract final instruction:', error);
      return session.initialInstruction;
    }
  }
}
