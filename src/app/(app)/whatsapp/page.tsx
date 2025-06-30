"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { WhatsAppChatMessage } from "./WhatsAppChatMessage";
import { WhatsAppChatInput } from "./WhatsAppChatInput";
import { useWhatsAppChat } from "./useWhatsAppChat";
import { Phone, RefreshCw } from "lucide-react";

export default function WhatsAppTestingPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isPhoneSet, setIsPhoneSet] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, sendMessage, clearMessages, isAllowed, staffName } = useWhatsAppChat(phoneNumber);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSetPhone = () => {
    if (phoneNumber.trim() && phoneNumber.length >= 10) {
      setIsPhoneSet(true);
    }
  };

  const handleReset = () => {
    setPhoneNumber("");
    setIsPhoneSet(false);
    clearMessages();
  };

  if (!isPhoneSet) {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Testing Interface</CardTitle>
            <CardDescription>
              Test the WhatsApp AI assistant without sending actual WhatsApp messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleSetPhone();
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                Enter the phone number associated with a staff member to test the WhatsApp feature
              </p>
            </div>
            <Button onClick={handleSetPhone} disabled={!phoneNumber.trim() || phoneNumber.length < 10}>
              <Phone className="mr-2 h-4 w-4" />
              Start Chat
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <Card className="h-[calc(100vh-8rem)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>WhatsApp Test Chat</CardTitle>
            <CardDescription>
              Phone: {phoneNumber}
              {isAllowed && staffName && ` • Staff: ${staffName}`}
              {!isAllowed && " • No permission"}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </CardHeader>
        <Separator />
        <CardContent className="flex h-[calc(100%-5rem)] flex-col p-0">
          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground">
                  {isAllowed
                    ? "Send a message to start the conversation"
                    : "This phone number doesn't have permission to use WhatsApp"}
                </div>
              )}
              {messages.map((message) => (
                <WhatsAppChatMessage key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
                    <div className="flex space-x-2">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.3s]"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.15s]"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <WhatsAppChatInput
            onSendMessage={sendMessage}
            isLoading={isLoading}
            placeholder={isAllowed ? "Type a message..." : "No permission to send messages"}
          />
        </CardContent>
      </Card>
    </div>
  );
}