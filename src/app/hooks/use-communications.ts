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
type ListJobsInput = inferProcedureInput<AppRouter["communications"]["listJobs"]>;
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
  const listJobs = trpc.communications.listJobs.useQuery;
  const getEmailStatus = trpc.communications.getEmailStatus.useQuery;

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

  const createSessionMutation = trpc.communications.createSession.useMutation({
    onSuccess: () => {
      // Optionally invalidate any session-related queries
    },
  });

  // Gmail mutation hooks
  const saveToDraftMutation = trpc.gmail.saveToDraft.useMutation();
  const sendEmailsMutation = trpc.gmail.sendEmails.useMutation();
  const sendIndividualEmailMutation = trpc.gmail.sendIndividualEmail.useMutation();
  const sendBulkEmailsMutation = trpc.gmail.sendBulkEmails.useMutation();
  const updateEmailMutation = trpc.communications.updateEmail.useMutation();

  // Delete job mutation hook
  const deleteJobMutation = trpc.communications.deleteJob.useMutation({
    onSuccess: () => {
      utils.communications.listJobs.invalidate();
    },
  });

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

  /**
   * Create a new email generation session and trigger bulk generation
   * @param input The session data to create
   * @returns The session ID or null if creation failed
   */
  const createSession = async (input: CreateSessionInput) => {
    try {
      return await createSessionMutation.mutateAsync(input);
    } catch (error) {
      console.error("Failed to create email generation session:", error);
      return null;
    }
  };

  /**
   * Save job emails as drafts in Gmail
   * @param sessionId The session ID containing the emails to save as drafts
   * @returns Success result or null if saving failed
   */
  const saveToDraft = async (sessionId: number) => {
    try {
      return await saveToDraftMutation.mutateAsync({ sessionId });
    } catch (error) {
      console.error("Failed to save emails as drafts:", error);
      return null;
    }
  };

  /**
   * Send job emails via Gmail
   * @param sessionId The session ID containing the emails to send
   * @returns Success result or null if sending failed
   */
  const sendEmails = async (sessionId: number) => {
    try {
      return await sendEmailsMutation.mutateAsync({ sessionId });
    } catch (error) {
      console.error("Failed to send emails:", error);
      return null;
    }
  };

  /**
   * Delete a communication job and its associated emails
   * @param jobId The job ID to delete
   * @returns Success result or null if deletion failed
   */
  const deleteJob = async (jobId: number) => {
    try {
      return await deleteJobMutation.mutateAsync({ jobId });
    } catch (error) {
      console.error("Failed to delete communication job:", error);
      return null;
    }
  };

  /**
   * Send an individual email
   * @param emailId The email ID to send
   * @returns Success result or null if sending failed
   */
  const sendIndividualEmail = async (emailId: number) => {
    try {
      const result = await sendIndividualEmailMutation.mutateAsync({ emailId });
      // Invalidate email status query to refresh the UI
      utils.communications.getEmailStatus.invalidate({ emailId });
      return result;
    } catch (error) {
      console.error("Failed to send individual email:", error);
      return null;
    }
  };

  /**
   * Send bulk emails with options (all or unsent only)
   * @param sessionId The session ID containing the emails to send
   * @param sendType Whether to send all emails or only unsent ones
   * @returns Success result or null if sending failed
   */
  const sendBulkEmails = async (sessionId: number, sendType: "all" | "unsent") => {
    try {
      const result = await sendBulkEmailsMutation.mutateAsync({ sessionId, sendType });
      // Invalidate session query to refresh email counts
      utils.communications.getSession.invalidate({ sessionId });
      return result;
    } catch (error) {
      console.error("Failed to send bulk emails:", error);
      return null;
    }
  };

  /**
   * Update email content and subject
   * @param emailId The email ID to update
   * @param subject The new subject line
   * @param structuredContent The new email content
   * @param referenceContexts The reference contexts
   * @returns Success result or null if update failed
   */
  const updateEmail = async (
    emailId: number,
    subject: string,
    structuredContent: Array<{
      piece: string;
      references: string[];
      addNewlineAfter: boolean;
    }>,
    referenceContexts: Record<string, string>
  ) => {
    try {
      const result = await updateEmailMutation.mutateAsync({
        emailId,
        subject,
        structuredContent,
        referenceContexts,
      });
      // Invalidate all related queries to refresh the UI
      await utils.communications.getSession.invalidate();
      await utils.communications.getEmailStatus.invalidate({ emailId });
      await utils.communications.listJobs.invalidate();
      return result;
    } catch (error) {
      console.error("Failed to update email:", error);
      return null;
    }
  };

  return {
    // Query functions
    listThreads,
    getThread,
    getMessages,
    getSession,
    getSessionStatus,
    listJobs,
    getEmailStatus,

    // Mutation functions
    createThread,
    addMessage,
    generateEmails,
    createSession,
    saveToDraft,
    sendEmails,
    deleteJob,
    sendIndividualEmail,
    sendBulkEmails,
    updateEmail,

    // Loading states
    isCreatingThread: createThreadMutation.isPending,
    isAddingMessage: addMessageMutation.isPending,
    isGeneratingEmails: generateEmailsMutation.isPending,
    isCreatingSession: createSessionMutation.isPending,
    isSavingToDraft: saveToDraftMutation.isPending,
    isSendingEmails: sendEmailsMutation.isPending,
    isDeletingJob: deleteJobMutation.isPending,
    isSendingIndividualEmail: sendIndividualEmailMutation.isPending,
    isSendingBulkEmails: sendBulkEmailsMutation.isPending,
    isUpdatingEmail: updateEmailMutation.isPending,

    // Mutation results
    createThreadResult: createThreadMutation.data,
    addMessageResult: addMessageMutation.data,
    generateEmailsResult: generateEmailsMutation.data,
    createSessionResult: createSessionMutation.data,
    saveToDraftResult: saveToDraftMutation.data,
    sendEmailsResult: sendEmailsMutation.data,
    deleteJobResult: deleteJobMutation.data,
    sendIndividualEmailResult: sendIndividualEmailMutation.data,
    sendBulkEmailsResult: sendBulkEmailsMutation.data,
  };
}
