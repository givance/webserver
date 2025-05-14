"use client";

import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import type { CommunicationThreadWithDetails, CommunicationChannel } from "@/app/lib/data/communications";

type ThreadOutput = inferProcedureOutput<AppRouter["communications"]["getThread"]>;
type ListThreadsInput = inferProcedureInput<AppRouter["communications"]["listThreads"]>;
type CreateThreadInput = inferProcedureInput<AppRouter["communications"]["createThread"]>;
type AddMessageInput = inferProcedureInput<AppRouter["communications"]["addMessage"]>;
type GetMessagesInput = inferProcedureInput<AppRouter["communications"]["getMessages"]>;
type GenerateEmailsInput = inferProcedureInput<AppRouter["communications"]["generateEmails"]>;

interface ListThreadsOptions {
  channel?: CommunicationChannel;
  staffId?: number;
  donorId?: number;
  limit?: number;
  offset?: number;
  includeStaff?: boolean;
  includeDonors?: boolean;
  includeLatestMessage?: boolean;
}

interface ListThreadsResponse {
  threads: CommunicationThreadWithDetails[];
  totalCount: number;
}

/**
 * Hook for managing communication threads through the tRPC API
 * Provides methods for creating and managing communication threads and messages
 */
export function useCommunications() {
  const utils = trpc.useUtils();

  // Query hooks
  const listThreads = trpc.communications.listThreads.useQuery;
  const getThread = trpc.communications.getThread.useQuery;
  const getMessages = trpc.communications.getMessages.useQuery;

  // Mutation hooks
  const createThreadMutation = trpc.communications.createThread.useMutation({
    onSuccess: () => {
      utils.communications.listThreads.invalidate();
    },
  });

  const addMessageMutation = trpc.communications.addMessage.useMutation({
    onSuccess: (_, variables) => {
      utils.communications.getMessages.invalidate({ threadId: variables.threadId });
      utils.communications.getThread.invalidate({ id: variables.threadId });
    },
  });

  const generateEmailsMutation = trpc.communications.generateEmails.useMutation();

  const listCommunicationThreads = (options: ListThreadsOptions) => {
    return trpc.communications.listThreads.useQuery(options) as unknown as {
      data?: ListThreadsResponse;
      isLoading: boolean;
      error: Error | null;
    };
  };

  /**
   * Create a new communication thread
   * @param input The thread data to create
   * @returns The created thread or null if creation failed
   */
  const createThread = async (input: CreateThreadInput) => {
    try {
      return await createThreadMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to create communication thread:", error);
      return null;
    }
  };

  /**
   * Add a message to a thread
   * @param input The message data to add
   * @returns The created message or null if creation failed
   */
  const addMessage = async (input: AddMessageInput) => {
    try {
      return await addMessageMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to add message:", error);
      return null;
    }
  };

  /**
   * Generate personalized emails for donors based on instructions
   * @param input The input data containing instructions and donor information
   * @returns Array of generated emails or null if generation failed
   */
  const generateEmails = async (input: GenerateEmailsInput) => {
    try {
      return await generateEmailsMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to generate emails:", error);
      return null;
    }
  };

  return {
    // Query functions
    listThreads,
    getThread,
    getMessages,

    // Mutation functions
    createThread,
    addMessage,
    generateEmails,

    // Loading states
    isCreatingThread: createThreadMutation.isPending,
    isAddingMessage: addMessageMutation.isPending,
    isGeneratingEmails: generateEmailsMutation.isPending,

    // Mutation results
    createThreadResult: createThreadMutation.data,
    addMessageResult: addMessageMutation.data,
    generateEmailsResult: generateEmailsMutation.data,

    listCommunicationThreads,
  };
}
