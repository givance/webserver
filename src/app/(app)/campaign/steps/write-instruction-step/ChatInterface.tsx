"use client";

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Mail } from "lucide-react";
import { SuggestedMemories } from "../../components/SuggestedMemories";

interface ChatInterfaceProps {
  chatMessages: Array<{ role: "user" | "assistant"; content: string }>;
  suggestedMemories: string[];
  isChatCollapsed: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatInterface({
  chatMessages,
  suggestedMemories,
  isChatCollapsed,
  chatEndRef,
}: ChatInterfaceProps) {
  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4 space-y-3">
        {chatMessages.length === 0 ? (
          <div className={cn(
            "flex items-center justify-center min-h-[300px] transition-opacity duration-300",
            isChatCollapsed && "opacity-0"
          )}>
            <div className="text-center text-muted-foreground">
              <div className="w-10 h-10 mx-auto bg-muted rounded-full flex items-center justify-center mb-2">
                <Mail className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">Start your email generation</p>
              <p className="text-[10px]">Write instructions below to generate personalized emails</p>
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((message, index) => (
              <div
                key={index}
                className={cn("flex flex-col space-y-1", {
                  "items-end": message.role === "user",
                })}
              >
                <div
                  className={cn("rounded-lg px-3 py-2 max-w-[85%]", {
                    "bg-primary text-primary-foreground": message.role === "user",
                    "bg-muted": message.role === "assistant",
                  })}
                >
                  <p className="text-xs whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === "assistant" &&
                  suggestedMemories.length > 0 &&
                  index === chatMessages.length - 1 && (
                    <div className="w-full mt-3">
                      <SuggestedMemories memories={suggestedMemories} />
                    </div>
                  )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </>
        )}
      </div>
    </ScrollArea>
  );
}