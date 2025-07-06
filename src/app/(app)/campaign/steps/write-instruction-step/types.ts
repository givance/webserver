export interface WriteInstructionStepProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  onBack: () => void;
  onNext: () => void;
  selectedDonors: number[];
  onSessionDataChange?: (sessionData: {
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
    previewDonorIds: number[];
    generatedEmails?: GeneratedEmail[];
    referenceContexts?: Record<number, Record<string, string>>;
  }) => void;
  templatePrompt?: string; // Optional template prompt to pre-populate
  initialChatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  initialGeneratedEmails?: GeneratedEmail[];
  initialReferenceContexts?: Record<number, Record<string, string>>;
  initialPreviewDonorIds?: number[];
  initialRefinedInstruction?: string; // The refined instruction from previous generation
  campaignName: string;
  templateId?: number;
  onBulkGenerationComplete: (sessionId: number) => void;
  // Edit mode props
  editMode?: boolean;
  sessionId?: number;
  // Props for external button control
  onCanLaunchChange?: (canLaunch: boolean) => void;
  onLaunchHandlerChange?: (handler: (() => void) | null) => void;
}

export interface GeneratedEmail {
  id?: number; // ID from database after saving
  donorId: number;
  subject: string;
  // Legacy format fields (for backward compatibility - optional for new emails)
  structuredContent?: Array<{
    piece: string;
    references: string[];
    addNewlineAfter: boolean;
  }>;
  referenceContexts?: Record<string, string>;
  // New format fields (for new generation)
  emailContent?: string; // Plain text email content
  reasoning?: string; // AI's reasoning for the email generation
  response?: string; // User-facing summary of what was delivered
}

export interface ThreadMessage {
  id: number;
  content: string;
  datetime: Date;
  threadId: number;
}

export interface ReferenceContext {
  [key: string]: {
    content: string;
    type: "donation" | "communication" | "summary";
    datetime?: string;
  };
}

export interface GenerateEmailsResponse {
  emails: GeneratedEmail[];
  refinedInstruction: string;
  suggestedMemories?: string[];
}

export interface AgenticFlowResponse {
  isAgenticFlow: true;
  sessionId: string;
  needsUserInput: boolean;
  isComplete: boolean;
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date | string;
    stepType?: "question" | "confirmation" | "generation" | "complete";
  }>;
  canProceed?: boolean;
}

export type EmailGenerationResult = GenerateEmailsResponse | AgenticFlowResponse;

// Extended type for the wrapped email generation results returned by emailOperations utility functions
export interface EmailOperationResult {
  type: "agentic" | "traditional";
  result: EmailGenerationResult;
  updatedChatMessages: Array<{ role: "user" | "assistant"; content: string }>;
  responseMessage?: string;
}

export interface IsolatedInputProps {
  initialValue: string;
  placeholder: string;
  projectMentions: Array<{ id: string; display: string }>;
  onSubmit: (value: string) => void;
  onValueChange?: (value: string) => void; // Add callback for value changes
  isGenerating: boolean;
  onKeyDown?: (event: React.KeyboardEvent<any>) => void;
}