import type { GeneratedEmail } from '../steps/write-instruction-step/types';
import { donors } from '@/app/lib/db/schema';
import { InferSelectModel } from 'drizzle-orm';

type Donor = InferSelectModel<typeof donors>;

// Campaign Slice Types
export interface CampaignSlice {
  // State
  campaignName: string;
  templateId: number | undefined;
  templatePrompt: string;
  currentStep: number;

  // Actions
  setCampaignName: (name: string) => void;
  setTemplate: (id: number | undefined, prompt: string) => void;
  setCurrentStep: (step: number) => void;
  resetCampaign: () => void;
}

// Donor Slice Types
export interface DonorSlice {
  // State
  selectedDonors: number[];
  donorData: Record<number, Donor>; // Cached donor data
  totalRemainingDonors: number;
  canGenerateMore: boolean;

  // Actions
  setSelectedDonors: (donors: number[]) => void;
  addDonor: (donorId: number) => void;
  removeDonor: (donorId: number) => void;
  cacheDonorData: (donors: Donor[]) => void;
  setTotalRemainingDonors: (count: number) => void;
  setCanGenerateMore: (canGenerate: boolean) => void;
  clearDonorData: () => void;
}

// Email Slice Types
export interface EmailSlice {
  // State
  generatedEmails: GeneratedEmail[];
  sampleEmails: GeneratedEmail[];
  selectedSampleIndex: number | null;
  emailStatuses: Record<number, 'PENDING_APPROVAL' | 'APPROVED'>;
  referenceContexts: Record<number, Record<string, string>>;
  refinedInstruction: string;
  allGeneratedEmails: GeneratedEmail[]; // Used to track all emails including previous batches

  // Computed properties
  approvedCount: number;
  pendingCount: number;

  // Actions
  setGeneratedEmails: (emails: GeneratedEmail[]) => void;
  setSampleEmails: (emails: GeneratedEmail[]) => void;
  setSelectedSample: (index: number | null) => void;
  updateEmailStatus: (donorId: number, status: 'PENDING_APPROVAL' | 'APPROVED') => void;
  setEmailStatuses: (
    statuses:
      | Record<number, 'PENDING_APPROVAL' | 'APPROVED'>
      | ((
          prev: Record<number, 'PENDING_APPROVAL' | 'APPROVED'>
        ) => Record<number, 'PENDING_APPROVAL' | 'APPROVED'>)
  ) => void;
  updateEmail: (donorId: number, updates: Partial<GeneratedEmail>) => void;
  setReferenceContexts: (contexts: Record<number, Record<string, string>>) => void;
  setRefinedInstruction: (instruction: string) => void;
  setAllGeneratedEmails: (emails: GeneratedEmail[]) => void;
  clearEmailData: () => void;
}

// Chat Slice Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date | string;
  stepType?: 'question' | 'confirmation' | 'generation' | 'complete';
}

export interface ChatSlice {
  // State
  chatMessages: ChatMessage[];
  instruction: string;
  suggestedMemories: string[];
  isAgenticFlow: boolean;
  agenticSessionId: string | null;

  // Actions
  addChatMessage: (message: ChatMessage) => void;
  setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  saveChatHistory: (messages: ChatMessage[], instruction?: string) => void;
  setInstruction: (instruction: string) => void;
  setSuggestedMemories: (memories: string[]) => void;
  setAgenticFlow: (isAgentic: boolean, sessionId?: string) => void;
  clearChatData: () => void;
}

// Session Slice Types
export interface SessionSlice {
  // State
  sessionId: number | undefined;
  isSessionLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;

  // Actions
  setSessionId: (id: number | undefined) => void;
  setSessionLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  updateLastSaved: () => void;
  clearSessionData: () => void;
}

// UI Slice Types
export interface UISlice {
  // State
  isGenerating: boolean;
  isGeneratingMore: boolean;
  isRegenerating: boolean;
  isScheduling: boolean;
  showScheduleConfig: boolean;
  showBulkGenerationDialog: boolean;
  showRegenerateDialog: boolean;
  isChatCollapsed: boolean;
  isEmailListExpanded: boolean;
  validationResult: any | null;
  error: string | null;
  streamingStatus: 'idle' | 'generating' | 'generated' | 'refining' | 'refined';
  isUpdatingStatus: boolean;
  isStartingBulkGeneration: boolean;
  regenerateOption: 'all' | 'unapproved';

  // Actions
  setGenerating: (generating: boolean) => void;
  setGeneratingMore: (generating: boolean) => void;
  setRegenerating: (regenerating: boolean) => void;
  setScheduling: (scheduling: boolean) => void;
  toggleScheduleConfig: () => void;
  setBulkGenerationDialog: (show: boolean) => void;
  setRegenerateDialog: (show: boolean) => void;
  toggleChat: () => void;
  toggleEmailList: () => void;
  setIsChatCollapsed: (collapsed: boolean) => void;
  setIsEmailListExpanded: (expanded: boolean) => void;
  setValidationResult: (result: any) => void;
  setError: (error: string | null) => void;
  setStreamingStatus: (
    status: 'idle' | 'generating' | 'generated' | 'refining' | 'refined'
  ) => void;
  setUpdatingStatus: (updating: boolean) => void;
  setStartingBulkGeneration: (starting: boolean) => void;
  setRegenerateOption: (option: 'all' | 'unapproved') => void;
  resetUIState: () => void;
}

// Combined Store Type
export type CampaignStore = CampaignSlice &
  DonorSlice &
  EmailSlice &
  ChatSlice &
  SessionSlice &
  UISlice;
