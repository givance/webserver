'use client';

import type { AppRouter } from '@/app/api/trpc/routers/_app';
import type {
  CommunicationChannel,
  CommunicationThreadWithDetails,
} from '@/app/lib/data/communications';
import { trpc } from '@/app/lib/trpc/client';
import type { inferProcedureInput, inferProcedureOutput } from '@trpc/server';

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

  // Query hooks - Email Campaigns with enhanced caching
  const getSession = (input: any, opts?: any) =>
    trpc.communications.campaigns.getSession.useQuery(input, {
      staleTime: 2 * 60 * 1000, // 2 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Prevent automatic refetch on mount
      refetchOnReconnect: false,
      retry: 1,
      ...opts,
    });
  const getSessionStatus = trpc.communications.campaigns.getSessionStatus.useQuery;
  const listCampaigns = trpc.communications.campaigns.listCampaigns.useQuery;
  const getEmailStatus = trpc.communications.campaigns.getEmailStatus.useQuery;
  const getEmailSchedule = trpc.communications.campaigns.getEmailSchedule.useQuery;
  const getScheduleConfig = trpc.communications.campaigns.getScheduleConfig.useQuery;

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
  const createSession = trpc.communications.campaigns.createSession.useMutation({
    onSuccess: () => {
      // Invalidate campaign sessions since a new session is created
      utils.communications.campaigns.listCampaigns.invalidate();
    },
  });

  const launchCampaign = trpc.communications.campaigns.launchCampaign.useMutation({
    onSuccess: () => {
      // Invalidate campaigns list to reflect the launched campaign
      utils.communications.campaigns.listCampaigns.invalidate();
    },
  });

  // Gmail mutation hooks
  const saveToDraft = trpc.gmail.saveToDraft.useMutation();
  const sendEmails = trpc.gmail.sendEmails.useMutation();
  const sendIndividualEmail = trpc.gmail.sendIndividualEmail.useMutation();
  const sendBulkEmails = trpc.gmail.sendBulkEmails.useMutation();
  const updateEmail = trpc.communications.campaigns.updateEmail.useMutation({
    onSuccess: async (data) => {
      // Only invalidate once, no excessive refetching
      if (data?.sessionId) {
        await utils.communications.campaigns.getSession.invalidate({ sessionId: data.sessionId });
      }
    },
  });

  const updateEmailStatus = trpc.communications.campaigns.updateEmailStatus.useMutation({
    onSuccess: () => {
      // Optionally invalidate session to refetch updated statuses
      utils.communications.campaigns.getSession.invalidate();
    },
  });

  const updateCampaign = trpc.communications.campaigns.updateCampaign.useMutation({
    onSuccess: async (data, variables) => {
      // Invalidate campaigns list
      await utils.communications.campaigns.listCampaigns.invalidate();

      // If we have a campaign ID, invalidate that specific session
      const sessionId = data?.campaign?.id || variables.campaignId;
      if (sessionId) {
        await utils.communications.campaigns.getSession.invalidate({ sessionId });
        // Also invalidate email schedule to refresh the status
        await utils.communications.campaigns.getEmailSchedule.invalidate({ sessionId });
      }
    },
  });

  // Delete campaign mutation hook
  const deleteCampaign = trpc.communications.campaigns.deleteCampaign.useMutation({
    onSuccess: () => {
      utils.communications.campaigns.listCampaigns.invalidate();
    },
  });

  // Smart email generation mutation hook
  const smartEmailGeneration = trpc.communications.campaigns.smartEmailGeneration.useMutation({
    onSuccess: () => {
      // Invalidate campaign sessions since emails are generated/regenerated
      utils.communications.campaigns.listCampaigns.invalidate();
      utils.communications.campaigns.getSession.invalidate();
    },
  });

  // Save draft mutation hook
  const saveDraft = trpc.communications.campaigns.saveDraft.useMutation({
    onSuccess: (data) => {
      // Invalidate campaigns list to show the new draft
      utils.communications.campaigns.listCampaigns.invalidate();
      if (data.sessionId) {
        utils.communications.campaigns.getSession.invalidate({ sessionId: data.sessionId });
      }
    },
  });

  // Save generated email mutation hook
  const saveGeneratedEmail = trpc.communications.campaigns.saveGeneratedEmail.useMutation({
    onSuccess: async (data, variables) => {
      // Only invalidate, no excessive refetching
      await utils.communications.campaigns.getSession.invalidate({
        sessionId: variables.sessionId,
      });
    },
  });

  // Retry campaign mutation hook
  const retryCampaign = trpc.communications.campaigns.retryCampaign.useMutation({
    onSuccess: (data, variables) => {
      // Invalidate campaigns list and session to refetch updated status
      utils.communications.campaigns.listCampaigns.invalidate();
      utils.communications.campaigns.getSession.invalidate({ sessionId: variables.campaignId });
    },
  });

  // Email scheduling mutation hooks
  const scheduleEmailSend = trpc.communications.campaigns.scheduleEmailSend.useMutation({
    onSuccess: (data, variables) => {
      utils.communications.campaigns.getEmailSchedule.invalidate({
        sessionId: variables.sessionId,
      });
      utils.communications.campaigns.getSession.invalidate({ sessionId: variables.sessionId });
    },
  });

  const pauseEmailSending = trpc.communications.campaigns.pauseEmailSending.useMutation({
    onSuccess: (data, variables) => {
      utils.communications.campaigns.getEmailSchedule.invalidate({
        sessionId: variables.sessionId,
      });
    },
  });

  const resumeEmailSending = trpc.communications.campaigns.resumeEmailSending.useMutation({
    onSuccess: (data, variables) => {
      utils.communications.campaigns.getEmailSchedule.invalidate({
        sessionId: variables.sessionId,
      });
    },
  });

  const cancelEmailSending = trpc.communications.campaigns.cancelEmailSending.useMutation({
    onSuccess: (data, variables) => {
      utils.communications.campaigns.getEmailSchedule.invalidate({
        sessionId: variables.sessionId,
      });
      utils.communications.campaigns.getSession.invalidate({ sessionId: variables.sessionId });
    },
  });

  const updateScheduleConfig = trpc.communications.campaigns.updateScheduleConfig.useMutation({
    onSuccess: () => {
      utils.communications.campaigns.getScheduleConfig.invalidate();
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
    getEmailSchedule,
    getScheduleConfig,

    // Mutation hooks
    createThread,
    addMessage,
    createSession,
    launchCampaign,
    saveToDraft,
    sendEmails,
    deleteCampaign,
    sendIndividualEmail,
    sendBulkEmails,
    updateEmail,
    updateEmailStatus,
    updateCampaign,
    smartEmailGeneration,
    saveDraft,
    saveGeneratedEmail,
    retryCampaign,
    scheduleEmailSend,
    pauseEmailSending,
    resumeEmailSending,
    cancelEmailSending,
    updateScheduleConfig,
  };
}
