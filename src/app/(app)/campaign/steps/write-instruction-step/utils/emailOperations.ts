import { toast } from 'sonner';
import {
  GeneratedEmail,
  GenerateEmailsResponse,
  AgenticFlowResponse,
  EmailGenerationResult,
  EmailOperationResult,
} from '../types';
import { GENERATE_MORE_COUNT } from '../constants';

export async function handleEmailGeneration(params: {
  finalInstruction: string;
  organization: { name: string; writingInstructions?: string | null };
  donorsData: Array<{ id: number; firstName: string; lastName: string; email: string }>;
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousInstruction?: string;
  currentSignature: string;
  smartEmailGeneration: (params: {
    sessionId: number;
    mode: 'generate_more' | 'regenerate_all' | 'generate_with_new_message';
    count?: number;
    newMessage?: string;
  }) => Promise<{
    message: string;
    success: boolean;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    generatedEmailsCount?: number;
  }>;
  smartEmailGenerationStream?: (
    input: {
      sessionId: number;
      mode: 'generate_more' | 'regenerate_all' | 'generate_with_new_message';
      count?: number;
      newMessage?: string;
    },
    onChunk: (chunk: {
      status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
      message?: string;
      result?: any;
    }) => void
  ) => Promise<any>;
  onStreamUpdate?: (update: {
    status: 'generating' | 'generated' | 'reviewing' | 'refining' | 'refined';
    message?: string;
    result?: any;
  }) => void;
  sessionId?: number;
  saveEmailsToSession?: (emails: GeneratedEmail[], sessionId: number) => Promise<void>;
}): Promise<EmailOperationResult | null> {
  const {
    finalInstruction,
    organization,
    donorsData,
    chatMessages,
    previousInstruction,
    currentSignature,
    smartEmailGeneration,
    smartEmailGenerationStream,
    onStreamUpdate,
    sessionId,
    saveEmailsToSession,
  } = params;

  if (!finalInstruction.trim() || !organization || !sessionId) return null;

  let result;

  // Use streaming if available
  if (smartEmailGenerationStream && onStreamUpdate) {
    result = await smartEmailGenerationStream(
      {
        sessionId,
        mode: 'generate_with_new_message',
        newMessage: finalInstruction,
      },
      onStreamUpdate
    );
  } else {
    // Fallback to regular generation
    result = await smartEmailGeneration({
      sessionId,
      mode: 'generate_with_new_message',
      newMessage: finalInstruction,
    });
  }

  // Check if this is an agentic flow response (no emails generated)
  if (result.generatedEmailsCount === 0 && result.chatHistory.length > 0) {
    // This is an agentic conversation - return the AI's response
    const lastMessage = result.chatHistory[result.chatHistory.length - 1];
    // Check if the AI actually provided a meaningful response
    if (lastMessage && lastMessage.content && lastMessage.content.trim() !== '') {
      return {
        type: 'traditional' as const,
        result: { emails: [], sessionId, tokensUsed: 0 },
        updatedChatMessages: result.chatHistory,
        responseMessage: lastMessage.content,
      };
    }
    // If AI response is empty, fall through to treat as email generation attempt
  }

  // Regular flow - emails were generated
  const responseMessage = result.message;

  return {
    type: 'traditional' as const,
    result: { emails: [], sessionId, tokensUsed: 0 }, // Emails will be loaded via getSession
    updatedChatMessages: result.chatHistory,
    responseMessage,
  };
}

export async function handleGenerateMoreEmails(params: {
  organization: { name: string; writingInstructions?: string | null };
  previousInstruction?: string;
  localInstructionRef: React.MutableRefObject<string>;
  allGeneratedEmails: GeneratedEmail[];
  selectedDonors: number[];
  donorsData: Array<{ id: number; firstName: string; lastName: string; email: string }>;
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentSignature: string;
  smartEmailGeneration: (params: {
    sessionId: number;
    mode: 'generate_more' | 'regenerate_all' | 'generate_with_new_message';
    count?: number;
    newMessage?: string;
  }) => Promise<{
    message: string;
    success: boolean;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  }>;
  sessionId?: number;
  saveEmailsToSession?: (emails: GeneratedEmail[], sessionId: number) => Promise<void>;
}): Promise<{ emails: GeneratedEmail[] } | null> {
  const { organization, smartEmailGeneration, sessionId } = params;

  if (!organization || !sessionId) return null;

  // Use the unified smartEmailGeneration API for generating more emails
  // Backend will handle donor selection automatically
  const result = await smartEmailGeneration({
    sessionId,
    mode: 'generate_more',
    count: GENERATE_MORE_COUNT,
  });

  toast.success(result.message);
  return { emails: [] }; // Emails will be loaded via getSession
}
