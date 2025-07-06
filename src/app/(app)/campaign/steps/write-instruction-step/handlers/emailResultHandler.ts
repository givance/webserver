import { GenerateEmailsResponse, AgenticFlowResponse } from "../types";

export async function handleEmailResult(
  result: any,
  emailState: any,
  chatState: any,
  instructionInput: any,
  setIsChatCollapsed?: (collapsed: boolean) => void,
  setIsEmailListExpanded?: (expanded: boolean) => void
) {
  if (result.type === "agentic") {
    const agenticResult = result.result as AgenticFlowResponse;
    const conversationMessages = agenticResult.conversation.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));
    chatState.setChatMessages((prev: any) => [...prev, ...conversationMessages]);

    if (!agenticResult.needsUserInput) {
      instructionInput.clearInput();
    }
  } else {
    const emailResult = result.result as GenerateEmailsResponse;
    emailState.setAllGeneratedEmails(emailResult.emails);
    emailState.setGeneratedEmails(emailResult.emails);

    // Initialize all emails as pending approval
    const initialStatuses: Record<number, "PENDING_APPROVAL" | "APPROVED"> = {};
    emailResult.emails.forEach((email: any) => {
      initialStatuses[email.donorId] = "PENDING_APPROVAL";
    });
    emailState.setEmailStatuses(initialStatuses);

    emailState.setReferenceContexts(
      emailResult.emails.reduce<Record<number, Record<string, string>>>((acc, email: any) => {
        acc[email.donorId] = email.referenceContexts || {};
        return acc;
      }, {})
    );

    chatState.setChatMessages((prev: any) => {
      const newMessages = [...result.updatedChatMessages, {
        role: "assistant" as const,
        content: result.responseMessage,
      }];
      // Save chat history immediately without setTimeout to avoid race conditions
      chatState.saveChatHistory(newMessages, emailResult.refinedInstruction);
      return newMessages;
    });

    instructionInput.clearInput();
    setIsChatCollapsed?.(true);
    setIsEmailListExpanded?.(true);
  }
}