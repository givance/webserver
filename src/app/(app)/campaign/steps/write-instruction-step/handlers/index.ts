import { toast } from 'sonner';
import type { EmailGenerationResult, EmailOperationResult, GeneratedEmail } from '../types';
import { handleEmailGeneration, handleGenerateMoreEmails } from '../utils/emailOperations';
import { handleEmailResult } from './emailResultHandler';

interface EmailGenerationState {
  setIsGenerating: (generating: boolean) => void;
  setIsGeneratingMore: (generating: boolean) => void;
  setIsRegenerating: (regenerating: boolean) => void;
  isGeneratingMore: boolean;
  isRegenerating: boolean;
  smartEmailGeneration: (params: {
    sessionId: number;
    mode: 'generate_more' | 'regenerate_all' | 'generate_with_new_message';
    count?: number;
    newMessage?: string;
  }) => Promise<{ message: string; success: boolean; chatHistory: ConversationMessage[] }>;
  saveEmailsToSession: (emails: GeneratedEmail[], sessionId: number) => Promise<void>;
}

interface EmailState {
  setGeneratedEmails: (emails: GeneratedEmail[]) => void;
  setAllGeneratedEmails: (emails: GeneratedEmail[]) => void;
  setReferenceContexts: (contexts: Record<number, Record<string, string>>) => void;
  setEmailStatuses: (
    statuses:
      | Record<number, 'PENDING_APPROVAL' | 'APPROVED'>
      | ((
          prev: Record<number, 'PENDING_APPROVAL' | 'APPROVED'>
        ) => Record<number, 'PENDING_APPROVAL' | 'APPROVED'>)
  ) => void;
  setIsUpdatingStatus: (updating: boolean) => void;
  allGeneratedEmails: GeneratedEmail[];
  referenceContexts: Record<number, Record<string, string>>;
  emailStatuses: Record<number, 'PENDING_APPROVAL' | 'APPROVED'>;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  setSuggestedMemories: (memories: string[]) => void;
  setChatMessages: (
    messages: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])
  ) => void;
  saveChatHistory: (messages: ConversationMessage[], instruction?: string) => void;
  chatMessages: ConversationMessage[];
}

interface InstructionInput {
  localInstructionRef: { current: string };
  clearInput: () => void;
}

interface BaseEmailOperationParams {
  organization: { name: string; writingInstructions?: string | null } | undefined;
  donorsData: Array<{
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  currentSignature?: string;
  sessionId?: number;
  previousInstruction?: string;
}

interface SubmitInstructionParams extends BaseEmailOperationParams {
  emailGeneration: EmailGenerationState;
  emailState: EmailState;
  chatState: ChatState;
  instructionInput: InstructionInput;
  onInstructionChange?: (instruction: string) => void;
  smartEmailGenerationStream?: (
    input: {
      sessionId: number;
      mode: 'generate_more' | 'regenerate_all' | 'generate_with_new_message';
      count?: number;
      newMessage?: string;
    },
    onChunk: (chunk: {
      status: 'generating' | 'generated' | 'refining' | 'refined';
      message?: string;
      result?: any;
    }) => void
  ) => Promise<any>;
  onStreamUpdate?: (update: {
    status: 'generating' | 'generated' | 'refining' | 'refined';
    message?: string;
    result?: any;
  }) => void;
}

interface GenerateMoreParams extends BaseEmailOperationParams {
  emailGeneration: EmailGenerationState;
  emailState: EmailState;
  chatState: ChatState;
  instructionInput: InstructionInput;
  selectedDonors: number[];
}

interface EmailStatusChangeParams {
  emailState: EmailState;
  sessionId?: number;
}

interface UpdateEmailStatusMutation {
  (params: { emailId: number; status: 'PENDING_APPROVAL' | 'APPROVED' }): Promise<{
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

interface RegenerateEmailsParams {
  emailGeneration: EmailGenerationState;
  emailState: EmailState;
  chatState: ChatState;
  sessionId?: number;
}

export async function handleSubmitInstruction(
  params: SubmitInstructionParams,
  instructionToSubmit?: string
): Promise<{
  success: boolean;
  result?: EmailOperationResult;
  error?: string;
}> {
  const {
    emailGeneration,
    emailState,
    chatState,
    instructionInput,
    organization,
    donorsData,
    currentSignature = '',
    sessionId,
    previousInstruction,
    onInstructionChange,
    smartEmailGenerationStream,
    onStreamUpdate,
  } = params;

  const finalInstruction = instructionToSubmit || instructionInput.localInstructionRef.current;

  if (!finalInstruction.trim() || !organization) {
    return { success: false, error: 'Missing instruction or organization' };
  }

  // Don't update parent instruction state here - it was already cleared before calling this handler
  // onInstructionChange?.(finalInstruction);

  try {
    const result = await handleEmailGeneration({
      finalInstruction,
      organization,
      donorsData,
      chatMessages: chatState.chatMessages,
      previousInstruction,
      currentSignature,
      smartEmailGeneration: emailGeneration.smartEmailGeneration,
      smartEmailGenerationStream,
      onStreamUpdate,
      sessionId,
      saveEmailsToSession: emailGeneration.saveEmailsToSession,
    });

    if (result) {
      return { success: true, result };
    }

    return {
      success: false,
      error: 'No result returned from email generation',
    };
  } catch (error) {
    console.error('Error generating emails:', error);
    return {
      success: false,
      error: 'Failed to generate emails. Please try again.',
    };
  }
}

export async function handleGenerateMore(params: GenerateMoreParams): Promise<{
  success: boolean;
  result?: { emails: GeneratedEmail[] };
  error?: string;
}> {
  const {
    emailGeneration,
    emailState,
    chatState,
    instructionInput,
    organization,
    donorsData,
    currentSignature = '',
    sessionId,
    previousInstruction,
    selectedDonors,
  } = params;

  if (emailGeneration.isGeneratingMore || !organization) {
    return {
      success: false,
      error: 'Already generating or missing organization',
    };
  }

  try {
    const result = await handleGenerateMoreEmails({
      organization,
      previousInstruction,
      localInstructionRef: instructionInput.localInstructionRef,
      allGeneratedEmails: emailState.allGeneratedEmails,
      selectedDonors: selectedDonors || [],
      donorsData,
      chatMessages: chatState.chatMessages,
      currentSignature,
      smartEmailGeneration: emailGeneration.smartEmailGeneration,
      sessionId,
      saveEmailsToSession: emailGeneration.saveEmailsToSession,
    });

    if (result) {
      return { success: true, result };
    }

    return {
      success: false,
      error: 'No result returned from email generation',
    };
  } catch (error) {
    console.error('Error generating more emails:', error);
    return {
      success: false,
      error: 'Failed to generate more emails. Please try again.',
    };
  }
}

export async function handleEmailStatusChange(
  params: EmailStatusChangeParams,
  emailId: number,
  status: 'PENDING_APPROVAL' | 'APPROVED',
  updateEmailStatus: UpdateEmailStatusMutation
): Promise<{
  success: boolean;
  isPreviewMode: boolean;
  donorId?: number;
  error?: string;
}> {
  const { emailState, sessionId } = params;

  const isPreviewMode = !emailState.allGeneratedEmails.some(
    (email) => (email as GeneratedEmail & { id: number }).id === emailId
  );

  if (isPreviewMode) {
    return { success: true, isPreviewMode: true, donorId: emailId };
  }

  if (!sessionId) {
    return {
      success: false,
      isPreviewMode: false,
      error: 'Missing session ID',
    };
  }

  try {
    await updateEmailStatus({ emailId, status });
    const email = emailState.allGeneratedEmails.find(
      (email) => (email as GeneratedEmail & { id: number }).id === emailId
    ) as (GeneratedEmail & { id: number }) | undefined;

    if (email) {
      return { success: true, isPreviewMode: false, donorId: email.donorId };
    }

    return { success: false, isPreviewMode: false, error: 'Email not found' };
  } catch (error) {
    console.error('Error updating email status:', error);
    return {
      success: false,
      isPreviewMode: false,
      error: 'Failed to update email status',
    };
  }
}

export async function handleRegenerateEmails(
  params: RegenerateEmailsParams,
  onlyUnapproved: boolean
): Promise<{
  success: boolean;
  donorIdsToRegenerate: number[];
  onlyUnapproved: boolean;
  error?: string;
}> {
  const { emailGeneration, emailState, chatState, sessionId } = params;

  if (!sessionId || emailGeneration.isRegenerating) {
    return {
      success: false,
      donorIdsToRegenerate: [],
      onlyUnapproved,
      error: 'Missing session ID or already regenerating',
    };
  }

  // Get the list of donor IDs to regenerate
  let donorIdsToRegenerate: number[] = [];

  if (onlyUnapproved) {
    // Only regenerate emails that are pending approval
    donorIdsToRegenerate = emailState.allGeneratedEmails
      .filter((email) => emailState.emailStatuses[email.donorId] !== 'APPROVED')
      .map((email) => email.donorId);
  } else {
    // Regenerate all previously generated emails
    donorIdsToRegenerate = emailState.allGeneratedEmails.map((email) => email.donorId);
  }

  if (donorIdsToRegenerate.length === 0) {
    return {
      success: false,
      donorIdsToRegenerate: [],
      onlyUnapproved,
      error: 'No emails to regenerate',
    };
  }

  try {
    // Use the unified smartEmailGeneration API with regenerate_all mode
    await emailGeneration.smartEmailGeneration({
      sessionId,
      mode: 'regenerate_all',
    });

    return {
      success: true,
      donorIdsToRegenerate,
      onlyUnapproved,
    };
  } catch (error) {
    console.error('Error regenerating emails:', error);
    return {
      success: false,
      donorIdsToRegenerate,
      onlyUnapproved,
      error: 'Failed to regenerate emails. Please try again.',
    };
  }
}
