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
  }>;
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
    sessionId,
    saveEmailsToSession,
  } = params;

  if (!finalInstruction.trim() || !organization || !sessionId) return null;

  // Use the unified smartEmailGeneration API with new message
  const result = await smartEmailGeneration({
    sessionId,
    mode: 'generate_with_new_message',
    newMessage: finalInstruction,
  });

  const responseMessage =
    "I've generated personalized emails based on each donor's communication history and your organization's writing instructions. You can review them on the left side. Let me know if you'd like any adjustments to the tone, content, or style.";

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
