"use client";

import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/app/api/trpc/routers/_app";
import type { CommunicationThreadWithDetails, CommunicationChannel } from "@/app/lib/data/communications";

type ThreadOutput = inferProcedureOutput<AppRouter["communications"]["threads"]["getThread"]>;
type ListThreadsInput = inferProcedureInput<AppRouter["communications"]["threads"]["listThreads"]>;
type CreateThreadInput = inferProcedureInput<AppRouter["communications"]["threads"]["createThread"]>;
type AddMessageInput = inferProcedureInput<AppRouter["communications"]["threads"]["addMessage"]>;
type GetMessagesInput = inferProcedureInput<AppRouter["communications"]["threads"]["getMessages"]>;
type GenerateEmailsInput = inferProcedureInput<AppRouter["communications"]["campaigns"]["generateEmails"]>;
type CreateSessionInput = inferProcedureInput<AppRouter["communications"]["campaigns"]["createSession"]>;
type GetSessionInput = inferProcedureInput<AppRouter["communications"]["campaigns"]["getSession"]>;
type GetSessionStatusInput = inferProcedureInput<AppRouter["communications"]["campaigns"]["getSessionStatus"]>;
type ListCampaignsInput = inferProcedureInput<AppRouter["communications"]["campaigns"]["listCampaigns"]>;
type GetEmailStatusInput = inferProcedureInput<AppRouter["communications"]["campaigns"]["getEmailStatus"]>;

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

  // Query hooks - Communication Threads
  const listThreads = trpc.communications.threads.listThreads.useQuery;
  const getThread = trpc.communications.threads.getThread.useQuery;
  const getMessages = trpc.communications.threads.getMessages.useQuery;

  // Query hooks - Email Campaigns
  const getSession = trpc.communications.campaigns.getSession.useQuery;
  const getSessionStatus = trpc.communications.campaigns.getSessionStatus.useQuery;
  const listCampaigns = trpc.communications.campaigns.listCampaigns.useQuery;
  const getEmailStatus = trpc.communications.campaigns.getEmailStatus.useQuery;

  // Mutation hooks - Communication Threads
  const createThread = trpc.communications.threads.createThread.useMutation({
    onSuccess: () => {
      utils.communications.threads.listThreads.invalidate();
    },
  });

  const addMessage = trpc.communications.threads.addMessage.useMutation({
    onSuccess: (_, variables) => {
      utils.communications.threads.getMessages.invalidate({ threadId: variables.threadId });
      utils.communications.threads.getThread.invalidate({ id: variables.threadId });
    },
  });

  // Mutation hooks - Email Campaigns
  const generateEmails = trpc.communications.campaigns.generateEmails.useMutation();

  const createSession = trpc.communications.campaigns.createSession.useMutation({
    onSuccess: () => {
      // Optionally invalidate any session-related queries
    },
  });

  // Gmail mutation hooks
  const saveToDraft = trpc.gmail.saveToDraft.useMutation();
  const sendEmails = trpc.gmail.sendEmails.useMutation();
  const sendIndividualEmail = trpc.gmail.sendIndividualEmail.useMutation();
  const sendBulkEmails = trpc.gmail.sendBulkEmails.useMutation();
  const updateEmail = trpc.communications.campaigns.updateEmail.useMutation();
  const updateCampaign = trpc.communications.campaigns.updateCampaign.useMutation({
    onSuccess: () => {
      utils.communications.campaigns.listCampaigns.invalidate();
      utils.communications.campaigns.getSession.invalidate();
    },
  });

  // Delete campaign mutation hook
  const deleteCampaign = trpc.communications.campaigns.deleteCampaign.useMutation({
    onSuccess: () => {
      utils.communications.campaigns.listCampaigns.invalidate();
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
    updateCampaign,
  };
}
