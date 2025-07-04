import { toast } from "sonner";

export function createEmailGenerationHandlers(
  emailGeneration: any,
  emailState: any,
  chatState: any,
  previewDonors: any,
  instructionInput: any,
  donorsData: any[],
  organization: any,
  previousInstruction?: string,
  currentSignature = "",
  sessionId?: number,
  onInstructionChange?: (instruction: string) => void
) {
  const handleSubmitInstruction = async (instructionToSubmit?: string) => {
    const finalInstruction = instructionToSubmit || instructionInput.localInstructionRef.current;
    if (!finalInstruction.trim() || !organization) return;

    onInstructionChange?.(finalInstruction);
    emailGeneration.setIsGenerating(true);
    
    // Clear existing state
    emailState.setGeneratedEmails([]);
    emailState.setAllGeneratedEmails([]);
    emailState.setReferenceContexts({});
    chatState.setSuggestedMemories([]);

    try {
      const { handleEmailGeneration } = await import("../utils/emailOperations");
      const result = await handleEmailGeneration({
        finalInstruction,
        organization,
        previewDonorIds: previewDonors.previewDonorIds,
        donorsData,
        chatMessages: chatState.chatMessages,
        previousInstruction,
        currentSignature,
        generateEmailsForDonors: emailGeneration.generateEmailsForDonors,
        sessionId,
        saveEmailsToSession: emailGeneration.saveEmailsToSession,
      });

      if (result) {
        const { handleEmailResult } = await import("./emailResultHandler");
        await handleEmailResult(result, emailState, chatState, instructionInput);
      }
    } catch (error) {
      console.error("Error generating emails:", error);
      toast.error("Failed to generate emails. Please try again.");
    } finally {
      emailGeneration.setIsGenerating(false);
    }
  };

  const handleGenerateMore = async () => {
    if (emailGeneration.isGeneratingMore || !organization) return;

    emailGeneration.setIsGeneratingMore(true);
    try {
      const { handleGenerateMoreEmails } = await import("../utils/emailOperations");
      const result = await handleGenerateMoreEmails({
        organization,
        previousInstruction,
        localInstructionRef: instructionInput.localInstructionRef,
        allGeneratedEmails: emailState.allGeneratedEmails,
        previewDonorIds: previewDonors.previewDonorIds,
        selectedDonors: [],
        setPreviewDonorIds: previewDonors.setPreviewDonorIds,
        donorsData,
        chatMessages: chatState.chatMessages,
        currentSignature,
        generateEmailsForDonors: emailGeneration.generateEmailsForDonors,
        sessionId,
        saveEmailsToSession: emailGeneration.saveEmailsToSession,
      });

      if (result) {
        const newEmails = [...emailState.allGeneratedEmails, ...result.emails];
        emailState.setAllGeneratedEmails(newEmails);
        emailState.setGeneratedEmails(newEmails);

        const newReferenceContexts = { ...emailState.referenceContexts };
        const newStatuses = { ...emailState.emailStatuses };
        result.emails.forEach((email: any) => {
          newReferenceContexts[email.donorId] = email.referenceContexts || {};
          newStatuses[email.donorId] = "PENDING_APPROVAL";
        });
        emailState.setReferenceContexts(newReferenceContexts);
        emailState.setEmailStatuses(newStatuses);

        chatState.setChatMessages((prev: any) => {
          const newMessages = [...prev, { role: "assistant" as const, content: result.responseMessage }];
          setTimeout(() => chatState.saveChatHistory(newMessages), 100);
          return newMessages;
        });
      }
    } catch (error) {
      console.error("Error generating more emails:", error);
      toast.error("Failed to generate more emails. Please try again.");
    } finally {
      emailGeneration.setIsGeneratingMore(false);
    }
  };

  const handleEmailStatusChange = async (
    emailId: number, 
    status: "PENDING_APPROVAL" | "APPROVED",
    updateEmailStatus: any
  ) => {
    const isPreviewMode = !emailState.allGeneratedEmails.some((e: any) => e.id === emailId);

    if (isPreviewMode) {
      emailState.setEmailStatuses((prev: any) => ({ ...prev, [emailId]: status }));
      toast.success(status === "APPROVED" ? "Email approved" : "Email marked as pending");
      return;
    }

    if (!sessionId) return;

    emailState.setIsUpdatingStatus(true);
    try {
      await updateEmailStatus.mutateAsync({ emailId, status });
      const email = emailState.allGeneratedEmails.find((e: any) => e.id === emailId);
      if (email) {
        emailState.setEmailStatuses((prev: any) => ({ ...prev, [email.donorId]: status }));
      }
      toast.success(status === "APPROVED" ? "Email approved" : "Email marked as pending");
    } catch (error) {
      console.error("Error updating email status:", error);
      toast.error("Failed to update email status");
    } finally {
      emailState.setIsUpdatingStatus(false);
    }
  };

  return {
    handleSubmitInstruction,
    handleGenerateMore,
    handleEmailStatusChange,
  };
}