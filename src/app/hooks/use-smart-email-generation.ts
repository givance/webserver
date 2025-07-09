import { useState, useCallback } from 'react';
import { trpc } from '@/app/lib/trpc/client';
import { toast } from 'sonner';
import { logger } from '@/app/lib/logger';
import {
  SmartEmailSessionStep,
  SmartEmailSessionStatus,
  type SmartEmailSession,
  type SmartEmailMessage,
  type AgentResponse,
  type SmartEmailSessionStepType,
} from '@/app/lib/smart-email-generation/types/smart-email-types';

export interface UseSmartEmailGenerationProps {
  onComplete?: (sessionId: string, finalInstruction: string) => void;
  onError?: (error: Error) => void;
}

export interface SmartEmailGenerationState {
  // Session state
  sessionId: string | null;
  session: SmartEmailSession | null;
  messages: SmartEmailMessage[];
  currentStep: SmartEmailSessionStepType;
  isComplete: boolean;
  finalInstruction: string | null;

  // UI state
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;

  // Conversation state
  lastResponse: AgentResponse | null;
  canContinue: boolean;
}

export interface SmartEmailGenerationActions {
  startFlow: (donorIds: number[], initialInstruction: string) => Promise<void>;
  continueConversation: (message: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  abandonSession: () => Promise<void>;
  generateEmails: () => Promise<void>;
  resetState: () => void;
}

/**
 * React hook for managing smart email generation conversations
 *
 * This hook provides a complete interface for the smart email generation flow,
 * including state management, error handling, and conversation management.
 */
export function useSmartEmailGeneration(
  props: UseSmartEmailGenerationProps = {}
): SmartEmailGenerationState & SmartEmailGenerationActions {
  const { onComplete, onError } = props;

  // State management
  const [state, setState] = useState<SmartEmailGenerationState>({
    sessionId: null,
    session: null,
    messages: [],
    currentStep: SmartEmailSessionStep.ANALYZING,
    isComplete: false,
    finalInstruction: null,
    isLoading: false,
    isProcessing: false,
    error: null,
    lastResponse: null,
    canContinue: true,
  });

  // tRPC mutations and queries
  const startFlowMutation = trpc.smartEmailGeneration.startFlow.useMutation();
  const continueConversationMutation = trpc.smartEmailGeneration.continueConversation.useMutation();
  const resumeSessionMutation = trpc.smartEmailGeneration.resumeSession.useMutation();
  const abandonSessionMutation = trpc.smartEmailGeneration.abandonSession.useMutation();
  const generateEmailsMutation = trpc.smartEmailGeneration.generateEmailsFromSession.useMutation();

  // Utility to update state
  const updateState = useCallback((updates: Partial<SmartEmailGenerationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Error handler
  const handleError = useCallback(
    (error: Error, context: string) => {
      logger.error(`[useSmartEmailGeneration] ${context}:`, error);
      updateState({
        error: error.message,
        isLoading: false,
        isProcessing: false,
      });
      toast.error(`Error: ${error.message}`);
      onError?.(error);
    },
    [onError, updateState]
  );

  // Use tRPC utils for programmatic queries
  const utils = trpc.useUtils();

  // Helper to load session state
  const loadSessionState = useCallback(
    async (sessionId: string) => {
      try {
        const sessionState = await utils.smartEmailGeneration.getSessionState.fetch({
          sessionId,
        });

        const transformedSession: SmartEmailSession = {
          ...sessionState.session,
          createdAt: new Date(sessionState.session.createdAt),
          updatedAt: new Date(sessionState.session.updatedAt),
          expiresAt: new Date(sessionState.session.expiresAt),
          donorIds: sessionState.session.donorIds as number[],
          donorAnalysis: sessionState.session.donorAnalysis || null,
          orgAnalysis: sessionState.session.orgAnalysis || null,
        };

        const transformedMessages: SmartEmailMessage[] = sessionState.messages.map((msg) => ({
          ...msg,
          createdAt: new Date(msg.createdAt),
          toolCalls: msg.toolCalls || null,
          toolResults: msg.toolResults || null,
        }));

        updateState({
          session: transformedSession,
          messages: transformedMessages,
          currentStep: sessionState.currentStep as SmartEmailSessionStepType,
          isComplete: sessionState.isComplete,
          finalInstruction: sessionState.session.finalInstruction || null,
        });
      } catch (error) {
        logger.error('[useSmartEmailGeneration] Failed to load session state:', error);
        // Don't throw here as this might be called during other operations
      }
    },
    [updateState, utils]
  );

  // Start new smart email generation flow
  const startFlow = useCallback(
    async (donorIds: number[], initialInstruction: string) => {
      try {
        updateState({
          isLoading: true,
          error: null,
          sessionId: null,
          session: null,
          messages: [],
          isComplete: false,
          finalInstruction: null,
        });

        const result = await startFlowMutation.mutateAsync({
          donorIds,
          initialInstruction,
        });

        const transformedResponse: AgentResponse = {
          content: result.response.content,
          shouldContinue: result.response.shouldContinue,
          toolCalls: result.response.toolCalls?.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments || {},
          })),
          nextStep: result.response.nextStep,
        };

        updateState({
          sessionId: result.sessionId,
          currentStep: result.currentStep,
          lastResponse: transformedResponse,
          canContinue: result.response.shouldContinue,
          isLoading: false,
          isProcessing: false,
        });

        // Load full session state
        await loadSessionState(result.sessionId);

        toast.success('Smart email generation started');
      } catch (error) {
        handleError(error as Error, 'starting smart email flow');
      }
    },
    [startFlowMutation, updateState, handleError, loadSessionState]
  );

  // Continue existing conversation
  const continueConversation = useCallback(
    async (message: string) => {
      if (!state.sessionId) {
        throw new Error('No active session');
      }

      try {
        updateState({
          isProcessing: true,
          error: null,
        });

        const result = await continueConversationMutation.mutateAsync({
          sessionId: state.sessionId,
          userMessage: message,
        });

        const transformedResponse: AgentResponse = {
          content: result.response.content,
          shouldContinue: result.response.shouldContinue,
          toolCalls: result.response.toolCalls?.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments || {},
          })),
          nextStep: result.response.nextStep,
        };

        updateState({
          currentStep: result.currentStep,
          isComplete: result.isComplete,
          finalInstruction: result.finalInstruction || null,
          lastResponse: transformedResponse,
          canContinue: result.response.shouldContinue,
          isProcessing: false,
        });

        // Load updated session state
        await loadSessionState(state.sessionId);

        if (result.isComplete && result.finalInstruction) {
          toast.success('Email instruction completed!');
          onComplete?.(state.sessionId, result.finalInstruction);
        }
      } catch (error) {
        handleError(error as Error, 'continuing conversation');
      }
    },
    [
      state.sessionId,
      continueConversationMutation,
      updateState,
      handleError,
      onComplete,
      loadSessionState,
    ]
  );

  // Resume existing session
  const resumeSession = useCallback(
    async (sessionId: string) => {
      try {
        updateState({
          isLoading: true,
          error: null,
        });

        // Resume the session
        await resumeSessionMutation.mutateAsync({ sessionId });

        // Load session state
        await loadSessionState(sessionId);

        updateState({
          sessionId,
          isLoading: false,
        });

        toast.success('Session resumed');
      } catch (error) {
        handleError(error as Error, 'resuming session');
      }
    },
    [resumeSessionMutation, updateState, handleError, loadSessionState]
  );

  // Abandon current session
  const abandonSession = useCallback(async () => {
    if (!state.sessionId) return;

    try {
      await abandonSessionMutation.mutateAsync({ sessionId: state.sessionId });

      updateState({
        sessionId: null,
        session: null,
        messages: [],
        currentStep: SmartEmailSessionStep.ANALYZING,
        isComplete: false,
        finalInstruction: null,
        lastResponse: null,
        canContinue: true,
      });

      toast.success('Session abandoned');
    } catch (error) {
      handleError(error as Error, 'abandoning session');
    }
  }, [state.sessionId, abandonSessionMutation, updateState, handleError]);

  // Generate emails from completed session
  const generateEmails = useCallback(async () => {
    if (!state.sessionId || !state.isComplete) {
      throw new Error('Session not complete');
    }

    try {
      updateState({
        isProcessing: true,
        error: null,
      });

      const result = await generateEmailsMutation.mutateAsync({
        sessionId: state.sessionId,
      });

      updateState({
        isProcessing: false,
      });

      if (result.success) {
        toast.success('Email generation initiated');
      }
    } catch (error) {
      handleError(error as Error, 'generating emails');
    }
  }, [state.sessionId, state.isComplete, generateEmailsMutation, updateState, handleError]);

  // Reset state
  const resetState = useCallback(() => {
    setState({
      sessionId: null,
      session: null,
      messages: [],
      currentStep: SmartEmailSessionStep.ANALYZING,
      isComplete: false,
      finalInstruction: null,
      isLoading: false,
      isProcessing: false,
      error: null,
      lastResponse: null,
      canContinue: true,
    });
  }, []);

  // Return state and actions
  return {
    // State
    ...state,

    // Actions
    startFlow,
    continueConversation,
    resumeSession,
    abandonSession,
    generateEmails,
    resetState,
  };
}

// Hook for loading active sessions
export function useActiveSmartEmailSessions() {
  const {
    data: sessions,
    isLoading,
    error,
    refetch,
  } = trpc.smartEmailGeneration.getActiveSessions.useQuery();

  return {
    sessions: sessions || [],
    isLoading,
    error,
    refetch,
  };
}

// Hook for loading session history
export function useSmartEmailSessionHistory(sessionId: string | null) {
  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = trpc.smartEmailGeneration.getConversationHistory.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId }
  );

  return {
    messages: messages || [],
    isLoading,
    error,
    refetch,
  };
}
