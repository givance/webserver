import { toast } from "sonner";
import { handleEmailGeneration } from "../utils/emailOperations";
import { handleEmailResult } from "./emailResultHandler";
import { handleGenerateMoreEmails } from "../utils/emailOperations";

interface EmailGenerationState {
  setIsGenerating: (generating: boolean) => void;
  setIsGeneratingMore: (generating: boolean) => void;
  setIsRegenerating: (regenerating: boolean) => void;
  isGeneratingMore: boolean;
  isRegenerating: boolean;
  generateEmailsForDonors: any;
  saveEmailsToSession: any;
}

interface EmailState {
  setGeneratedEmails: (emails: any[]) => void;
  setAllGeneratedEmails: (emails: any[]) => void;
  setReferenceContexts: (contexts: Record<number, any>) => void;
  setEmailStatuses: (statuses: any) => void;
  setIsUpdatingStatus: (updating: boolean) => void;
  allGeneratedEmails: any[];
  referenceContexts: Record<number, any>;
  emailStatuses: Record<number, string>;
}

interface ChatState {
  setSuggestedMemories: (memories: any[]) => void;
  setChatMessages: (messages: any) => void;
  saveChatHistory: (messages: any[], instruction?: string) => void;
  chatMessages: any[];
}

interface PreviewDonors {
  previewDonorIds: number[];
  setPreviewDonorIds: (ids: number[]) => void;
}

interface InstructionInput {
  localInstructionRef: { current: string };
  clearInput: () => void;
}

interface BaseEmailOperationParams {
  organization: any;
  donorsData: any[];
  currentSignature?: string;
  sessionId?: number;
  previousInstruction?: string;
}

interface SubmitInstructionParams extends BaseEmailOperationParams {
  emailGeneration: EmailGenerationState;
  emailState: EmailState;
  chatState: ChatState;
  previewDonors: PreviewDonors;
  instructionInput: InstructionInput;
  onInstructionChange?: (instruction: string) => void;
}

interface GenerateMoreParams extends BaseEmailOperationParams {
  emailGeneration: EmailGenerationState;
  emailState: EmailState;
  chatState: ChatState;
  previewDonors: PreviewDonors;
  instructionInput: InstructionInput;
}

interface EmailStatusChangeParams {
  emailState: EmailState;
  sessionId?: number;
}

interface RegenerateEmailsParams {
  emailGeneration: EmailGenerationState;
  emailState: EmailState;
  chatState: ChatState;
  sessionId?: number;
}

export async function handleSubmitInstruction(
  params: SubmitInstructionParams,
  instructionToSubmit?: string
) {
  const {
    emailGeneration,
    emailState,
    chatState,
    previewDonors,
    instructionInput,
    organization,
    donorsData,
    currentSignature = "",
    sessionId,
    previousInstruction,
    onInstructionChange,
  } = params;

  const finalInstruction =
    instructionToSubmit || instructionInput.localInstructionRef.current;
  if (!finalInstruction.trim() || !organization) return;

  onInstructionChange?.(finalInstruction);
  emailGeneration.setIsGenerating(true);

  // Clear existing state
  emailState.setGeneratedEmails([]);
  emailState.setAllGeneratedEmails([]);
  emailState.setReferenceContexts({});
  chatState.setSuggestedMemories([]);

  try {
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
      await handleEmailResult(result, emailState, chatState, instructionInput);
    }
  } catch (error) {
    console.error("Error generating emails:", error);
    toast.error("Failed to generate emails. Please try again.");
  } finally {
    emailGeneration.setIsGenerating(false);
  }
}

export async function handleGenerateMore(params: GenerateMoreParams) {
  const {
    emailGeneration,
    emailState,
    chatState,
    previewDonors,
    instructionInput,
    organization,
    donorsData,
    currentSignature = "",
    sessionId,
    previousInstruction,
  } = params;

  if (emailGeneration.isGeneratingMore || !organization) return;

  emailGeneration.setIsGeneratingMore(true);
  try {
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
        const newMessages = [
          ...prev,
          { role: "assistant" as const, content: result.responseMessage },
        ];
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
}

export async function handleEmailStatusChange(
  params: EmailStatusChangeParams,
  emailId: number,
  status: "PENDING_APPROVAL" | "APPROVED",
  updateEmailStatus: any
) {
  const { emailState, sessionId } = params;

  const isPreviewMode = !emailState.allGeneratedEmails.some(
    (e: any) => e.id === emailId
  );

  if (isPreviewMode) {
    emailState.setEmailStatuses((prev: any) => ({
      ...prev,
      [emailId]: status,
    }));
    toast.success(
      status === "APPROVED" ? "Email approved" : "Email marked as pending"
    );
    return;
  }

  if (!sessionId) return;

  emailState.setIsUpdatingStatus(true);
  try {
    await updateEmailStatus.mutateAsync({ emailId, status });
    const email = emailState.allGeneratedEmails.find(
      (e: any) => e.id === emailId
    );
    if (email) {
      emailState.setEmailStatuses((prev: any) => ({
        ...prev,
        [email.donorId]: status,
      }));
    }
    toast.success(
      status === "APPROVED" ? "Email approved" : "Email marked as pending"
    );
  } catch (error) {
    console.error("Error updating email status:", error);
    toast.error("Failed to update email status");
  } finally {
    emailState.setIsUpdatingStatus(false);
  }
}

export async function handleRegenerateEmails(
  params: RegenerateEmailsParams,
  onlyUnapproved: boolean,
  regenerateAllEmails: any
) {
  const { emailGeneration, emailState, chatState, sessionId } = params;

  if (!sessionId || emailGeneration.isRegenerating) return;

  emailGeneration.setIsRegenerating(true);

  try {
    // Get the list of donor IDs to regenerate
    let donorIdsToRegenerate: number[] = [];

    if (onlyUnapproved) {
      // Only regenerate emails that are pending approval
      donorIdsToRegenerate = emailState.allGeneratedEmails
        .filter(
          (email: any) => emailState.emailStatuses[email.donorId] !== "APPROVED"
        )
        .map((email: any) => email.donorId);
    } else {
      // Regenerate all previously generated emails
      donorIdsToRegenerate = emailState.allGeneratedEmails.map(
        (email: any) => email.donorId
      );
    }

    if (donorIdsToRegenerate.length === 0) {
      toast.info("No emails to regenerate");
      return;
    }

    // Call the regenerate API
    const result = await regenerateAllEmails.mutateAsync({
      sessionId,
      chatHistory: chatState.chatMessages,
    });

    // Clear local state and wait for refetch
    if (!onlyUnapproved) {
      // If regenerating all, clear everything
      emailState.setGeneratedEmails([]);
      emailState.setAllGeneratedEmails([]);
      emailState.setReferenceContexts({});
      emailState.setEmailStatuses({});
    } else {
      // If only unapproved, keep approved emails in state
      const approvedEmails = emailState.allGeneratedEmails.filter(
        (email: any) => emailState.emailStatuses[email.donorId] === "APPROVED"
      );
      emailState.setGeneratedEmails(approvedEmails);
      emailState.setAllGeneratedEmails(approvedEmails);

      // Keep only approved email contexts and statuses
      const newContexts: Record<number, any> = {};
      const newStatuses: Record<number, string> = {};
      approvedEmails.forEach((email: any) => {
        if (emailState.referenceContexts[email.donorId]) {
          newContexts[email.donorId] =
            emailState.referenceContexts[email.donorId];
        }
        newStatuses[email.donorId] = "APPROVED";
      });
      emailState.setReferenceContexts(newContexts);
      emailState.setEmailStatuses(newStatuses);
    }

    toast.success(
      onlyUnapproved
        ? `Regenerating ${donorIdsToRegenerate.length} unapproved emails...`
        : `Regenerating all ${donorIdsToRegenerate.length} emails...`
    );

    // The UI will update when the session data is refetched
  } catch (error) {
    console.error("Error regenerating emails:", error);
    toast.error("Failed to regenerate emails. Please try again.");
  } finally {
    emailGeneration.setIsRegenerating(false);
  }
}
