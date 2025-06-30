import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppChatInputProps {
  onSendMessage: (message: string, isTranscribed: boolean) => void;
  isLoading: boolean;
  placeholder?: string;
}

export function WhatsAppChatInput({
  onSendMessage,
  isLoading,
  placeholder = "Type a message...",
}: WhatsAppChatInputProps) {
  const [message, setMessage] = useState("");
  const [isVoiceMode, setIsVoiceMode] = useState(false);

  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim(), isVoiceMode);
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-background p-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={isLoading}
            className="min-h-[60px] max-h-[200px] resize-none"
            rows={2}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant={isVoiceMode ? "default" : "outline"}
            size="icon"
            onClick={() => setIsVoiceMode(!isVoiceMode)}
            title={isVoiceMode ? "Switch to text mode" : "Switch to voice mode"}
          >
            {isVoiceMode ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {isVoiceMode && (
        <p className="mt-2 text-sm text-muted-foreground">
          Voice mode: Your message will be processed as if it was transcribed from audio
        </p>
      )}
    </div>
  );
}