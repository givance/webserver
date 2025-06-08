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
type CreateSessionInput = inferProcedureInput<AppRouter["communications"]["createSession"]>;
type GetSessionInput = inferProcedureInput<AppRouter["communications"]["getSession"]>;
type GetSessionStatusInput = inferProcedureInput<AppRouter["communications"]["getSessionStatus"]>;
type ListCampaignsInput = inferProcedureInput<AppRouter["communications"]["listCampaigns"]>;
type GetEmailStatusInput = inferProcedureInput<AppRouter["communications"]["getEmailStatus"]>;

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
  const getSession = trpc.communications.getSession.useQuery;
  const getSessionStatus = trpc.communications.getSessionStatus.useQuery;
  const listCampaigns = trpc.communications.listCampaigns.useQuery;
  const getEmailStatus = trpc.communications.getEmailStatus.useQuery;

  // Mutation hooks
  const createThread = trpc.communications.createThread.useMutation({
    onSuccess: () => {
      utils.communications.listThreads.invalidate();
    },
  });

  const addMessage = trpc.communications.addMessage.useMutation({
    onSuccess: (_, variables) => {
      utils.communications.getMessages.invalidate({ threadId: variables.threadId });
      utils.communications.getThread.invalidate({ id: variables.threadId });
    },
  });

  const generateEmails = trpc.communications.generateEmails.useMutation();

  const createSession = trpc.communications.createSession.useMutation({
    onSuccess: () => {
      // Optionally invalidate any session-related queries
    },
  });

  // Gmail mutation hooks
  const saveToDraft = trpc.gmail.saveToDraft.useMutation();
  const sendEmails = trpc.gmail.sendEmails.useMutation();
  const sendIndividualEmail = trpc.gmail.sendIndividualEmail.useMutation();
  const sendBulkEmails = trpc.gmail.sendBulkEmails.useMutation();
  const updateEmail = trpc.communications.updateEmail.useMutation();

  // Delete campaign mutation hook
  const deleteCampaign = trpc.communications.deleteCampaign.useMutation({
    onSuccess: () => {
      utils.communications.listCampaigns.invalidate();
    },
  });

  return {
    // Query hooks
    listThreads,
    getThread,
    getMessages,
    getSession,
    getSessionStatus,
    listCampaigns,
    getEmailStatus,

    // Mutation hooks
    createThread,
    addMessage,
    generateEmails,
    createSession,
    saveToDraft,
    sendEmails,
    deleteCampaign,
    sendIndividualEmail,
    sendBulkEmails,
    updateEmail,
  };
}
