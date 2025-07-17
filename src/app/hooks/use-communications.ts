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
    onSuccess: (data, variables) => {
      // Invalidate campaign sessions since emails are generated/regenerated
      utils.communications.campaigns.listCampaigns.invalidate();

      // Invalidate the specific session that was updated
      if (variables.sessionId) {
        utils.communications.campaigns.getSession.invalidate({ sessionId: variables.sessionId });
      } else {
        // Fallback: invalidate all sessions if sessionId is not available
        utils.communications.campaigns.getSession.invalidate();
      }
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

  // Wrapped functions for mutations
  const createThreadHandler = async (
    input: inferProcedureInput<AppRouter['communications']['threads']['createThread']>
  ) => {
    try {
      return await createThread.mutateAsync(input);
    } catch (error) {
      console.error('Failed to create thread:', error);
      throw error;
    }
  };

  const addMessageHandler = async (
    input: inferProcedureInput<AppRouter['communications']['threads']['addMessage']>
  ) => {
    try {
      return await addMessage.mutateAsync(input);
    } catch (error) {
      console.error('Failed to add message:', error);
      throw error;
    }
  };

  const createSessionHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['createSession']>
  ) => {
    try {
      return await createSession.mutateAsync(input);
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  };

  const launchCampaignHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['launchCampaign']>
  ) => {
    try {
      return await launchCampaign.mutateAsync(input);
    } catch (error) {
      console.error('Failed to launch campaign:', error);
      throw error;
    }
  };

  const saveToDraftHandler = async (
    input: inferProcedureInput<AppRouter['gmail']['saveToDraft']>
  ) => {
    try {
      return await saveToDraft.mutateAsync(input);
    } catch (error) {
      console.error('Failed to save to draft:', error);
      throw error;
    }
  };

  const sendEmailsHandler = async (
    input: inferProcedureInput<AppRouter['gmail']['sendEmails']>
  ) => {
    try {
      return await sendEmails.mutateAsync(input);
    } catch (error) {
      console.error('Failed to send emails:', error);
      throw error;
    }
  };

  const deleteCampaignHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['deleteCampaign']>
  ) => {
    try {
      return await deleteCampaign.mutateAsync(input);
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      throw error;
    }
  };

  const sendIndividualEmailHandler = async (
    input: inferProcedureInput<AppRouter['gmail']['sendIndividualEmail']>
  ) => {
    try {
      return await sendIndividualEmail.mutateAsync(input);
    } catch (error) {
      console.error('Failed to send individual email:', error);
      throw error;
    }
  };

  const sendBulkEmailsHandler = async (
    input: inferProcedureInput<AppRouter['gmail']['sendBulkEmails']>
  ) => {
    try {
      return await sendBulkEmails.mutateAsync(input);
    } catch (error) {
      console.error('Failed to send bulk emails:', error);
      throw error;
    }
  };

  const updateEmailHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['updateEmail']>
  ) => {
    try {
      return await updateEmail.mutateAsync(input);
    } catch (error) {
      console.error('Failed to update email:', error);
      throw error;
    }
  };

  const updateEmailStatusHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['updateEmailStatus']>
  ) => {
    try {
      return await updateEmailStatus.mutateAsync(input);
    } catch (error) {
      console.error('Failed to update email status:', error);
      throw error;
    }
  };

  const updateCampaignHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['updateCampaign']>
  ) => {
    try {
      return await updateCampaign.mutateAsync(input);
    } catch (error) {
      console.error('Failed to update campaign:', error);
      throw error;
    }
  };

  const smartEmailGenerationHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['smartEmailGeneration']>
  ) => {
    try {
      return await smartEmailGeneration.mutateAsync(input);
    } catch (error) {
      console.error('Failed to generate smart email:', error);
      throw error;
    }
  };

  const smartEmailGenerationStreamHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['smartEmailGeneration']>,
    onChunk: (chunk: {
      status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
      message?: string;
      result?: any;
    }) => void
  ) => {
    try {
      // Since tRPC mutations don't support streaming directly, we'll need to
      // simulate it with multiple calls or use a different approach
      // For now, let's call the regular endpoint and simulate the streaming behavior

      // Step 1: Emit generating status
      onChunk({
        status: 'generating',
        message: 'Starting email generation...',
      });

      // Step 2: Call the actual generation
      const result = await smartEmailGeneration.mutateAsync(input);

      // Step 2: Emit generated status with result
      onChunk({
        status: 'generated',
        result,
      });

      // Step 3: Emit reviewing status after 0.5 seconds
      await new Promise((resolve) => setTimeout(resolve, 500));
      onChunk({
        status: 'reviewing',
        message: 'Reviewing generated emails...',
      });

      // Step 4: Emit refining status after 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));
      onChunk({
        status: 'refining',
        message: 'Refining generated emails based on reviewer feedback',
      });

      // Step 5: Emit refined status with result after 3 seconds
      await new Promise((resolve) => setTimeout(resolve, 3000));
      onChunk({
        status: 'refined',
        result,
      });

      return result;
    } catch (error) {
      console.error('Failed to generate smart email stream:', error);
      throw error;
    }
  };

  const saveDraftHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['saveDraft']>
  ) => {
    try {
      return await saveDraft.mutateAsync(input);
    } catch (error) {
      console.error('Failed to save draft:', error);
      throw error;
    }
  };

  const saveGeneratedEmailHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['saveGeneratedEmail']>
  ) => {
    try {
      return await saveGeneratedEmail.mutateAsync(input);
    } catch (error) {
      console.error('Failed to save generated email:', error);
      throw error;
    }
  };

  const retryCampaignHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['retryCampaign']>
  ) => {
    try {
      return await retryCampaign.mutateAsync(input);
    } catch (error) {
      console.error('Failed to retry campaign:', error);
      throw error;
    }
  };

  const scheduleEmailSendHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['scheduleEmailSend']>
  ) => {
    try {
      return await scheduleEmailSend.mutateAsync(input);
    } catch (error) {
      console.error('Failed to schedule email send:', error);
      throw error;
    }
  };

  const pauseEmailSendingHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['pauseEmailSending']>
  ) => {
    try {
      return await pauseEmailSending.mutateAsync(input);
    } catch (error) {
      console.error('Failed to pause email sending:', error);
      throw error;
    }
  };

  const resumeEmailSendingHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['resumeEmailSending']>
  ) => {
    try {
      return await resumeEmailSending.mutateAsync(input);
    } catch (error) {
      console.error('Failed to resume email sending:', error);
      throw error;
    }
  };

  const cancelEmailSendingHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['cancelEmailSending']>
  ) => {
    try {
      return await cancelEmailSending.mutateAsync(input);
    } catch (error) {
      console.error('Failed to cancel email sending:', error);
      throw error;
    }
  };

  const updateScheduleConfigHandler = async (
    input: inferProcedureInput<AppRouter['communications']['campaigns']['updateScheduleConfig']>
  ) => {
    try {
      return await updateScheduleConfig.mutateAsync(input);
    } catch (error) {
      console.error('Failed to update schedule config:', error);
      throw error;
    }
  };

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

    // Wrapped mutation functions
    createThread: createThreadHandler,
    addMessage: addMessageHandler,
    createSession: createSessionHandler,
    launchCampaign: launchCampaignHandler,
    saveToDraft: saveToDraftHandler,
    sendEmails: sendEmailsHandler,
    deleteCampaign: deleteCampaignHandler,
    sendIndividualEmail: sendIndividualEmailHandler,
    sendBulkEmails: sendBulkEmailsHandler,
    updateEmail: updateEmailHandler,
    updateEmailStatus: updateEmailStatusHandler,
    updateCampaign: updateCampaignHandler,
    smartEmailGeneration: smartEmailGenerationHandler,
    smartEmailGenerationStream: smartEmailGenerationStreamHandler,
    saveDraft: saveDraftHandler,
    saveGeneratedEmail: saveGeneratedEmailHandler,
    retryCampaign: retryCampaignHandler,
    scheduleEmailSend: scheduleEmailSendHandler,
    pauseEmailSending: pauseEmailSendingHandler,
    resumeEmailSending: resumeEmailSendingHandler,
    cancelEmailSending: cancelEmailSendingHandler,
    updateScheduleConfig: updateScheduleConfigHandler,

    // Loading states
    isLoadingCreateThread: createThread.isPending,
    isLoadingAddMessage: addMessage.isPending,
    isLoadingCreateSession: createSession.isPending,
    isLoadingLaunchCampaign: launchCampaign.isPending,
    isLoadingDeleteCampaign: deleteCampaign.isPending,
    isLoadingUpdateCampaign: updateCampaign.isPending,
    isLoadingSmartEmailGeneration: smartEmailGeneration.isPending,
    isLoadingSendBulkEmails: sendBulkEmails.isPending,
    isLoadingUpdateEmail: updateEmail.isPending,
    isLoadingSendIndividualEmail: sendIndividualEmail.isPending,
    isLoadingSaveToDraft: saveToDraft.isPending,
    isLoadingScheduleEmailSend: scheduleEmailSend.isPending,
    isLoadingRetryCampaign: retryCampaign.isPending,
  };
}
