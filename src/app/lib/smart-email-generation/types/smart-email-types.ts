import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { smartEmailSessions, smartEmailMessages } from '@/app/lib/db/schema';
import { z } from 'zod';

// Database model types
export type SmartEmailSession = InferSelectModel<typeof smartEmailSessions>;
export type NewSmartEmailSession = InferInsertModel<typeof smartEmailSessions>;
export type SmartEmailMessage = InferSelectModel<typeof smartEmailMessages>;
export type NewSmartEmailMessage = InferInsertModel<typeof smartEmailMessages>;

// Session status enum
export const SmartEmailSessionStatus = {
  ACTIVE: 'active' as const,
  COMPLETED: 'completed' as const,
  ABANDONED: 'abandoned' as const,
} as const;

export type SmartEmailSessionStatusType =
  (typeof SmartEmailSessionStatus)[keyof typeof SmartEmailSessionStatus];

// Session step enum
export const SmartEmailSessionStep = {
  ANALYZING: 'analyzing' as const,
  QUESTIONING: 'questioning' as const,
  REFINING: 'refining' as const,
  COMPLETE: 'complete' as const,
} as const;

export type SmartEmailSessionStepType =
  (typeof SmartEmailSessionStep)[keyof typeof SmartEmailSessionStep];

// Message roles
export const MessageRole = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  SYSTEM: 'system' as const,
} as const;

export type MessageRoleType = (typeof MessageRole)[keyof typeof MessageRole];

// Tool call types
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  result: any;
  error?: string;
}

// Session creation input
export interface CreateSmartEmailSessionInput {
  organizationId: string;
  userId: string;
  donorIds: number[];
  initialInstruction: string;
}

// Session update input
export interface UpdateSmartEmailSessionInput {
  sessionId: string;
  status?: SmartEmailSessionStatusType;
  currentStep?: SmartEmailSessionStepType;
  finalInstruction?: string;
  donorAnalysis?: any;
  orgAnalysis?: any;
}

// Message creation input
export interface CreateSmartEmailMessageInput {
  sessionId: number;
  messageIndex: number;
  role: MessageRoleType;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// Conversation context types
export interface ConversationContext {
  sessionId: string;
  donorIds: number[];
  organizationId: string;
  userId: string;
  messages: SmartEmailMessage[];
  currentStep: SmartEmailSessionStepType;
  donorAnalysis?: any;
  orgAnalysis?: any;
}

// Agent response types
export interface AgentResponse {
  content: string;
  toolCalls?: ToolCall[];
  nextStep?: SmartEmailSessionStepType;
  shouldContinue: boolean;
}

// Tool schemas
export const GetDonorInfoInputSchema = z.object({
  donorIds: z.array(z.number()),
});

export const GetOrganizationContextInputSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
});

export const SummarizeForGenerationInputSchema = z.object({
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  donorAnalysis: z.any(),
  orgContext: z.any(),
});

export type GetDonorInfoInput = z.infer<typeof GetDonorInfoInputSchema>;
export type GetOrganizationContextInput = z.infer<typeof GetOrganizationContextInputSchema>;
export type SummarizeForGenerationInput = z.infer<typeof SummarizeForGenerationInputSchema>;
