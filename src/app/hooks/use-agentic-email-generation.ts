import { trpc } from "@/app/lib/trpc/client";
import { useState } from "react";

export interface AgenticConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date | string;
  stepType?: "question" | "confirmation" | "generation" | "complete";
}

export interface AgenticFlowState {
  sessionId?: string;
  isActive: boolean;
  needsUserInput: boolean;
  isComplete: boolean;
  conversation: AgenticConversationMessage[];
  canProceed?: boolean;
  isLoading: boolean;
  error?: string;
}

/**
 * React hook for managing agentic email generation flow
 */
export function useAgenticEmailGeneration() {
  const [flowState, setFlowState] = useState<AgenticFlowState>({
    isActive: false,
    needsUserInput: false,
    isComplete: false,
    conversation: [],
    isLoading: false,
  });

  // tRPC mutations
  const startFlowMutation = trpc.communications.agenticCampaigns.startFlow.useMutation();
  const continueFlowMutation = trpc.communications.agenticCampaigns.continueFlow.useMutation();
  const generateFinalPromptMutation = trpc.communications.agenticCampaigns.generateFinalPrompt.useMutation();
  const executeGenerationMutation = trpc.communications.agenticCampaigns.executeGeneration.useMutation();

  // tRPC queries
  const sessionStateQuery = trpc.communications.agenticCampaigns.getSessionState.useQuery(
    { sessionId: flowState.sessionId! },
    { enabled: !!flowState.sessionId }
  );

  /**
   * Starts a new agentic email generation flow
   */
  const startFlow = async (input: {
    instruction: string;
    donors: Array<{
      id: number;
      firstName: string;
      lastName: string;
      email: string;
    }>;
    organizationName: string;
    organizationWritingInstructions?: string;
    currentDate?: string;
  }) => {
    try {
      setFlowState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      const result = await startFlowMutation.mutateAsync(input);

      setFlowState({
        sessionId: result.sessionId,
        isActive: true,
        needsUserInput: result.needsUserInput,
        isComplete: result.isComplete,
        conversation: result.conversation,
        canProceed: result.canProceed,
        isLoading: false,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start agentic flow";
      setFlowState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  };

  /**
   * Continues the agentic conversation with user response
   */
  const continueFlow = async (userResponse: string) => {
    if (!flowState.sessionId) {
      throw new Error("No active session");
    }

    try {
      setFlowState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      const result = await continueFlowMutation.mutateAsync({
        sessionId: flowState.sessionId,
        userResponse,
      });

      setFlowState((prev) => ({
        ...prev,
        needsUserInput: result.needsUserInput,
        isComplete: result.isComplete,
        conversation: result.conversation,
        canProceed: result.canProceed,
        isLoading: false,
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to continue flow";
      setFlowState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  };

  /**
   * Generates the final prompt for user confirmation
   */
  const generateFinalPrompt = async () => {
    if (!flowState.sessionId) {
      throw new Error("No active session");
    }

    try {
      setFlowState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      const result = await generateFinalPromptMutation.mutateAsync({
        sessionId: flowState.sessionId,
      });

      setFlowState((prev) => ({ ...prev, isLoading: false }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to generate final prompt";
      setFlowState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  };

  /**
   * Executes email generation with the confirmed prompt
   */
  const executeGeneration = async (confirmedPrompt: string) => {
    if (!flowState.sessionId) {
      throw new Error("No active session");
    }

    try {
      setFlowState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      const result = await executeGenerationMutation.mutateAsync({
        sessionId: flowState.sessionId,
        confirmedPrompt,
      });

      setFlowState((prev) => ({
        ...prev,
        isComplete: true,
        isActive: false,
        isLoading: false,
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to execute generation";
      setFlowState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  };

  /**
   * Resets the agentic flow state
   */
  const resetFlow = () => {
    setFlowState({
      isActive: false,
      needsUserInput: false,
      isComplete: false,
      conversation: [],
      isLoading: false,
    });
  };

  /**
   * Adds a user message to the conversation (for UI feedback)
   */
  const addUserMessage = (content: string) => {
    setFlowState((prev) => ({
      ...prev,
      conversation: [
        ...prev.conversation,
        {
          role: "user" as const,
          content,
          timestamp: new Date(),
        },
      ],
    }));
  };

  return {
    // State
    flowState,

    // Actions
    startFlow,
    continueFlow,
    generateFinalPrompt,
    executeGeneration,
    resetFlow,
    addUserMessage,

    // Loading states
    isStarting: startFlowMutation.isPending,
    isContinuing: continueFlowMutation.isPending,
    isGeneratingPrompt: generateFinalPromptMutation.isPending,
    isExecuting: executeGenerationMutation.isPending,

    // Error states
    startError: startFlowMutation.error,
    continueError: continueFlowMutation.error,
    generatePromptError: generateFinalPromptMutation.error,
    executeError: executeGenerationMutation.error,
  };
}
