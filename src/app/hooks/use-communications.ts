"use client";

import type { AppRouter } from "@/app/api/trpc/routers/_app";
import type { CommunicationChannel, CommunicationThreadWithDetails } from "@/app/lib/data/communications";
import { trpc } from "@/app/lib/trpc/client";
import type { inferProcedureInput, inferProcedureOutput } from "@trpc/server";

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
  const generateEmails = trpc.communications.campaigns.generateEmails.useMutation();

  const createSession = trpc.communications.campaigns.createSession.useMutation({
    onSuccess: () => {
      // Optionally invalidate any session-related queries
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
    onSuccess: (data) => {
      // Invalidate all sessions to ensure the updated email is reflected
      utils.communications.campaigns.getSession.invalidate();
    },
  });

  const updateEmailStatus = trpc.communications.campaigns.updateEmailStatus.useMutation({
    onSuccess: () => {
      // Optionally invalidate session to refetch updated statuses
      utils.communications.campaigns.getSession.invalidate();
    },
  });

  const updateCampaign = trpc.communications.campaigns.updateCampaign.useMutation({
    onSuccess: () => {
      utils.communications.campaigns.listCampaigns.invalidate();
      utils.communications.campaigns.getSession.invalidate();
    },
  });

  const enhanceEmail = trpc.communications.campaigns.enhanceEmail.useMutation({
    onSuccess: async (data, variables) => {
      console.log("[enhanceEmail onSuccess] Called with data:", data);
      console.log("[enhanceEmail onSuccess] Variables:", variables);

      // Invalidate and refetch the session query to get updated emails immediately
      if (data?.sessionId) {
        console.log("[enhanceEmail onSuccess] Invalidating and refetching session:", data.sessionId);

        try {
          // First invalidate to mark as stale
          await utils.communications.campaigns.getSession.invalidate({ sessionId: data.sessionId });

          // Then explicitly refetch
          await utils.communications.campaigns.getSession.refetch({ sessionId: data.sessionId });

          // Also invalidate without parameters to catch any cached versions
          await utils.communications.campaigns.getSession.invalidate();
          await utils.communications.campaigns.getSession.refetch();

          console.log("[enhanceEmail onSuccess] Successfully invalidated and refetched");
        } catch (error) {
          console.error("[enhanceEmail onSuccess] Error during invalidation/refetch:", error);
        }
      } else {
        console.warn("[enhanceEmail onSuccess] No sessionId in response data");
      }
    },
    onError: (error) => {
      console.error("[enhanceEmail onError] Mutation failed:", error);
    },
  });

  // Delete campaign mutation hook
  const deleteCampaign = trpc.communications.campaigns.deleteCampaign.useMutation({
    onSuccess: () => {
      utils.communications.campaigns.listCampaigns.invalidate();
    },
  });

  // Regenerate all emails mutation hook
  const regenerateAllEmails = trpc.communications.campaigns.regenerateAllEmails.useMutation({
    onSuccess: (data) => {
      // Invalidate the session query to refetch updated status
      if (data.sessionId) {
        utils.communications.campaigns.getSession.invalidate({ sessionId: data.sessionId });
        utils.communications.campaigns.listCampaigns.invalidate();
      }
    },
  });

  // Save draft mutation hook
  const saveDraft = trpc.communications.campaigns.saveDraft.useMutation({
    onMutate: (variables) => {
      console.log("[useCommunications] saveDraft.onMutate called with:", variables);
    },
    onSuccess: (data, variables) => {
      console.log("[useCommunications] saveDraft.onSuccess called with:", { data, variables });
      // Invalidate campaigns list to show the new draft
      utils.communications.campaigns.listCampaigns.invalidate();
      if (data.sessionId) {
        utils.communications.campaigns.getSession.invalidate({ sessionId: data.sessionId });
      }
    },
    onError: (error, variables) => {
      console.error("[useCommunications] saveDraft.onError called with:", { error, variables });
    },
  });

  // Save generated email mutation hook
  const saveGeneratedEmail = trpc.communications.campaigns.saveGeneratedEmail.useMutation({
    onSuccess: (data, variables) => {
      // Invalidate the session to refetch with new email
      utils.communications.campaigns.getSession.invalidate({ sessionId: variables.sessionId });
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
      utils.communications.campaigns.getEmailSchedule.invalidate({ sessionId: variables.sessionId });
      utils.communications.campaigns.getSession.invalidate({ sessionId: variables.sessionId });
    },
  });

  const pauseEmailSending = trpc.communications.campaigns.pauseEmailSending.useMutation({
    onSuccess: (data, variables) => {
      utils.communications.campaigns.getEmailSchedule.invalidate({ sessionId: variables.sessionId });
    },
  });

  const resumeEmailSending = trpc.communications.campaigns.resumeEmailSending.useMutation({
    onSuccess: (data, variables) => {
      utils.communications.campaigns.getEmailSchedule.invalidate({ sessionId: variables.sessionId });
    },
  });

  const cancelEmailSending = trpc.communications.campaigns.cancelEmailSending.useMutation({
    onSuccess: (data, variables) => {
      utils.communications.campaigns.getEmailSchedule.invalidate({ sessionId: variables.sessionId });
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
    generateEmails,
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
    enhanceEmail,
    regenerateAllEmails,
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
