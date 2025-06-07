"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MentionsInput, Mention } from "react-mentions";
import { cn } from "@/lib/utils";
import { SuggestedMemories } from "./SuggestedMemories";
import "@/app/(app)/campaign/styles.css";

// Types based on WriteInstructionStep and expected props
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Simplified ProjectMentionData to only include id and display
export interface ProjectMentionData {
  id: string;
  display: string;
}

interface ChatInterfaceProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  chatMessages: ChatMessage[];
  isGenerating: boolean;
  isLoadingProjects: boolean;
  projectMentions: ProjectMentionData[];
  suggestedMemories: string[];
  onSubmitInstruction: () => Promise<void>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  instruction,
  onInstructionChange,
  chatMessages,
  isGenerating,
  isLoadingProjects,
  projectMentions,
  suggestedMemories,
  onSubmitInstruction,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (chatMessages.length > 0) {
      scrollToBottom();
    }
  }, [chatMessages]);

  const handleMentionChange = (event: any, newValue: string) => {
    onInstructionChange(newValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isGenerating && instruction.trim()) {
        onSubmitInstruction();
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {chatMessages.map((message, index) => (
            <div
              key={index}
              className={cn("flex flex-col space-y-1", {
                "items-end": message.role === "user",
              })}
            >
              <div
                className={cn("rounded-lg px-3 py-2 max-w-[85%] text-sm", {
                  "bg-primary text-primary-foreground": message.role === "user",
                  "bg-muted text-muted-foreground": message.role === "assistant",
                })}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === "assistant" && suggestedMemories.length > 0 && index === chatMessages.length - 1 && (
                <div className="w-full mt-3">
                  <SuggestedMemories memories={suggestedMemories} />
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background">
        <div className="space-y-3">
          <div className="relative">
            <MentionsInput
              value={instruction}
              onChange={handleMentionChange}
              placeholder={
                isLoadingProjects
                  ? "Loading projects..."
                  : projectMentions.length > 0
                  ? `Enter instructions... (Type @ to mention projects)`
                  : "Enter instructions..."
              }
              className="mentions-input"
              onKeyDown={handleKeyDown}
              singleLine={false}
              classNames={{
                control: "!text-sm !p-2",
                input: "!text-sm",
                suggestions: {
                  list: "!bg-background !border-border !shadow-lg !rounded-md",
                  item: {
                    "&focused": "!bg-muted",
                  },
                },
              }}
            >
              <Mention
                trigger="@"
                data={projectMentions}
                markup="@[__display__](__id__)"
                displayTransform={(id, display) => `@${display}`}
                appendSpaceOnAdd={true}
              />
            </MentionsInput>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={onSubmitInstruction} disabled={isGenerating || !instruction.trim()} size="sm">
              {isGenerating ? "Generating..." : "Generate Emails"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
