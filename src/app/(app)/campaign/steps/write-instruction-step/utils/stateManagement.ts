import type { GeneratedEmail } from '../types';

// Local interface for conversation messages
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * State management utilities for WriteInstructionStep component
 * These functions handle common state operations that were previously scattered across handlers
 */

// Email state interfaces
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
  allGeneratedEmails: GeneratedEmail[];
  referenceContexts: Record<number, Record<string, string>>;
  emailStatuses: Record<number, 'PENDING_APPROVAL' | 'APPROVED'>;
}

interface ChatState {
  setSuggestedMemories: (memories: string[]) => void;
  setChatMessages: (
    messages: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])
  ) => void;
  saveChatHistory: (messages: ConversationMessage[], instruction?: string) => void;
  chatMessages: ConversationMessage[];
}

interface EmailGenerationState {
  setIsGenerating: (generating: boolean) => void;
  setIsGeneratingMore: (generating: boolean) => void;
  setIsRegenerating: (regenerating: boolean) => void;
}

interface InstructionInput {
  clearInput: () => void;
}

/**
 * Clear all email-related state when starting a new generation
 */
export function clearEmailState(emailState: EmailState, chatState: ChatState) {
  emailState.setGeneratedEmails([]);
  emailState.setAllGeneratedEmails([]);
  emailState.setReferenceContexts({});
  chatState.setSuggestedMemories([]);
}

/**
 * Clear email state selectively for regeneration
 */
export function clearEmailStateForRegeneration(emailState: EmailState, onlyUnapproved: boolean) {
  if (!onlyUnapproved) {
    // Clear everything for full regeneration
    emailState.setGeneratedEmails([]);
    emailState.setAllGeneratedEmails([]);
    emailState.setReferenceContexts({});
    emailState.setEmailStatuses({});
  } else {
    // Keep only approved emails
    const approvedEmails = emailState.allGeneratedEmails.filter(
      (email) => emailState.emailStatuses[email.donorId] === 'APPROVED'
    );
    emailState.setGeneratedEmails(approvedEmails);
    emailState.setAllGeneratedEmails(approvedEmails);

    // Keep only approved email contexts and statuses
    const newContexts: Record<number, Record<string, string>> = {};
    const newStatuses: Record<number, 'PENDING_APPROVAL' | 'APPROVED'> = {};
    approvedEmails.forEach((email) => {
      if (emailState.referenceContexts[email.donorId]) {
        newContexts[email.donorId] = emailState.referenceContexts[email.donorId];
      }
      newStatuses[email.donorId] = 'APPROVED';
    });
    emailState.setReferenceContexts(newContexts);
    emailState.setEmailStatuses(newStatuses);
  }
}

/**
 * Update email state with new emails from generation
 */
export function updateEmailStateWithNewEmails(
  emailState: EmailState,
  newEmails: GeneratedEmail[],
  isAppending: boolean = false
) {
  if (isAppending) {
    // Create a map to track emails by donorId to avoid duplicates
    const emailMap = new Map<number, GeneratedEmail>();

    // Add existing emails to the map
    emailState.allGeneratedEmails.forEach((email) => {
      emailMap.set(email.donorId, email);
    });

    // Add new emails, overwriting any existing ones for the same donor
    newEmails.forEach((email) => {
      emailMap.set(email.donorId, email);
    });

    // Convert map back to array
    const allEmails = Array.from(emailMap.values());
    emailState.setAllGeneratedEmails(allEmails);
    emailState.setGeneratedEmails(allEmails);

    // Update reference contexts and statuses
    const newReferenceContexts = { ...emailState.referenceContexts };
    const newStatuses = { ...emailState.emailStatuses };

    newEmails.forEach((email) => {
      newReferenceContexts[email.donorId] = email.referenceContexts || {};
      newStatuses[email.donorId] = 'PENDING_APPROVAL';
    });

    emailState.setReferenceContexts(newReferenceContexts);
    emailState.setEmailStatuses(newStatuses);
  } else {
    // Replace existing emails
    emailState.setAllGeneratedEmails(newEmails);
    emailState.setGeneratedEmails(newEmails);

    // Set reference contexts and statuses
    const referenceContexts: Record<number, Record<string, string>> = {};
    const emailStatuses: Record<number, 'PENDING_APPROVAL' | 'APPROVED'> = {};

    newEmails.forEach((email) => {
      referenceContexts[email.donorId] = email.referenceContexts || {};
      emailStatuses[email.donorId] = 'PENDING_APPROVAL';
    });

    emailState.setReferenceContexts(referenceContexts);
    emailState.setEmailStatuses(emailStatuses);
  }
}

/**
 * Update chat state with new messages
 */
export function updateChatStateWithNewMessage(
  chatState: ChatState,
  responseMessage: string,
  instruction?: string
) {
  chatState.setChatMessages((prev) => {
    const newMessages: ConversationMessage[] = [
      ...prev,
      { role: 'assistant' as const, content: responseMessage },
    ];
    // Save chat history asynchronously
    setTimeout(() => chatState.saveChatHistory(newMessages, instruction), 100);
    return newMessages;
  });
}

/**
 * Set loading state for email generation
 */
export function setEmailGenerationLoading(
  emailGenerationState: EmailGenerationState,
  type: 'generating' | 'generating_more' | 'regenerating',
  isLoading: boolean
) {
  switch (type) {
    case 'generating':
      emailGenerationState.setIsGenerating(isLoading);
      break;
    case 'generating_more':
      emailGenerationState.setIsGeneratingMore(isLoading);
      break;
    case 'regenerating':
      emailGenerationState.setIsRegenerating(isLoading);
      break;
  }
}

/**
 * Clear instruction input after successful generation
 */
export function clearInstructionInput(instructionInput: InstructionInput) {
  instructionInput.clearInput();
}

/**
 * Update email status in state
 */
export function updateEmailStatus(
  emailState: EmailState,
  donorId: number,
  status: 'PENDING_APPROVAL' | 'APPROVED'
) {
  emailState.setEmailStatuses((prev) => ({
    ...prev,
    [donorId]: status,
  }));
}
