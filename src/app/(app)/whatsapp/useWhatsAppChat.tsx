import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/app/lib/trpc/client";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  isTranscribed?: boolean;
  tokensUsed?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export function useWhatsAppChat(phoneNumber: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const utils = trpc.useUtils();

  // Check phone permission to get staff ID
  const { data: permissionData } = trpc.whatsapp.checkPhonePermission.useQuery(
    { phoneNumber },
    { enabled: !!phoneNumber && phoneNumber.length >= 10 }
  );

  // Load conversation history
  const { data: conversationHistory } = trpc.whatsapp.getConversationHistory.useQuery(
    {
      staffId:
        permissionData?.isAllowed && "staffId" in permissionData && permissionData.staffId ? permissionData.staffId : 0,
      phoneNumber: phoneNumber,
      limit: 50,
    },
    {
      enabled: !!permissionData?.isAllowed && "staffId" in permissionData && !!permissionData.staffId && !!phoneNumber,
    }
  );

  // Process test message mutation
  const processTestMessage = trpc.whatsapp.processTestMessage.useMutation();

  // Convert history to chat messages
  useEffect(() => {
    if (conversationHistory?.messages) {
      const chatMessages: ChatMessage[] = conversationHistory.messages.map((msg) => ({
        id: msg.id.toString(),
        content: msg.content,
        role: msg.role as "user" | "assistant",
        timestamp: new Date(msg.createdAt),
        isTranscribed: false, // We don't store this in history currently
        tokensUsed: msg.tokensUsed || undefined,
      }));
      setMessages(chatMessages);
    }
  }, [conversationHistory]);

  const sendMessage = useCallback(
    async (message: string, isTranscribed: boolean) => {
      if (!phoneNumber || phoneNumber.length < 10) {
        toast.error("Invalid phone number", {
          description: "Please enter a valid phone number",
        });
        return;
      }

      setIsLoading(true);

      // Add user message immediately
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        content: message,
        role: "user",
        timestamp: new Date(),
        isTranscribed,
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const result = await processTestMessage.mutateAsync({
          message,
          phoneNumber,
          isTranscribed,
        });

        if (result.success && "response" in result) {
          // Add assistant response
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            content: result.response,
            role: "assistant",
            timestamp: new Date(),
            tokensUsed: result.tokensUsed,
          };
          setMessages((prev) => [...prev, assistantMessage]);

          // Show staff info if available
          if (result.staffInfo) {
            toast.success("Message processed", {
              description: `Staff: ${result.staffInfo.name}`,
            });
          }
        } else if ("error" in result) {
          // Remove the user message on error
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));

          toast.error(result.permissionDenied ? "Permission Denied" : "Error", {
            description: result.error || "Failed to process message",
          });
        }
      } catch (error) {
        // Remove the user message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));

        toast.error("Error", {
          description: error instanceof Error ? error.message : "Failed to send message",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [phoneNumber, processTestMessage]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    isAllowed: permissionData?.isAllowed || false,
    staffName: permissionData && "staffName" in permissionData ? permissionData.staffName : undefined,
  };
}
