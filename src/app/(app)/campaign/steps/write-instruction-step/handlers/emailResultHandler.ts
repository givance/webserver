import { GenerateEmailsResponse, AgenticFlowResponse, GeneratedEmail, EmailOperationResult } from "../types";

interface EmailResultData {
  type: "agentic" | "email";
  agenticResult?: {
    conversationMessages: Array<{ role: "user" | "assistant"; content: string }>;
    needsUserInput: boolean;
  };
  emailResult?: {
    emails: GeneratedEmail[];
    refinedInstruction: string;
    updatedChatMessages: Array<{ role: "user" | "assistant"; content: string }>;
    responseMessage: string;
  };
}

export function processEmailResult(result: EmailOperationResult): EmailResultData {
  if (result.type === "agentic") {
    const agenticResult = result.result as AgenticFlowResponse;
    const conversationMessages = agenticResult.conversation.map((msg: any) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
    
    return {
      type: "agentic",
      agenticResult: {
        conversationMessages,
        needsUserInput: agenticResult.needsUserInput,
      },
    };
  } else {
    const emailResult = result.result as GenerateEmailsResponse;
    
    return {
      type: "email",
      emailResult: {
        emails: emailResult.emails,
        refinedInstruction: emailResult.refinedInstruction,
        updatedChatMessages: result.updatedChatMessages.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        responseMessage: result.responseMessage || "",
      },
    };
  }
}

// Keep legacy function for backward compatibility, but mark as deprecated
/** @deprecated Use processEmailResult instead and handle state management in the component */
export async function handleEmailResult(
  result: any,
  emailState: any,
  chatState: any,
  instructionInput: any,
  setIsChatCollapsed?: (collapsed: boolean) => void,
  setIsEmailListExpanded?: (expanded: boolean) => void
) {
  const processedResult = processEmailResult(result);
  
  if (processedResult.type === "agentic" && processedResult.agenticResult) {
    chatState.setChatMessages((prev: any) => [...prev, ...processedResult.agenticResult!.conversationMessages]);

    if (!processedResult.agenticResult.needsUserInput) {
      instructionInput.clearInput();
    }
  } else if (processedResult.type === "email" && processedResult.emailResult) {
    const { emails, refinedInstruction, updatedChatMessages, responseMessage } = processedResult.emailResult;
    
    emailState.setAllGeneratedEmails(emails);
    emailState.setGeneratedEmails(emails);

    // Initialize all emails as pending approval
    const initialStatuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> = {};
    emails.forEach((email: any) => {
      initialStatuses[email.donorId] = "PENDING_APPROVAL";
    });
    emailState.setEmailStatuses(initialStatuses);

    emailState.setReferenceContexts(
      emails.reduce<Record<number, Record<string, string>>>((acc, email: any) => {
        acc[email.donorId] = email.referenceContexts || {};
        return acc;
      }, {})
    );

    chatState.setChatMessages((prev: any) => {
      const newMessages = [...updatedChatMessages, {
        role: "assistant" as const,
        content: responseMessage,
      }];
      // Save chat history immediately without setTimeout to avoid race conditions
      chatState.saveChatHistory(newMessages, refinedInstruction);
      return newMessages;
    });

    instructionInput.clearInput();
    setIsChatCollapsed?.(true);
    setIsEmailListExpanded?.(true);
  }
}