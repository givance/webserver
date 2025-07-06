import { toast } from "sonner";
import { handleEmailGeneration } from "../utils/emailOperations";
import { handleEmailResult } from "./emailResultHandler";
import { handleGenerateMoreEmails } from "../utils/emailOperations";
import type { Organization, TokenUsage } from "@/app/lib/utils/email-generator/types";
import type { InferSelectModel } from "drizzle-orm";
import type { Donor } from "@/app/lib/data/donors";
import type { EmailGenerationResult, GeneratedEmail } from "../types";

interface EmailGenerationState {
  setIsGenerating: (generating: boolean) => void;
  setIsGeneratingMore: (generating: boolean) => void;
  setIsRegenerating: (regenerating: boolean) => void;
  isGeneratingMore: boolean;
  isRegenerating: boolean;
  generateEmailsForDonors: (params: {
    instruction: string;
    donors: Array<{ id: number; firstName: string; lastName: string; email: string }>;
    organizationName: string;
    organizationWritingInstructions?: string;
    previousInstruction?: string;
    currentDate?: string;
    chatHistory?: ConversationMessage[];
    signature?: string;
  }) => Promise<EmailGenerationResult | null>;
  saveEmailsToSession: (emails: GeneratedEmail[], sessionId: number) => Promise<void>;
}

interface EmailState {
  setGeneratedEmails: (emails: GeneratedEmail[]) => void;
  setAllGeneratedEmails: (emails: GeneratedEmail[]) => void;
  setReferenceContexts: (contexts: Record<number, Record<string, string>>) => void;
  setEmailStatuses: (statuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> | ((prev: Record<number, "PENDING_APPROVAL" | "APPROVED">) => Record<number, "PENDING_APPROVAL" | "APPROVED">)) => void;
  setIsUpdatingStatus: (updating: boolean) => void;
  allGeneratedEmails: GeneratedEmail[];
  referenceContexts: Record<number, Record<string, string>>;
  emailStatuses: Record<number, "PENDING_APPROVAL" | "APPROVED">;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatState {
  setSuggestedMemories: (memories: string[]) => void;
  setChatMessages: (messages: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])) => void;
  saveChatHistory: (messages: ConversationMessage[], instruction?: string) => void;
  chatMessages: ConversationMessage[];
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
  organization: { name: string; writingInstructions?: string | null } | undefined;
  donorsData: Array<{ id: number; firstName: string; lastName: string; email: string }>;
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
  selectedDonors: number[];
}

interface EmailStatusChangeParams {
  emailState: EmailState;
  sessionId?: number;
}

interface UpdateEmailStatusMutation {
  mutateAsync: (params: { emailId: number; status: "PENDING_APPROVAL" | "APPROVED" }) => Promise<{ 
    email: { 
      status: string; 
      id: number; 
      createdAt: string; 
      updatedAt: string; 
      donorId: number; 
      subject: string; 
      sessionId: number; 
      emailContent: string | null; 
      reasoning: string | null; 
      response: string | null; 
    }; 
    message: string; 
    success: boolean; 
  }>;
}

interface RegenerateEmailsMutation {
  mutateAsync: (params: { sessionId: number; chatHistory: ConversationMessage[] }) => Promise<{ 
    message: string; 
    success: boolean; 
  }>;
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
    selectedDonors,
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
      selectedDonors: selectedDonors || [],
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
      result.emails.forEach((email) => {
        newReferenceContexts[email.donorId] = email.referenceContexts || {};
        newStatuses[email.donorId] = "PENDING_APPROVAL";
      });
      emailState.setReferenceContexts(newReferenceContexts);
      emailState.setEmailStatuses(newStatuses);

      chatState.setChatMessages((prev) => {
        const newMessages: ConversationMessage[] = [
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
  updateEmailStatus: UpdateEmailStatusMutation
) {
  const { emailState, sessionId } = params;

  const isPreviewMode = !emailState.allGeneratedEmails.some(
    (email) => (email as GeneratedEmail & { id: number }).id === emailId
  );

  if (isPreviewMode) {
    emailState.setEmailStatuses((prev) => ({
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
      (email) => (email as GeneratedEmail & { id: number }).id === emailId
    ) as (GeneratedEmail & { id: number }) | undefined;
    if (email) {
      emailState.setEmailStatuses((prev) => ({
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
  regenerateAllEmails: RegenerateEmailsMutation
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
          (email) => emailState.emailStatuses[email.donorId] !== "APPROVED"
        )
        .map((email) => email.donorId);
    } else {
      // Regenerate all previously generated emails
      donorIdsToRegenerate = emailState.allGeneratedEmails.map(
        (email) => email.donorId
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
        (email) => emailState.emailStatuses[email.donorId] === "APPROVED"
      );
      emailState.setGeneratedEmails(approvedEmails);
      emailState.setAllGeneratedEmails(approvedEmails);

      // Keep only approved email contexts and statuses
      const newContexts: Record<number, Record<string, string>> = {};
      const newStatuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> = {};
      approvedEmails.forEach((email) => {
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
