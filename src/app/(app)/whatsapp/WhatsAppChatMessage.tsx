import React from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface WhatsAppChatMessageProps {
  message: {
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
  };
}

export function WhatsAppChatMessage({ message }: WhatsAppChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[70%] rounded-lg px-4 py-2 shadow-sm",
          isUser
            ? "bg-blue-500 text-white"
            : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            "mt-1 text-xs",
            isUser ? "text-blue-100" : "text-gray-500 dark:text-gray-400"
          )}
        >
          <span>{format(message.timestamp, "HH:mm")}</span>
          {message.isTranscribed && (
            <span className="ml-2">(Voice message)</span>
          )}
          {message.tokensUsed && (
            <span className="ml-2">
              • {message.tokensUsed.totalTokens} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  );
}